import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { SqliteEvidenceStore, supportsFts5 } from '../src/providers/evidence-sqlite.js';
import { TextParser } from '../src/providers/text-parser.js';
import { EvidenceService, normalizeText } from '../src/services/evidence.js';
import type { DocumentParser } from '../src/services/evidence.js';
import { openLearning } from './helpers.js';

export const material = await readFile(new URL('../demo/math-analysis/lecture-03.md', import.meta.url), 'utf8');
const input = { filename: 'Lecture 03.md', mimeType: 'text/markdown', text: material };
async function fixture(t: test.TestContext, options: { path?: string; fts?: boolean; parser?: DocumentParser } = {}) {
  const learning = await openLearning();
  await learning.service.createCourse({ id: 'course-a', title: 'Analysis', subject: 'math', dailyMinutes: 60 });
  await learning.service.createCourse({ id: 'course-b', title: 'Other', subject: 'math', dailyMinutes: 60 });
  const store = new SqliteEvidenceStore(options.path ?? ':memory:', options.fts === undefined ? {} : { fts: options.fts });
  const evidence = new EvidenceService(learning.service, store, options.parser ?? new TextParser());
  t.after(async () => { await evidence.close(); await learning.close(); });
  return { learning, store, evidence };
}
async function disk(t: test.TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'lh-evidence-test-')); t.after(() => rm(dir, { recursive: true, force: true }));
  return join(dir, 'evidence.db');
}
test('actual node:sqlite provides FTS5', () => assert.equal(supportsFts5(), true));
for (const fts of [true, false]) test(`bilingual/math retrieval and course isolation with FTS=${fts}`, async t => {
  const h = await fixture(t, { fts });
  await h.evidence.importText('course-a', input);
  await h.evidence.importText('course-b', { ...input, text: 'exclusive secret token 一致连续' });
  for (const query of ['uniform continuity', '一致连续', '闭区间', 'sequence limit', '\\varepsilon']) {
    const result = h.evidence.search({ courseId: 'course-a', query, limit: 20 });
    assert.ok(result.results.length > 0, query);
    const first = result.results[0]!;
    const read = h.evidence.read({ courseId: 'course-a', chunkIds: [first.chunkId] });
    assert.equal(read.chunks[0]!.canonicalRef, first.canonicalRef);
    assert.match(first.citationLabel, /Lecture 03.md.*L\d+–\d+/);
    assert.ok(first.excerpt.length <= 500); assert.doesNotMatch(JSON.stringify(result), /exclusive secret/);
  }
  assert.deepEqual(h.evidence.search({ courseId: 'course-a', query: 'exclusive secret' }).results, []);
  for (const query of ['" OR *', "'); DROP TABLE sources; --", 'text:(', '*', 'AND OR NOT']) {
    assert.doesNotThrow(() => h.evidence.search({ courseId: 'course-a', query }));
  }
  assert.equal(h.evidence.listSources('course-a').length, 1);
});
test('normalized content is deduplicated; first metadata and chunk identities remain canonical', async t => {
  const h = await fixture(t); const first = await h.evidence.importText('course-a', input);
  const again = await h.evidence.importText('course-a', { ...input, filename: 'alias.txt', mimeType: 'text/plain', text: '\uFEFF' + material.replaceAll('\n', '\r\n') });
  assert.equal(again.deduplicated, true); assert.deepEqual(again.source, first.source);
  assert.equal(h.evidence.listSources('course-a').length, 1);
  const other = await h.evidence.importText('course-b', input);
  assert.notEqual(other.source.id, first.source.id);
  assert.equal(other.source.contentHash, first.source.contentHash);
  const parser = new TextParser();
  assert.deepEqual(await parser.parse({ ...input, mimeType: 'text/markdown' }, new AbortController().signal),
    await parser.parse({ ...input, mimeType: 'text/markdown', text: normalizeText(material.replaceAll('\n', '\r\n')) }, new AbortController().signal));
});
test('read is all-or-nothing, scoped, ordered and bounded', async t => {
  const h = await fixture(t); await h.evidence.importText('course-a', input); await h.evidence.importText('course-b', input);
  const ids = h.evidence.search({ courseId: 'course-a', query: '连续', limit: 20 }).results.map(r => r.chunkId);
  assert.ok(ids.length > 1); const reversed = [...ids].reverse();
  assert.deepEqual(h.evidence.read({ courseId: 'course-a', chunkIds: reversed }).chunks.map(c => c.chunkId), reversed);
  assert.throws(() => h.evidence.read({ courseId: 'course-b', chunkIds: ids }), { code: 'not-found' });
  assert.throws(() => h.evidence.read({ courseId: 'course-a', chunkIds: [`chk_${'0'.repeat(64)}`] }), { code: 'not-found' });
  assert.throws(() => h.evidence.read({ courseId: 'course-a', chunkIds: [ids[0], ids[0]] }), { code: 'invalid-input' });
  assert.throws(() => h.evidence.read({ courseId: 'course-a', chunkIds: Array(9).fill(ids[0]) }), { code: 'invalid-input' });
  await h.evidence.importText('course-a', { ...input, text: 'long '.repeat(6500) });
  const long = h.evidence.search({ courseId: 'course-a', query: 'long', limit: 8 });
  assert.throws(() => h.evidence.read({ courseId: 'course-a', chunkIds: long.results.map(c => c.chunkId) }), { code: 'limit-exceeded' });
});
test('invalid ownership, input, filenames and query limits never create sources', async t => {
  const h = await fixture(t);
  for (const bad of [{ ...input, text: ' ' }, { ...input, text: '\ud800' }, { ...input, text: 'a\0b' }, { ...input, filename: '../x.md' }, { ...input, mimeType: 'application/pdf' }, { ...input, raw_sql: 'delete' }]) {
    assert.throws(() => h.evidence.importText('course-a', bad), { code: 'invalid-input' });
  }
  assert.throws(() => h.evidence.importText('course-a', { ...input, text: '数'.repeat(180_000) }), { code: 'limit-exceeded' });
  assert.throws(() => h.evidence.importText('missing', input), { code: 'not-found' });
  for (const args of [{ query: ' ' }, { query: 'x'.repeat(201) }, { query: 'x', limit: 21 }, { query: 'x', limit: 0 }, { query: 'x', limit: 1.5 }]) {
    assert.throws(() => h.evidence.search({ courseId: 'course-a', ...args }), { code: 'invalid-input' });
  }
  assert.deepEqual(h.evidence.listSources('course-a'), []);
});
test('long Unicode lines, headings and line bounds produce lossless stable locators', async t => {
  const h = await fixture(t);
  const text = '# Heading\n' + 'x'.repeat(3988) + '😀'.repeat(5000) + '\n' + 'next\n'.repeat(161);
  const imported = await h.evidence.importText('course-a', { ...input, text });
  assert.ok(imported.source.chunkCount > 4);
  const parser = new TextParser(); const chunks = await parser.parse({ ...input, mimeType: 'text/markdown', text }, new AbortController().signal);
  assert.equal(chunks.map(c => c.text).join(''), text);
  for (const chunk of chunks) { assert.ok(chunk.text.isWellFormed()); assert.ok(chunk.text.length <= 4000); }
});
test('concurrent dedupe refuses in-progress duplicate, then returns a single durable source', async t => {
  const h = await fixture(t);
  const first = h.evidence.importText('course-a', input);
  assert.throws(() => h.evidence.importText('course-a', input), { code: 'conflict' });
  await first;
  assert.equal((await h.evidence.importText('course-a', input)).deduplicated, true);
  assert.equal(h.evidence.listSources('course-a').length, 1);
});
test('parser failure stores failed state and explicit reimport recovers the same source', async t => {
  let fail = true; const parser: DocumentParser = { id: 'text-v1', parse: (input, signal) => fail ? Promise.reject(new Error('parser failed')) : new TextParser().parse(input, signal) };
  const h = await fixture(t, { parser });
  await assert.rejects(h.evidence.importText('course-a', input), /parser failed/);
  const source = h.evidence.listSources('course-a')[0]!; assert.equal(source.status, 'failed');
  assert.deepEqual(h.evidence.search({ courseId: 'course-a', query: '连续' }).results, []);
  fail = false; const retried = await h.evidence.importText('course-a', input);
  assert.equal(retried.source.id, source.id); assert.equal(retried.source.status, 'ready');
});
test('cancel and close stop imports with durable retryable state', async t => {
  const path = await disk(t); const h = await fixture(t, { path });
  const controller = new AbortController(); const pending = h.evidence.importText('course-a', input, controller.signal);
  controller.abort(); await assert.rejects(pending, { code: 'unavailable' });
  assert.equal(h.evidence.listSources('course-a')[0]!.errorCode, 'cancelled');
  const retry = h.evidence.importText('course-a', input); const rejected = assert.rejects(retry, { code: 'unavailable' });
  await h.evidence.close(); await rejected;
  assert.throws(() => h.evidence.search({ courseId: 'course-a', query: 'x' }), { code: 'closed' });
  const reopened = new SqliteEvidenceStore(path); t.after(() => reopened.close());
  assert.equal(reopened.listSources('course-a')[0]!.status, 'failed');
});
test('noncooperative parser has a finite timeout and cannot commit a late result', { timeout: 8000 }, async t => {
  const h = await fixture(t, { parser: { id: 'text-v1', parse: () => new Promise(() => {}) } });
  await assert.rejects(h.evidence.importText('course-a', input), { code: 'unavailable' });
  assert.equal(h.evidence.listSources('course-a')[0]!.errorCode, 'timeout');
});
test('new process reopens searchable sources with unchanged locators and canonical identities', async t => {
  const path = await disk(t); const h = await fixture(t, { path }); await h.evidence.importText('course-a', input);
  const expected = h.evidence.search({ courseId: 'course-a', query: '一致连续', limit: 5 }); await h.evidence.close();
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'tests/evidence-reopen.ts', path], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr); assert.deepEqual(JSON.parse(child.stdout), expected.results);
});
test('interrupted processing is recovered as failed and retried without new identities', async t => {
  const path = await disk(t); const h = await fixture(t, { path });
  await h.evidence.importText('course-a', input); const source = h.evidence.listSources('course-a')[0]!; await h.evidence.close();
  const db = new DatabaseSync(path); db.exec('DELETE FROM chunks');
  db.prepare("UPDATE sources SET status='processing', data=? WHERE id=?").run(JSON.stringify({ ...source, status: 'processing', chunkCount: 0 }), source.id); db.close();
  const store = new SqliteEvidenceStore(path); const e = new EvidenceService(h.learning.service, store, new TextParser()); t.after(() => e.close());
  assert.equal(e.listSources('course-a')[0]!.errorCode, 'interrupted');
  assert.equal((await e.importText('course-a', input)).source.id, source.id);
});
for (const corrupt of ['version', 'text', 'locator', 'source-count', 'unversioned', 'garbage']) test(`corrupt Evidence (${corrupt}) is refused without resetting truth`, async t => {
  const path = await disk(t); const h = await fixture(t, { path }); await h.evidence.importText('course-a', input); await h.evidence.close();
  if (corrupt === 'garbage') { await writeFile(path, 'not a sqlite database'); }
  else {
    const db = new DatabaseSync(path);
    if (corrupt === 'version') db.exec('PRAGMA user_version=99');
    if (corrupt === 'unversioned') db.exec('PRAGMA user_version=0');
    if (corrupt === 'text') db.exec("UPDATE chunks SET text='tampered'");
    if (corrupt === 'locator') db.exec("UPDATE chunks SET locator=json_set(locator,'$.startLine',999)");
    if (corrupt === 'source-count') db.exec("UPDATE sources SET data=json_set(data,'$.chunkCount',99)");
    db.close();
  }
  const before = await readFile(path); assert.throws(() => new SqliteEvidenceStore(path));
  assert.deepEqual(await readFile(path), before);
});
