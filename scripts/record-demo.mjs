import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const run = promisify(execFile);
const WIDTH = 1280; const HEIGHT = 900;
const math = String.raw`\forall\varepsilon>0,\ \exists\delta>0:\quad |x-y|<\delta\Rightarrow |f(x)-f(y)|<\varepsilon`;
const questions = [
  { prompt: String.raw`函数 $f$ 在 $a$ 处连续，需要满足什么？
\[\lim_{x\to a}f(x)=f(a)\]`, options: [String.raw`极限存在且等于 $f(a)$`, '极限无需存在', '函数值必须等于零'],
    correctOption: 0, explanation: String.raw`连续要求 $\lim_{x\to a}f(x)=f(a)$。极限与函数在该点的值必须一致。`, concept: 'continuity' },
  { prompt: String.raw`若 $x_n\to a$，连续性给出怎样的序列刻画？`, options: [String.raw`$f(x_n)\to f(a)$`, String.raw`$f(x_n)\to\infty$`, '不能确定任何极限'],
    correctOption: 0, explanation: String.raw`在 $a$ 处连续时，任意趋于 $a$ 的定义域内序列，其函数值都趋于 $f(a)$。`, concept: 'continuity' },
  { prompt: String.raw`连续性与一致连续性有什么共同点？`, options: ['都控制自变量接近时函数值的变化', '都要求函数必须是常数', '都要求定义域必须是闭区间'],
    correctOption: 0, explanation: String.raw`二者都用 $\varepsilon$–$\delta$ 控制变化；关键区别是 $\delta$ 能否依赖所选位置。`, concept: 'continuity' },
  { prompt: String.raw`一致连续中的 $\delta$ 能否依赖点的位置？`, options: ['不能，只能依赖误差要求', '可以随每个点单独变化', '必须恒等于 1'],
    correctOption: 0, explanation: String.raw`一致连续要求同一个 $\delta$ 对整个定义域内的点都有效，而不是每个点各选一个。`, concept: 'uniform' },
  { prompt: String.raw`Heine–Cantor 定理中，连续函数 $f:[a,b]\to\mathbb{R}$ 为什么一定一致连续？`, options: ['闭区间紧致，可得到统一的控制', '任意开区间上的连续函数都一致连续', '只要函数有界就一定一致连续'],
    correctOption: 0, explanation: String.raw`闭区间的紧致性与连续性共同保证一致连续。反例 $f(x)=1/x$ 在 $(0,1)$ 连续，却不一致连续。`, concept: 'uniform' },
];
function stamp(seconds, separator = ',') {
  const ms = Math.round(seconds * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}${separator}${String(ms % 1000).padStart(3, '0')}`;
}

/** Recording fixture only. Installed tools/Host/UI own all persisted state and grading.
 * No production route, UI overlay or synthetic autonomous-model claim is introduced.
 */
export async function recordDemo({ web, harness, plugin, work, output }) {
  await mkdir(output, { recursive: true });
  await run('ffmpeg', ['-version']);
  const require = createRequire(join(harness, 'apps/web/package.json'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, locale: 'zh-CN', colorScheme: 'light',
    recordVideo: { dir: join(output, 'raw'), size: { width: WIDTH, height: HEIGHT } } });
  const [name, ...value] = web.cookie.split('=');
  await context.addCookies([{ name, value: value.join('='), url: web.base }]);
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  const started = performance.now(); const time = () => (performance.now() - started) / 1000;
  const video = page.video(); const cues = []; const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const scene = text => { cues.push({ time: time(), text }); console.log(`Demo scene ${cues.length}: ${text}`); };
  const panel = page.locator('.lh-panel');
  const show = async (element, milliseconds = 3000) => { await element.scrollIntoViewIfNeeded(); await delay(milliseconds); };
  const screenshot = async name => {
    await page.mouse.move(WIDTH - 5, HEIGHT - 5);
    await page.evaluate(() => document.fonts.ready);
    await panel.screenshot({ path: join(output, `${name}.png`), animations: 'disabled' });
  };
  let receipt; let end;
  try {
    await page.goto(web.base, { waitUntil: 'load' });
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '稍后配置', exact: true }).click();
    await page.addLocatorHandler(page.getByRole('button', { name: '稍后配置', exact: true }), async b => b.click());
    // Setup stays outside the edited video: no launch token or temporary directory picker.
    const workspace = join(work, '数学分析'); await mkdir(workspace);
    await page.getByRole('button', { name: '添加工作区', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '选择工作区目录' });
    await picker.getByRole('button', { name: '编辑路径', exact: true }).click();
    await picker.getByRole('textbox', { name: '编辑路径', exact: true }).fill(workspace);
    await picker.getByRole('textbox', { name: '编辑路径', exact: true }).press('Enter');
    await picker.getByRole('button', { name: '打开', exact: true }).click();
    await picker.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    await panel.getByRole('heading', { name: '在此 Workspace 启用 Learning Helper' }).waitFor();
    await page.getByRole('button', { name: '全屏', exact: true }).click();
    await page.mouse.move(WIDTH - 5, HEIGHT - 5);
    await delay(800);
    scene('Learning Helper v0.2｜把今天的错题，变成明天的学习计划'); await delay(5000);
    scene('一个 Workspace，就是一个独立学习项目');
    await panel.getByLabel('课程名称', { exact: true }).pressSequentially('数学分析 · 三天复习', { delay: 110 });
    await delay(2200); await panel.getByRole('button', { name: '初始化', exact: true }).click();
    await panel.getByRole('button', { name: '资料', exact: true }).click();
    scene('上传课程讲义：回答、概念与练习都有资料依据');
    await panel.locator('input[type=file]').setInputFiles(join(plugin, 'demo/math-analysis/lecture-03.md'));
    await delay(1500); await panel.getByRole('button', { name: '上传资料', exact: true }).click();
    await panel.getByText('Ready · 就绪', { exact: true }).waitFor(); await delay(4000);
    const probe = await (await web.get('/learning-helper-test/tools')).json();
    const sessionId = probe.sessions.find(s => s.cwd === workspace)?.id; assert.ok(sessionId);
    const api = `/learning-helper/v2/sessions/${sessionId}`;
    const projectId = (await (await web.get(api + '/project')).json()).project.projectId;
    const dispatch = async (name, args) => {
      const response = await web.post('/learning-helper-test/tools', { name, args, sessionId, record: true });
      assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.isError, false, JSON.stringify(result)); return result.value;
    };
    scene('真实检索与发布工具；本视频采用确定性演示数据');
    const a = await dispatch('course_search', { query: 'Continuity 连续性' });
    const b = await dispatch('course_search', { query: '一致连续' });
    const continuityIds = a.results.slice(0, 2).map(c => c.chunkId); const uniformIds = b.results.slice(0, 2).map(c => c.chunkId);
    assert.ok(continuityIds.length && uniformIds.length);
    await dispatch('course_read', { chunkIds: [...new Set([...continuityIds, ...uniformIds])] });
    await delay(4500);
    await dispatch('course_outline_publish', { concepts: [
      { id: 'continuity', name: '连续性 · Continuity', aliases: [], prerequisiteIds: [], evidenceChunkIds: continuityIds },
      { id: 'uniform', name: String.raw`一致连续 · Uniform Continuity · $\varepsilon$–$\delta$`, aliases: [], prerequisiteIds: ['continuity'], evidenceChunkIds: uniformIds },
    ] });
    await dispatch('study_plan_publish', { startsOn: new Date().toISOString().slice(0, 10), days: [1, 2, 3].map(day => ({ day, tasks: [
      { type: 'learn', conceptIds: day === 1 ? ['continuity'] : ['uniform'], estimatedMinutes: 40,
        reason: day === 1 ? '先理解连续性的定义，再建立一致连续的比较基础。' : `复习课程定义、定理假设和严格证明。\n\n$$${math}$$` },
      { type: 'practice', conceptIds: ['continuity', 'uniform'], estimatedMinutes: 20, questionCount: 5, reason: '用概念题和反例检查理解，依据结果安排后续复习。' },
    ] })) });
    await panel.getByRole('button', { name: '刷新学习项目', exact: true }).click();
    await panel.getByRole('button', { name: '计划', exact: true }).click();
    await panel.getByRole('heading', { name: '当前计划 · v1', exact: true }).waitFor();
    scene('3 天，每天 60 分钟；每个计划任务都可打开独立学习会话');
    await show(panel.locator('.lh-days'), 8000);
    const quiz = await dispatch('quiz_publish', { purpose: 'Day 1 · 连续与一致连续自测', items: questions.map(({ concept, ...item }) => ({
      ...item, conceptIds: [concept], evidenceChunkIds: concept === 'continuity' ? continuityIds : uniformIds, difficulty: 'medium',
    })) });
    await panel.getByRole('button', { name: '刷新学习项目', exact: true }).click();
    await panel.getByRole('button', { name: '练习', exact: true }).click();
    await panel.getByRole('button', { name: '开始练习', exact: true }).click();
    const form = panel.getByRole('form', { name: '自测练习' }); await form.waitFor();
    const publicQuiz = await (await web.get(`${api}/quizzes/${quiz.quiz.id}`)).json();
    assert.doesNotMatch(JSON.stringify(publicQuiz), /correctOption|explanation/);
    assert.equal(await form.locator('.katex-error').count(), 0);
    scene('数学公式直接渲染；提交前不显示答案和解析');
    await panel.evaluate(el => el.scrollTo({ top: 0 })); await delay(5000); await screenshot('quiz');
    const groups = form.locator('fieldset'); assert.equal(await groups.count(), 5);
    for (let i = 0; i < 5; i++) {
      if (i === 3) scene('故意答错两道一致连续题，观察系统接下来如何调整');
      await show(groups.nth(i), i < 3 ? 2800 : 4000);
      await groups.nth(i).getByRole('radio').nth(i < 3 ? 0 : 1).check(); await delay(1000);
    }
    scene('提交作答，由持久化答案键确定性评分');
    await show(form.getByRole('button', { name: '提交练习', exact: true }), 1500);
    await form.getByRole('button', { name: '提交练习', exact: true }).click();
    await form.getByText('已完成 · 答对 3/5 题', { exact: true }).waitFor();
    await show(form.locator('.lh-feedback').nth(3), 6500);
    await panel.getByRole('button', { name: '进度', exact: true }).click();
    await panel.getByText('薄弱 · Weak', { exact: true }).waitFor();
    await panel.evaluate(el => el.scrollTo({ top: 0 }));
    scene('两次错误形成学习证据：一致连续被标记为 Weak');
    await delay(6500); await screenshot('progress');
    await panel.getByRole('button', { name: '计划', exact: true }).click();
    await panel.getByRole('heading', { name: '当前计划 · v2', exact: true }).waitFor();
    scene('计划 v1 → v2：明天增加 20 分钟复习和 3 道针对题');
    await panel.evaluate(el => el.scrollTo({ top: 0 })); await delay(9000); await screenshot('plan');
    await panel.getByText('2 条错题证据', { exact: true }).click();
    await show(panel.getByRole('region', { name: '为什么计划改变' }), 6000);
    const dashboard = await (await web.get(api + '/dashboard')).json();
    assert.equal(dashboard.currentPlan.version, 2);
    assert.equal(dashboard.concepts.find(c => c.id === 'uniform').status, 'weak');
    assert.ok(dashboard.recentRevisionTasks.some(t => t.task.estimatedMinutes === 20));
    assert.ok(dashboard.recentRevisionTasks.some(t => t.task.questionCount === 3));
    await panel.getByRole('button', { name: '资料', exact: true }).click();
    const { makePdf } = await import('../tests/pdf-fixture.ts');
    const pdf = makePdf([{ text: 'Uniform Continuity. The same delta works for every point of the domain.' }, { text: 'Heine Cantor: continuous functions on compact intervals are uniformly continuous.' }]);
    scene('v0.2 支持 PDF：本地快速解析，保留原件与真实页码');
    await panel.locator('input[type=file]').setInputFiles({ name: 'lecture-04.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
    await panel.getByRole('radio', { name: /本地快速/ }).check(); await delay(4500);
    await panel.getByRole('button', { name: '上传资料', exact: true }).click();
    const pdfRow = panel.locator('.lh-sources li').filter({ hasText: 'lecture-04.pdf' });
    await pdfRow.getByText('Ready · 就绪', { exact: true }).waitFor({ timeout: 30_000 });
    assert.match(await pdfRow.innerText(), /2 页.*原始 PDF 已归档/);
    await show(pdfRow, 7000);
    // Return to the source overview with the completed records visible, not the upload form.
    await panel.getByRole('button', { name: '计划', exact: true }).click();
    await panel.getByRole('button', { name: '资料', exact: true }).click();
    await panel.evaluate(el => el.scrollTo({ top: 0 })); await delay(3000); await screenshot('sources');
    scene('刷新后，练习反馈、薄弱点与新计划仍然保留');
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    if (await page.getByRole('button', { name: '全屏', exact: true }).count()) await page.getByRole('button', { name: '全屏', exact: true }).click();
    await panel.getByRole('heading', { name: '当前计划 · v2', exact: true }).waitFor(); await delay(5000);
    scene('每次练习，都成为下一步学习的依据。'); await delay(7000);
    end = time(); assert.deepEqual(errors, []);
    receipt = { sessionId, projectId, quizId: quiz.quiz.id };
  } finally { await context.close(); await browser.close(); }
  const raw = await video.path();
  const start = cues[0].time; const duration = end - start;
  const timeline = cues.map((cue, i) => ({ start: cue.time - start, end: (cues[i + 1]?.time ?? end) - start, text: cue.text }));
  const srt = timeline.map((cue, i) => `${i + 1}\n${stamp(cue.start)} --> ${stamp(cue.end)}\n${cue.text}\n`).join('\n');
  await writeFile(join(output, 'captions.srt'), srt);
  await writeFile(join(output, 'captions.vtt'), 'WEBVTT\n\n' + timeline.map(c => `${stamp(c.start, '.')} --> ${stamp(c.end, '.')}\n${c.text}\n`).join('\n'));
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${WIDTH}\nPlayResY: ${HEIGHT + 84}\nWrapStyle: 2\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Droid Sans Fallback,23,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,2,24,24,17,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  await writeFile(join(output, 'captions.ass'), ass + timeline.map(c => `Dialogue: 0,${stamp(c.start, '.').slice(0, -1)},${stamp(c.end, '.').slice(0, -1)},Default,,0,0,0,,${c.text}`).join('\n') + '\n');
  // Caption band is added outside the captured UI, leaving all product content intact.
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(start), '-i', raw, '-t', String(duration),
    '-vf', `pad=iw:ih+84:0:0:color=0x101923,subtitles=captions.ass,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text='v0.2  |  Recorded browser demo  |  Deterministic fixture':fontsize=12:fontcolor=0xA8B7C6:x=18:y=h-76`,
    '-an', '-c:v', 'libx264', '-crf', '25', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-r', '25', join(output, 'learning-helper-v02.mp4')],
    { cwd: output, timeout: 120_000, maxBuffer: 1024 * 1024 });
  await writeFile(join(output, 'recording.json'), JSON.stringify({ pluginVersion: '0.2.0-dev',
    pluginSha: (await run('git', ['rev-parse', 'HEAD'], { cwd: plugin })).stdout.trim(),
    capturedAt: new Date().toISOString(), durationSeconds: duration, viewport: { width: WIDTH, height: HEIGHT },
    video: 'learning-helper-v02.mp4', screenshots: ['quiz.png', 'plan.png', 'progress.png', 'sources.png'],
    semanticLlmRun: false, browser: 'Chromium', checks: ['real installed Host/tools', 'public answer-key isolation', '3/5 grading', 'Weak', 'plan v2', '20 min review + 3 questions', 'PDF archive/pages', 'refresh'],
    pageErrors: errors, timeline }, null, 2) + '\n');
  return receipt;
}
