import assert from 'node:assert/strict';
import { join } from 'node:path';

export const uniformFormula = String.raw`\forall \varepsilon > 0,\ \exists \delta > 0,\ \forall x,y\in[a,b],\ |x-y|<\delta \implies |f(x)-f(y)|<\varepsilon`;
export const mathConceptName = String.raw`一致连续 · Uniform Continuity · $\varepsilon$–$\delta$`;
export const mathPlanReason = `阅读课程定义、定理与证明。\n\n$$${uniformFormula}$$`;
export const mathQuestions = [
  [String.raw`连续性要求什么？设 $f$ 在 $a$ 处连续：
\[\lim_{x\to a} f(x)=f(a)\]`, [String.raw`极限等于函数值 $f(a)$`, '极限无需存在'], String.raw`连续性的定义要求 $\lim_{x\to a}f(x)=f(a)$。`],
  [String.raw`连续函数的序列刻画中，\(x_n\to a\) 时？`, [String.raw`$f(x_n)\to f(a)$`, '必定发散'], String.raw`讲义给出了连续性的序列刻画：
$$f(x_n)\longrightarrow f(a).$$`],
  [String.raw`闭区间上的连续函数 $f:[a,b]\to\mathbb{R}$ 是否一致连续？`, ['是', '否'], '闭区间上的连续函数一致连续。'],
  [String.raw`一致连续中的 $\delta$ 是否能依赖点的位置？`, ['不能', '可以'], String.raw`SECRET_EXPLANATION_934：统一的 $\delta$ 不依赖点的位置。`],
  [`Heine-Cantor 定理要求定义域满足什么条件，才能得到下列结论？\n\n$$${uniformFormula}$$`, ['闭区间', '任意开区间'], String.raw`闭区间与连续性给出一致连续，开区间上的 $\frac{1}{x}$ 是反例。`],
];

/** Real shared renderer, fonts and radio DOM in the installed plugin, never a renderer mock. */
export async function checkMathQuiz({ page, panel, form, screenshots }) {
  await form.locator('.lh-prompt .katex').first().waitFor();
  assert.equal(await form.locator('.katex-error').count(), 0);
  const tex = await form.locator('.katex-mathml annotation').allTextContents();
  for (const expected of [String.raw`\lim_{x\to a} f(x)=f(a)`, String.raw`x_n\to a`, String.raw`f(x_n)\to f(a)`, uniformFormula]) {
    assert.ok(tex.includes(expected), `Missing rendered TeX: ${expected}`);
  }
  const options = form.locator('fieldset').first();
  await options.locator('.lh-option .katex').click();
  assert.ok(await options.getByRole('radio').nth(2).isChecked(), 'clicking a formula selects the labeled answer');
  assert.match(await options.getByRole('radio').nth(2).getAttribute('name'), /:/);
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await page.evaluate(() => [...document.fonts].some(f => f.family.includes('KaTeX') && f.status === 'loaded')), 'KaTeX fonts load from Harness assets');
  for (const [width, theme] of [[1440, 'light'], [1024, 'light'], [390, 'light'], [1440, 'dark']]) {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ colorScheme: theme });
    await form.locator('fieldset').last().scrollIntoViewIfNeeded();
    const size = await panel.evaluate(el => ({ width: el.clientWidth, scroll: el.scrollWidth }));
    assert.ok(size.scroll <= size.width + 2, `Math must not widen the learning panel: ${JSON.stringify(size)}`);
    if (width === 390) {
      const scroll = await form.locator('.lh-prompt .katex-display').last().evaluate(el => {
        el.scrollLeft = el.scrollWidth;
        const result = { width: el.clientWidth, scrollWidth: el.scrollWidth, left: el.scrollLeft };
        el.scrollLeft = 0; return result;
      });
      assert.ok(scroll.scrollWidth > scroll.width && scroll.left > 0, 'long formulas remain horizontally scrollable');
    }
    await panel.screenshot({ path: join(screenshots, `math-quiz-${width}-${theme}.png`) });
  }
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.emulateMedia({ colorScheme: 'light' });
}

/** Adversarial display data only; the saved quiz/answer key is never changed. */
export async function checkMathFallback({ page, panel, sessionId, quizId, screenshots }) {
  const routePath = `**/learning-helper/v2/sessions/${sessionId}/quizzes/${quizId}`;
  const invalid = String.raw`\frac{1}{`;
  await page.route(routePath, async route => {
    const response = await route.fetch(); const quiz = await response.json();
    quiz.items[0].prompt = `无法解析的公式仍显示原文：$${invalid}$\n\n` +
      '代码记号：`$literal_math$`；价格：\\$5。\n\n' +
      '<img src="x" onerror="window.mathUnsafe=true"><script>window.mathUnsafe=true</script>\n\n' +
      String.raw`[不安全链接](javascript:window.mathUnsafe=true) $\href{javascript:alert(1)}{unsafe}$`;
    await route.fulfill({ response, json: quiz });
  });
  try {
    await panel.getByRole('button', { name: '练习', exact: true }).click();
    const openFeedback = panel.getByRole('button', { name: '查看反馈', exact: true });
    // The panel remembers its selected quiz; returning to this tab may open it directly.
    if (await openFeedback.count()) await openFeedback.click();
    const prompt = panel.locator('.lh-prompt').first();
    await prompt.locator('.katex-error').waitFor();
    assert.ok((await prompt.locator('.katex-error').innerText()).includes(invalid));
    assert.equal(await prompt.locator('code').innerText(), '$literal_math$');
    assert.match(await prompt.innerText(), /价格：\$5/);
    assert.equal(await prompt.locator('script,img,[onerror],a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => window.mathUnsafe), undefined);
    await panel.screenshot({ path: join(screenshots, 'math-invalid-safe-fallback.png') });
  } finally {
    await page.unroute(routePath);
    await panel.getByRole('button', { name: '计划', exact: true }).click();
  }
}
