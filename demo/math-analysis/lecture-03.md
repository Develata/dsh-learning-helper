# 数学分析复习讲义（原创教学示例）

## Sequence Limits / 数列极限
数列极限（sequence limit）：对每个 ε > 0，存在 N，使 n > N 时 |a_n - L| < ε。
实数中的有界数列存在收敛子列；闭区间中的数列可以取在该区间内收敛的子列。

## Function Limits / 函数极限
函数极限（function limit）：0 < |x-a| < δ 蕴含 |f(x)-L| < ε。

## Continuity / 连续性
函数在 a 连续指 lim_{x→a} f(x)=f(a)，等价地，对任意趋于 a 的定义域内数列 x_n，有 f(x_n)→f(a)。

## Uniform Continuity / 一致连续
一致连续（uniform continuity）的定义：对每个 ε > 0，存在一个 δ > 0，对所有定义域内的 x,y，
只要 |x-y| < δ，就有 |f(x)-f(y)| < ε。δ 不依赖所选的点。
LaTeX: $\forall\varepsilon>0\;\exists\delta>0\;\forall x,y\in[a,b]$。

### Heine-Cantor 定理及证明
假设 a ≤ b 且 f:[a,b]→ℝ 在闭区间上连续。结论：f 在 [a,b] 上一致连续。
直观上，闭且有界排除了逃向无穷或缺失端点的情形，局部连续控制可以统一。
严格证明用反证法：若不一致连续，存在 ε₀>0，对每个正整数 n，可取 x_n,y_n∈[a,b]，
使 |x_n-y_n|<1/n 但 |f(x_n)-f(y_n)|≥ε₀。
由闭区间的紧致性，取 x_{n_k}→c∈[a,b] 的子列。又 |x_{n_k}-y_{n_k}|→0，所以 y_{n_k}→c。
由 c 处连续性，f(x_{n_k})→f(c)、f(y_{n_k})→f(c)，于是差的绝对值趋于 0，与 ≥ε₀ 矛盾。
闭区间与连续性缺一不可：f(x)=1/x 在 (0,1) 连续却不一致连续。
