import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

async function deadline(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label + ' timed out')), 10_000); })]); }
  finally { clearTimeout(timer); }
}

/** Actual packed Web + shipped Chromium. Fixture tools replace only the unavailable LLM. */
export async function browserSmoke({ web, harness, plugin, work, workspacePath, otherWorkspacePath, screenshotsPath, branding = false }) {
  const screenshots = screenshotsPath ?? join(plugin, 'artifacts', 'browser'); await mkdir(screenshots, { recursive: true });
  await writeFile(join(screenshots, 'result.json'), JSON.stringify({ status: 'running', startedAt: new Date().toISOString() }));
  const require = createRequire(join(harness, 'apps/web/package.json'));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', colorScheme: 'light' });
  const [cookieName, ...cookieValue] = web.cookie.split('=');
  await context.addCookies([{ name: cookieName, value: cookieValue.join('='), url: web.base }]);
  const page = await context.newPage(); page.setDefaultTimeout(15_000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(web.base, { waitUntil: 'load' });
    await page.locator('[data-learning-helper-brand="name"]').waitFor({ state: 'attached' });
    if (branding) {
      assert.equal(await page.title(), 'Learning Helper');
      await page.getByRole('dialog', { name: '欢迎使用 Learning Helper' }).waitFor();
      assert.doesNotMatch(await page.locator('body').innerText(), /DSH|DeepSeek Harness|深度求索/);
      const manifest = await (await web.get('/manifest.webmanifest')).json();
      assert.equal(manifest.name, 'Learning Helper'); assert.equal(manifest.short_name, 'Learning Helper');
      const favicon = await (await web.get('/favicon.svg')).text();
      assert.ok(favicon.includes('viewBox="0 0 32 32"'));
      await page.screenshot({ path: join(screenshots, 'branding-welcome.png'), fullPage: true });
    }
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '稍后配置', exact: true }).click();
    await page.addLocatorHandler(page.getByRole('button', { name: '稍后配置', exact: true }), async button => { await button.click(); });
    if (branding) {
      assert.ok(await page.locator('[data-learning-helper-brand="mark"]').count() >= 2, 'sidebar and hero use the learning mark');
      await page.screenshot({ path: join(screenshots, 'branding-home.png'), fullPage: true });
      await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
      await page.getByRole('button', { name: '打开侧边栏', exact: true }).waitFor();
      await page.waitForFunction(() => !document.querySelector('[data-learning-helper-brand="name"]'));
      assert.ok(await page.locator('[data-learning-helper-brand="mark"]').count() >= 2, 'collapsed sidebar retains the learning mark');
      await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
      await page.waitForFunction(() => (document.querySelector('[data-learning-helper-brand="name"]')?.closest('button')?.parentElement?.parentElement?.getBoundingClientRect().width ?? 0) >= 270);
      for (const [width, theme] of [[1440, 'dark'], [1024, 'light'], [390, 'light']]) {
        if (width === 390) {
          // Use the shell's existing collapse action on narrow screens.
          await page.getByRole('button', { name: '收起侧边栏', exact: true }).click();
          await page.waitForFunction(() => !document.querySelector('[data-learning-helper-brand="name"]'));
        }
        await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
        await page.mouse.move(width - 1, 100);
        await page.screenshot({ path: join(screenshots, `branding-home-${width}-${theme}.png`), fullPage: true, animations: 'disabled' });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
      }
      await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ colorScheme: 'light' });
      await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
    }
    await page.getByRole('button', { name: '添加工作区', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '选择工作区目录' });
    await dialog.getByRole('button', { name: '编辑路径', exact: true }).click();
    const cwd = workspacePath ?? join(work, 'student-workspace');
    if (!workspacePath) await mkdir(cwd, { recursive: true });
    await dialog.getByRole('textbox', { name: '编辑路径', exact: true }).fill(cwd);
    await dialog.getByRole('textbox', { name: '编辑路径', exact: true }).press('Enter');
    await dialog.getByRole('button', { name: '打开', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: '选择工作区', exact: true }).filter({ hasText: cwd.split('/').at(-1) }).waitFor();
    await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    const panel = page.locator('.lh-panel');
    await panel.waitFor();
    await panel.getByLabel('课程名称', { exact: true }).fill('数学分析 · 三天复习');
    let createRejected = false;
    await page.route('**/learning-helper/v2/sessions/*/project', async route => {
      if (route.request().method() === 'POST' && !createRejected) { createRejected = true; await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { code: 'invalid-input' } }) }); }
      else await route.continue();
    });
    await panel.getByRole('button', { name: '初始化', exact: true }).click();
    await panel.getByRole('alert').waitFor();
    assert.ok(await panel.getByLabel('课程名称', { exact: true }).isEnabled());
    await panel.getByLabel('课程名称', { exact: true }).fill('数学分析 · 三天复习（修改）');
    await panel.getByLabel('课程名称', { exact: true }).fill('数学分析 · 三天复习');
    await panel.getByRole('button', { name: '初始化', exact: true }).click();
    await panel.getByRole('button', { name: '资料', exact: true }).click();
    await panel.locator('input[type=file]').setInputFiles(join(plugin, 'demo/math-analysis/lecture-03.md'));
    let sourceFailed = false;
    await page.route('**/learning-helper/v2/sessions/*/sources/text', async route => {
      if (!sourceFailed) { sourceFailed = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'PRIVATE_STACK' } }) }); }
      else await route.continue();
    });
    await panel.getByRole('button', { name: '上传资料', exact: true }).click();
    await panel.getByRole('alert').waitFor(); assert.doesNotMatch(await panel.innerText(), /PRIVATE_STACK/);
    await panel.getByRole('button', { name: '重试', exact: true }).click();
    await panel.getByText('Ready · 就绪', { exact: true }).waitFor();
    await panel.getByRole('button', { name: '上传资料', exact: true }).click();
    await panel.getByText('资料已存在，已复用原资料。', { exact: true }).waitFor();
    const probe = await (await web.get('/learning-helper-test/tools')).json();
    const sessionId = probe.sessions.find(s => s.cwd === cwd)?.id; assert.ok(sessionId, JSON.stringify(probe.sessions));
    const courseId = (await (await web.get(`/learning-helper/v2/sessions/${sessionId}/project`)).json()).project.projectId;
    await panel.getByRole('button', { name: '让 Agent 生成 3 天计划', exact: true }).click();
    const composer = page.locator('[data-composer-input][contenteditable=true]');
    await page.waitForFunction(() => document.querySelector('[data-composer-input]')?.textContent?.includes('在当前 Workspace 学习'));
    assert.doesNotMatch(await composer.innerText(), /courseId|workspaceRoot/);
    await composer.press('Control+a'); await composer.press('Backspace');
    const dispatch = async (name, args, record = false) => {
      const response = await web.post('/learning-helper-test/tools', { name, args, sessionId, record });
      assert.equal(response.status, 200, await response.clone().text()); const result = await response.json();
      assert.ok(!result.isError, JSON.stringify(result)); return result.value;
    };
    const search = await dispatch('course_search', { query: '一致连续' });
    const chunkIds = search.results.map(c => c.chunkId);
    await dispatch('course_read', { chunkIds });
    const continuity = await dispatch('course_search', { query: 'Continuity 连续性' });
    const continuityIds = continuity.results.map(c => c.chunkId);
    await dispatch('course_read', { chunkIds: continuityIds });
    await dispatch('course_outline_publish', { concepts: [
      { id: 'continuity', name: '连续性 · Continuity', aliases: [], prerequisiteIds: [], evidenceChunkIds: continuityIds },
      { id: 'uniform', name: '一致连续 · Uniform Continuity', aliases: [], prerequisiteIds: ['continuity'], evidenceChunkIds: chunkIds },
    ] }, true);
    await dispatch('study_plan_publish', { startsOn: new Date().toISOString().slice(0, 10), days: [1,2,3].map(day => ({ day,
      tasks: [{ type: 'learn', conceptIds: ['continuity', 'uniform'], estimatedMinutes: 40, reason: '阅读课程定义、定理与证明。' },
        { type: 'practice', conceptIds: ['uniform'], estimatedMinutes: 20, questionCount: 5, reason: '用练习检查定理假设与反例。' }] })) }, true);
    await panel.getByRole('button', { name: '刷新学习项目', exact: true }).click();
    await panel.getByRole('button', { name: '计划', exact: true }).click();
    await panel.getByRole('heading', { name: '当前计划 · v1', exact: true }).waitFor();
    const questions = [
      ['连续性要求什么？', ['极限等于函数值', '极限无需存在'], '连续性的定义要求极限等于函数值。'],
      ['连续函数的序列刻画中，x_n 趋于 a 时？', ['f(x_n) 趋于 f(a)', '必定发散'], '讲义给出了连续性的序列刻画。'],
      ['闭区间上的连续函数是否一致连续？', ['是', '否'], '闭区间上的连续函数一致连续。'],
      ['一致连续中的 δ 是否能依赖点的位置？', ['不能', '可以'], 'SECRET_EXPLANATION_934：统一的 δ 不依赖点的位置。'],
      ['Heine-Cantor 定理要求定义域满足什么条件？', ['闭区间', '任意开区间'], '闭区间与连续性给出一致连续，开区间上的 1/x 是反例。'],
    ];
    const published = await dispatch('quiz_publish', { purpose: 'Day 1 · 连续与一致连续自测', items: questions.map(([prompt, options, explanation], i) => ({
      prompt, options: [options[1], '以上定义均不适用', options[0]], correctOption: 2, explanation, difficulty: 'medium', conceptIds: [i < 3 ? 'continuity' : 'uniform'], evidenceChunkIds: i < 3 ? continuityIds : chunkIds,
    })) }, true);
    for (let i = 0; i < 10 && await page.locator('[data-turn-process][aria-expanded=false]').count(); i++) await page.locator('[data-turn-process][aria-expanded=false]').first().click();
    const card = page.getByRole('region', { name: '课程练习工具卡片' });
    await card.getByText('5 题练习已生成', { exact: true }).waitFor();
    assert.doesNotMatch(await card.innerHTML(), /correctOption|explanation|SECRET_EXPLANATION_934|Inspect|argsRaw/);
    assert.doesNotMatch(await page.locator('body').innerText(), /correctOption|SECRET_EXPLANATION_934/);
    await card.getByRole('button', { name: '开始练习', exact: true }).click();
    const quizForm = panel.getByRole('form', { name: '自测练习' }); await quizForm.waitFor();
    assert.equal(await page.getByRole('button', { name: '打开学习面板', exact: true }).count(), 1);
    const publicQuiz = await (await web.get(`/learning-helper/v2/sessions/${sessionId}/quizzes/${published.quiz.id}`)).json();
    assert.doesNotMatch(JSON.stringify(publicQuiz), /correctOption|explanation|SECRET_EXPLANATION_934/);
    assert.doesNotMatch(await quizForm.innerHTML(), /correctOption|explanation|SECRET_EXPLANATION_934/);
    const groups = quizForm.locator('fieldset'); assert.equal(await groups.count(), 5);
    await groups.nth(0).getByRole('radio').nth(0).focus();
    await page.keyboard.press('Space'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    assert.ok(await groups.nth(0).getByRole('radio').nth(2).isChecked());
    for (let i=1;i<5;i++) await groups.nth(i).getByRole('radio').nth(i<3 ? 2 : 0).check();
    await page.screenshot({ path: join(screenshots, 'quiz-before-submit.png'), fullPage: true });
    await panel.evaluate(el => el.scrollTo({ top: 0 }));
    await panel.screenshot({ path: join(screenshots, 'product-quiz.png') });
    const submissions = []; let firstReceipt;
    const submitUrl = `**/learning-helper/v2/sessions/${sessionId}/submissions`;
    await page.route(submitUrl, async route => {
      submissions.push(route.request().postDataJSON());
      if (submissions.length === 1) { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'PRIVATE_STACK' } }) }); return; }
      const response = await route.fetch(); const value = await response.json();
      if (submissions.length === 2) { firstReceipt = value; await route.abort('failed'); return; }
      assert.deepEqual(value, firstReceipt); await route.fulfill({ response });
    });
    await quizForm.getByRole('button', { name: '提交练习', exact: true }).click();
    await quizForm.getByRole('alert').waitFor(); assert.doesNotMatch(await quizForm.innerText(), /PRIVATE_STACK/);
    await quizForm.getByRole('button', { name: '重试提交原答案', exact: true }).click();
    await quizForm.getByRole('alert').waitFor();
    await quizForm.getByRole('button', { name: '重试提交原答案', exact: true }).click();
    await quizForm.getByText('已完成 · 答对 3/5 题', { exact: true }).waitFor();
    assert.equal(submissions.length, 3); assert.deepEqual(submissions[0], submissions[1]); assert.deepEqual(submissions[1], submissions[2]);
    assert.equal(firstReceipt.attempts.length, 5); await page.unroute(submitUrl);
    await panel.getByRole('button', { name: '进度', exact: true }).click();
    await panel.getByText('薄弱 · Weak', { exact: true }).waitFor();
    await panel.screenshot({ path: join(screenshots, 'product-progress.png') });
    await panel.getByRole('button', { name: '计划', exact: true }).click();
    await panel.getByRole('heading', { name: '当前计划 · v2', exact: true }).waitFor();
    await panel.getByText('2 条错题证据', { exact: true }).click();
    await panel.getByText('复习 · 20 分钟', { exact: true }).waitFor();
    await panel.getByText('练习 · 10 分钟 · 3 道题', { exact: true }).waitFor();
    for (const [width, theme] of [[1440,'light'],[1024,'light'],[390,'light'],[1440,'dark'],[390,'dark']]) {
      await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
      if (width === 1024) {
        await panel.getByText('分栏空间较小时，可用右上角“全屏”专注学习。', { exact: true }).waitFor();
        await page.getByRole('button', { name: '全屏', exact: true }).click();
      } else if (width === 1440 && await page.getByRole('button', { name: '退出全屏', exact: true }).count()) await page.getByRole('button', { name: '退出全屏', exact: true }).click();
      await page.screenshot({ path: join(screenshots, `plan-${width}-${theme}.png`), fullPage: true });
      if (width === 1440 && theme === 'light') {
        await panel.getByText('2 条错题证据', { exact: true }).click();
        await panel.screenshot({ path: join(screenshots, 'product-plan.png') });
        await panel.getByText('2 条错题证据', { exact: true }).click();
      }
      const dimensions = await panel.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth, page: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert.ok(dimensions.scroll <= dimensions.width + 2, JSON.stringify(dimensions));
      assert.ok(dimensions.page <= dimensions.viewport + 2, JSON.stringify(dimensions));
    }
    await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ colorScheme: 'light' });
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    await panel.getByRole('button', { name: '练习', exact: true }).click();
    if (await panel.getByRole('button', { name: '查看反馈', exact: true }).count()) await panel.getByRole('button', { name: '查看反馈', exact: true }).click();
    await panel.getByText('已完成 · 答对 3/5 题', { exact: true }).waitFor();
    await panel.getByRole('button', { name: '计划', exact: true }).click();
    await panel.getByRole('heading', { name: '当前计划 · v2', exact: true }).waitFor();
    let dashboardFailed = false;
    const dashboardRoute = `**/learning-helper/v2/sessions/${sessionId}/dashboard`;
    await page.route(dashboardRoute, async route => {
      if (!dashboardFailed) { dashboardFailed = true; await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'unavailable', message: 'PRIVATE_STACK' } }) }); }
      else await route.continue();
    });
    await panel.getByRole('button', { name: '刷新学习项目', exact: true }).click();
    await panel.getByRole('alert').waitFor(); assert.doesNotMatch(await panel.innerText(), /PRIVATE_STACK/);
    await panel.getByRole('button', { name: '重试', exact: true }).click();
    await panel.getByRole('heading', { name: '当前计划 · v2', exact: true }).waitFor();
    await page.unroute(dashboardRoute);
    // Workspace navigation is owned by Harness, not a Learning course selector.
    assert.equal(await panel.getByLabel('当前课程', { exact: true }).count(), 0);
    async function chooseWorkspace(path) {
      if (await page.getByRole('button', { name: '退出全屏', exact: true }).count()) await page.getByRole('button', { name: '退出全屏', exact: true }).click();
      if (await page.getByRole('button', { name: '打开侧边栏', exact: true }).count()) await page.getByRole('button', { name: '打开侧边栏', exact: true }).click();
      await page.getByRole('button', { name: '添加工作区', exact: true }).click();
      const picker = page.getByRole('dialog', { name: '选择工作区目录' });
      await picker.getByRole('button', { name: '编辑路径', exact: true }).click();
      await picker.getByRole('textbox', { name: '编辑路径', exact: true }).fill(path);
      await picker.getByRole('textbox', { name: '编辑路径', exact: true }).press('Enter');
      await picker.getByRole('button', { name: '打开', exact: true }).click();
      await picker.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '选择工作区', exact: true }).filter({ hasText: path.split('/').at(-1) }).waitFor();
      // The old session's panel may still be visible while Harness finishes navigation.
      // Both selections open a blank session, whose native sidebar starts closed.
      await panel.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
      await panel.waitFor();
    }
    const otherRoot = otherWorkspacePath ?? join(work, 'other-workspace');
    if (!otherWorkspacePath) await mkdir(otherRoot, { recursive: true });
    let releaseLate; let announceLate;
    const lateStarted = new Promise(r => { announceLate = r; });
    const lateGate = new Promise(r => { releaseLate = r; });
    const staleDashboard = await (await web.get(`/learning-helper/v2/sessions/${sessionId}/dashboard`)).json();
    await page.route(dashboardRoute, async route => { announceLate(); await lateGate; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(staleDashboard) }).catch(() => {}); });
    await panel.getByRole('button', { name: '刷新学习项目', exact: true }).click();
    await deadline(lateStarted, 'late Workspace A request');
    await chooseWorkspace(otherRoot);
    await panel.getByRole('button', { name: '初始化', exact: true }).waitFor();
    releaseLate(); await page.unroute(dashboardRoute);
    assert.doesNotMatch(await panel.innerText(), /薄弱 · Weak|当前计划 · v2/);
    await panel.getByLabel('课程名称', { exact: true }).fill('独立项目 B');
    await panel.getByRole('button', { name: '初始化', exact: true }).click();
    await panel.getByRole('button', { name: '资料', exact: true }).click();
    assert.equal(await panel.locator('.lh-sources li').count(), 0);
    // Pure browser projection fixture for the soft warning; actual 200/201 persistence is tested separately.
    const manySourcesRoute = '**/learning-helper/v2/sessions/*/sources';
    await page.route(manySourcesRoute, async route => {
      const response = await route.fetch(); const value = await response.json();
      value.sources = Array.from({ length: 100 }, (_, i) => ({ id: `fixture-${i}`, filename: `长中文讲义与公式 ε-δ 一致连续性及其应用-${i}.md`, status: 'ready', mimeType: 'text/markdown', chunkCount: 1, parser: 'text-v1' }));
      await route.fulfill({ response, json: value });
    });
    await panel.getByRole('button', { name: '刷新学习项目', exact: true }).click();
    await panel.getByText(/当前 Workspace 已有较多学习资料/).waitFor();
    await page.screenshot({ path: join(screenshots, 'source-soft-limit.png'), fullPage: true });
    await page.unroute(manySourcesRoute);
    await chooseWorkspace(cwd);
    await panel.getByRole('heading', { name: '当前计划 · v2', exact: true }).waitFor();
    // Binary PDF upload exercises the shipped Worker and parser, with capability-gated UI.
    await panel.getByRole('button', { name: '资料', exact: true }).click();
    const { makePdf } = await import('../tests/pdf-fixture.ts');
    const pdf = makePdf([{ text: 'Uniform continuity on compact intervals. Original PDF page evidence.' }, { text: 'A second page contains epsilon and delta in a mathematical statement.' }]);
    await panel.locator('input[type=file]').setInputFiles({ name: 'browser-lecture.pdf', mimeType: 'application/pdf', buffer: Buffer.from(pdf) });
    await panel.getByRole('radio', { name: /本地快速/ }).check();
    await panel.getByRole('button', { name: '上传资料', exact: true }).click();
    const pdfRow = panel.locator('.lh-sources li').filter({ hasText: 'browser-lecture.pdf' });
    await pdfRow.getByText('Ready · 就绪', { exact: true }).waitFor({ timeout: 30_000 });
    assert.match(await pdfRow.innerText(), /2 页.*原始 PDF 已归档/);
    await panel.getByText('配置 MinerU API', { exact: true }).click();
    assert.match(await panel.innerText(), /官方自托管 protocol 2/);
    await panel.getByLabel('服务地址', { exact: true }).fill('http://127.0.0.1:9');
    await panel.getByLabel('启用 MinerU', { exact: true }).check();
    await panel.getByRole('button', { name: '保存配置', exact: true }).click();
    await pdfRow.getByRole('button', { name: '优化为长期 Markdown', exact: true }).click();
    await pdfRow.getByText(/长期 Markdown 转换失败/).waitFor();
    await pdfRow.getByText('Ready · 就绪', { exact: true }).waitFor();
    for (const checkbox of await panel.locator('input[type=checkbox]').all()) { const box = await checkbox.boundingBox(); assert.ok(box && box.width <= 24 && box.height <= 24, 'Checkbox must not inherit full-width text input styling'); }
    await page.screenshot({ path: join(screenshots, 'pdf-enhancement-failed.png'), fullPage: true });
    await panel.getByRole('button', { name: '计划', exact: true }).click();
    // Task-scoped sessions use the real Harness create/select/prompt path and a keyless
    // provider fixture. No model network call, no Browser-to-authoring shortcut.
    await page.setViewportSize({ width: 1440, height: 1000 });
    await panel.getByRole('heading', { name: '当前计划 · v2', exact: true }).waitFor();
    const activeProbe = await (await web.get('/learning-helper-test/tools')).json();
    const activeId = activeProbe.sessions.filter(s => s.cwd === cwd).at(-1)?.id ?? sessionId;
    const sourceRead = await web.post('/learning-helper-test/tools', { sessionId: activeId, name: 'learning_state_get', args: {}, record: true });
    assert.equal(sourceRead.status, 200);
    assert.equal((await web.post('/learning-helper-test/tools', { action: 'select-task-fixture', sessionId: activeId })).status, 200);
    await page.getByText('learning-task-fixture/task-smoke', { exact: true }).first().waitFor({ state: 'attached' });
    if (await page.getByRole('button', { name: '退出全屏', exact: true }).count()) await page.getByRole('button', { name: '退出全屏', exact: true }).click();
    const taskSourceTitle = '任务学习入口 · 保留草稿';
    assert.equal((await web.post('/learning-helper-test/tools', { action: 'rename-task-source', sessionId: activeId })).status, 200);
    const sourceMenuName = `会话“${taskSourceTitle}”的操作`;
    const draftText = '保留在原会话中的草稿，请勿发送';
    await composer.fill(draftText);
    await panel.getByRole('button', { name: /^新会话：Day 1/ }).first().click();
    const fixtureReply = '任务会话已收到学习请求（确定性验收回复，不是实际模型教学）。';
    await page.getByText(fixtureReply, { exact: true }).waitFor();
    const bookmarks = () => page.evaluate(() => JSON.parse(localStorage.getItem('learning-helper:task-sessions:v2') ?? '[]'));
    const firstTask = (await bookmarks())[0];
    assert.equal(firstTask.projectId, courseId); assert.equal(firstTask.phase, 'sent');
    assert.notEqual(firstTask.sessionId, sessionId); assert.equal(firstTask.seed.model.model, 'task-smoke');
    assert.ok(firstTask.prompt.includes('阅读课程定义、定理与证明。'));
    assert.ok(firstTask.prompt.includes('course_search → course_read'));
    let observed = await (await web.get('/learning-helper-test/tools')).json();
    assert.deepEqual(observed.sessions.find(s => s.id === firstTask.sessionId).taskPrompts, [firstTask.prompt]);
    assert.deepEqual(observed.sessions.find(s => s.id === sessionId).taskPrompts, []);
    assert.ok(observed.modelCalls.some(c => c.provider === 'learning-task-fixture' && c.model === 'task-smoke'));
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    await panel.getByRole('button', { name: '继续学习', exact: true }).click();
    await page.getByText(fixtureReply, { exact: true }).waitFor();
    observed = await (await web.get('/learning-helper-test/tools')).json();
    assert.equal(observed.sessions.find(s => s.id === firstTask.sessionId).taskPrompts.length, 1);
    await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    let dropped = false; const requests = [];
    await page.route('**/api/session/prompt', async route => {
      requests.push(route.request().postDataJSON());
      const response = await route.fetch();
      if (!dropped) { dropped = true; await route.abort('failed'); }
      else await route.fulfill({ response });
    });
    await panel.getByRole('button', { name: /^新会话：Day 1/ }).first().click();
    await panel.getByRole('alert').waitFor();
    assert.equal(dropped, true);
    const retryId = (await bookmarks())[0].sessionId;
    await page.reload({ waitUntil: 'load' });
    await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    await panel.getByRole('button', { name: '重试开始', exact: true }).click();
    await page.getByText(fixtureReply, { exact: true }).waitFor();
    observed = await (await web.get('/learning-helper-test/tools')).json();
    assert.equal((await bookmarks()).length, 2);
    assert.equal(observed.sessions.find(s => s.id === retryId).taskPrompts.length, 1);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].payload, requests[1].payload);
    await page.unroute('**/api/session/prompt');
    await page.getByRole('button', { name: '打开学习面板', exact: true }).click();
    await panel.getByText('学习会话 · 2', { exact: true }).click();
    await panel.screenshot({ path: join(screenshots, 'plan-task-sessions.png') });
    // The original composer draft survives creating and sending in other scopes.
    const sourceRow = page.getByRole('treeitem').filter({ has: page.getByRole('button', { name: sourceMenuName, exact: true, includeHidden: true }) }).last();
    // Original title is the workspace fallback; match the actual visible row.
    await sourceRow.click(); assert.equal(await composer.innerText(), draftText);
    assert.deepEqual(errors, []);
    await writeFile(join(screenshots, 'result.json'), JSON.stringify({ status: 'passed', browser: require('playwright/package.json').version,
      courseId, quizId: published.quiz.id, checks: ['create/upload/dedupe','native slots','composer prefill','real tool dispatch and replay cards',
        ...(branding ? ['Learning Helper title/welcome/manifest/favicon', 'brand slots expanded/collapsed and responsive light/dark'] : []),
        'pre-submit public payload and DOM key isolation','submit failure and lost-response retry','weak/v2/revision evidence','refresh feedback','dashboard/source failure recovery','Workspace A/B isolation, stale response and restore','100-source soft warning projection','MinerU connection failure preserves PDF','keyboard radios','PDF binary upload and page metadata','responsive light/dark geometry; native fullscreen at 1024px',
        'task session create and auto-send through real Harness with fixture provider','inherits model selection','task session bookmarks survive refresh','continue does not resend','lost prompt response retries same identity after reload'],
      viewportWidths: [1440,1024,390], pageErrors: errors, semanticLlmRun: false }, null, 2));
    return { sessionId, projectId: courseId, quizId: published.quiz.id };
  } catch (error) {
    await writeFile(join(screenshots, 'result.json'), JSON.stringify({ status: 'failed', error: String(error), pageErrors: errors }));
    await page.screenshot({ path: join(screenshots, 'failure.png'), fullPage: true }).catch(() => {});
    await writeFile(join(screenshots, 'failure.txt'), `${String(error)}\nPAGE ERRORS: ${JSON.stringify(errors)}\n${await page.locator('body').innerText().catch(() => '')}`);
    throw error;
  } finally { await context.close(); await browser.close(); }
}
