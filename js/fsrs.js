// FSRS-5 记忆模型（Anki 现在用的复习算法）。只有数学，不管页面和保存，所以可以单独模拟和测试。
// 公式来自 FSRS 的官方说明（open-spaced-repetition/fsrs4anki 的 wiki “The Algorithm”），参数用官方默认值。
//
// 每个词记两个数：
//   stability  稳定性 S（天）：隔 S 天后，还记得的概率正好是 90%。S 越大，记得越牢
//   difficulty 难度 D（1～10）：这个词对这个人有多难。D 越大，答对后 S 涨得越慢
// 每次见到这个词都给一个评分 grade（隔天之后第一次见到用 nextState，同一天里再见到用 sameDayState）：
//   1 = Again 忘了    2 = Hard 勉强记得    3 = Good 记得    4 = Easy 早就会
// 评分、S、D 和“复习时还记得的概率 R”一起决定新的 S 和 D。

// 官方默认参数 w[0]～w[18]（由大量 Anki 复习记录训练出来）。以后有了足够的日志，可以按自己的数据重新训练
const W = [
  0.40255, 1.18385, 3.173, 15.69105,   // w0～w3：新词第一次评分 Again/Hard/Good/Easy 时的初始 S（天）
  7.1949, 0.5345,                      // w4、w5：初始难度
  1.4604, 0.0046,                      // w6：每次评分对难度的影响；w7：难度慢慢回到平均值的速度
  1.54575, 0.1192, 1.01925,            // w8～w10：答对后 S 涨多少
  1.9395, 0.11, 0.29605, 2.2698,       // w11～w14：忘了以后 S 剩多少
  0.2315, 2.9898,                      // w15：Hard 时少涨一些；w16：Easy 时多涨一些
  0.51655, 0.6621,                     // w17、w18：同一天内再次见到（同一组里的复习）时 S 怎么变
];

// 遗忘曲线：上次复习后过了 days 天，还记得的概率 R。
// days = 0 时 R = 1；days = S 时 R = 0.9；之后越降越慢（幂函数，比指数函数更符合真实的遗忘）
const DECAY = -0.5;
const FACTOR = 19 / 81;                // 让 days = S 时 R 正好等于 0.9
export function retrievability(stability, days) {
  return Math.pow(1 + FACTOR * days / stability, DECAY);
}

// 想让“还记得的概率”降到 retention（例如 0.9）时再复习：要隔几天（小数）
export function intervalDays(stability, retention) {
  return (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
}

// 新词第一次评分后的 S 和 D
export function firstState(grade) {
  return { stability: W[grade - 1], difficulty: initialDifficulty(grade) };
}

// 复习一次之后的 S 和 D。state = 原来的 { stability, difficulty }；days = 距上次复习多少天
export function nextState(state, grade, days) {
  const { stability: s, difficulty: d } = state;
  const r = retrievability(s, days);
  return {
    stability: grade === 1 ? forgetStability(s, d, r) : recallStability(s, d, r, grade),
    difficulty: nextDifficulty(d, grade),
  };
}

// 同一天里又见到一次（同一组里的复习）之后的 S 和 D。
// 隔得太近，遗忘曲线用不上，所以 S 只按评分乘一个数：Good ×1.41，Hard ×0.84，Again ×0.50（Easy ×2.37）。
// 难度和隔天复习一样更新：组里连着错，这个词就被当作更难，以后间隔涨得更慢
export function sameDayState(state, grade) {
  return {
    stability: state.stability * Math.exp(W[17] * (grade - 3 + W[18])),
    difficulty: nextDifficulty(state.difficulty, grade),
  };
}

function initialDifficulty(grade) {
  return clampDifficulty(W[4] - Math.exp(W[5] * (grade - 1)) + 1);   // Again ≈ 7.2，Good ≈ 5.3，Easy ≈ 3.2
}

// 难度：Again/Hard 变难，Easy 变容易，Good 不变；越接近 10 变得越慢；再往“Easy 的初始难度”拉回一点点
function nextDifficulty(d, grade) {
  const changed = d - W[6] * (grade - 3) * (10 - d) / 9;
  return clampDifficulty(W[7] * initialDifficulty(4) + (1 - W[7]) * changed);
}

function clampDifficulty(d) {
  return Math.min(Math.max(d, 1), 10);
}

// 答对（Hard/Good/Easy）：S 乘以一个大于 1 的数。这个数在这些情况下更大：
//   词容易（D 小）、现在的 S 还小、复习时已经快忘了（R 低：越难想起来，想起来之后记得越牢）
function recallStability(s, d, r, grade) {
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  const growth = Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1);
  return s * (1 + growth * hardPenalty * easyBonus);
}

// 忘了（Again）：S 变小，但不是从零开始（以前记过，重新记住会快一些）；不会比原来还大
function forgetStability(s, d, r) {
  const after = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(after, s);
}
