import assert from 'node:assert/strict';

/** Source projections only: never imports PDFs or creates paid MinerU tasks. */
export async function checkSourceParseWarnings(page, panel) {
  const now = '2026-09-13T00:00:00.000Z';
  const fixtures = [
    { filename: 'mineru-ready.pdf', parser: 'mineru-cloud-v4-vlm', assetization: 'ready' },
    { filename: 'local-fallback.pdf', parser: 'pdfjs', assetization: 'failed' },
    { filename: 'local-active.pdf', parser: 'pdfjs', assetization: 'ready' },
    { filename: 'mineru-retry-failed.pdf', parser: 'mineru-cloud-v4-vlm', assetization: 'failed' },
  ].map((s, i) => ({ id: `src_${String(i + 1).padStart(64, '0')}`, courseId: 'projection-fixture',
    mimeType: 'application/pdf', contentHash: String(i + 1).padStart(64, '0'), byteSize: 1024,
    status: 'ready', chunkCount: 471, pageCount: 24, createdAt: now, updatedAt: now,
    parsing: 'failed', parseWarning: 'vision-failed', parseMode: 'auto', ...s }));
  const url = '**/learning-helper/v2/sessions/*/sources';
  const handler = async route => {
    const response = await route.fetch(); const value = await response.json();
    await route.fulfill({ response, json: { ...value, sources: fixtures } });
  };
  await page.route(url, handler);
  try {
    await panel.getByRole('button', { name: '刷新学习项目', exact: true }).click();
    await panel.getByText('mineru-ready.pdf', { exact: true }).waitFor();
    const card = filename => panel.locator('.lh-sources > li').filter({ has: page.getByText(filename, { exact: true }) });
    for (const filename of ['mineru-ready.pdf', 'mineru-retry-failed.pdf']) {
      const text = await card(filename).innerText();
      assert.match(text, /Ready · 就绪/); assert.match(text, /规范化资料：MinerU Markdown/);
      assert.doesNotMatch(text, /增强解析未完成|配置模型后重新上传/, 'active MinerU replaces the earlier vision warning');
    }
    for (const filename of ['local-fallback.pdf', 'local-active.pdf']) {
      assert.match(await card(filename).innerText(), /增强解析未完成/, 'completed assetization alone cannot hide an active local parsing warning');
    }
    for (const filename of ['local-fallback.pdf', 'mineru-retry-failed.pdf']) {
      assert.match(await card(filename).innerText(), /长期 Markdown 转换失败/, 'a failed MinerU attempt must remain visible');
    }
  } finally {
    await page.unroute(url, handler);
    await panel.getByRole('button', { name: '刷新学习项目', exact: true }).click();
    await panel.getByText('mineru-ready.pdf', { exact: true }).waitFor({ state: 'hidden' });
  }
}

/** Real Host credentials + native client; deliberately never submits a remote MinerU task. */
export async function checkMinerUSettings(page, panel) {
  let credentialPath;
  const observed = response => {
    const path = new URL(response.url()).pathname;
    if (path.endsWith('/mineru-credential')) credentialPath = path;
  };
  page.on('response', observed);
  const fixture = 'mineru-browser-fixture-not-a-real-api-key';
  const settings = () => panel.locator('details').filter({ has: page.locator('summary', { hasText: '配置 MinerU API' }) });
  try {
    await settings().locator('summary').click();
    await settings().getByRole('combobox', { name: 'MinerU 服务', exact: true }).selectOption('cloud');
    const input = settings().getByLabel('MinerU API 密钥', { exact: true });
    assert.equal(await input.getAttribute('type'), 'password');
    await input.fill(fixture);
    await settings().getByRole('checkbox', { name: '启用 MinerU', exact: true }).check();
    await settings().getByRole('button', { name: '保存配置', exact: true }).click();
    await settings().getByText('云端密钥已保存；留空保留原密钥。', { exact: true }).waitFor();
    assert.equal(await input.inputValue(), ''); assert.ok(credentialPath);
    assert.deepEqual(await (await page.request.get(new URL(credentialPath, page.url()).href)).json(), { configured: true, writable: true });
    assert.doesNotMatch(await panel.innerHTML(), /mineru-browser-fixture/);
    assert.ok(!await page.evaluate(value => [...Object.values(localStorage), ...Object.values(sessionStorage)].some(s => String(s).includes(value)), fixture));

    await page.reload({ waitUntil: 'load' });
    await page.locator('[data-learning-helper-brand="name"]').waitFor({ state: 'attached' });
    if (!await panel.isVisible()) await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    await panel.getByRole('button', { name: '资料', exact: true }).click();
    await settings().locator('summary').click();
    await settings().getByText('云端密钥已保存；留空保留原密钥。', { exact: true }).waitFor();
    assert.equal(await settings().getByLabel('MinerU API 密钥', { exact: true }).inputValue(), '');
    assert.equal(await settings().getByRole('combobox', { name: 'MinerU 服务', exact: true }).inputValue(), 'cloud');

    let lost = false;
    const route = '**/learning-helper/v2/sessions/*/mineru-credential';
    await page.route(route, async r => {
      if (r.request().method() === 'POST' && !lost) { lost = true; await r.fetch(); await r.abort('failed'); }
      else await r.continue();
    });
    try {
      await settings().getByLabel('MinerU API 密钥', { exact: true }).fill(fixture + '-replacement');
      await settings().getByRole('button', { name: '保存配置', exact: true }).click();
      await settings().getByRole('alert').waitFor();
      await settings().getByRole('button', { name: '重试', exact: true }).click();
      await settings().getByText('配置已保存。密钥有效性会在首次转换时验证。', { exact: true }).waitFor();
      assert.equal(await settings().getByLabel('MinerU API 密钥', { exact: true }).inputValue(), '');
    } finally { await page.unroute(route); }
    await settings().getByRole('button', { name: '移除云端密钥', exact: true }).click();
    await settings().getByText('尚未配置云端密钥。', { exact: true }).waitFor();
    assert.deepEqual(await (await page.request.get(new URL(credentialPath, page.url()).href)).json(), { configured: false, writable: true });
    // Restore the non-secret starting configuration before the existing PDF regression flow.
    await settings().getByRole('checkbox', { name: '启用 MinerU', exact: true }).uncheck();
    await settings().getByRole('combobox', { name: 'MinerU 服务', exact: true }).selectOption('self-hosted');
    await settings().getByRole('button', { name: '保存配置', exact: true }).click();
    await settings().getByText('配置已保存。', { exact: true }).waitFor();
    await settings().locator('summary').click();
  } finally { page.off('response', observed); }
}
