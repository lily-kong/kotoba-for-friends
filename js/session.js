// 一组之内的出题顺序。只管“下一个出哪个词”，和画面无关（所以可以单独模拟和测试）。
//
// 每次出现的结果有三种（result）：
//   "right"  不用提示就答对
//   "hinted" 按了 1 次 Hint（看到字数和第一个假名）后答对
//   "wrong"  按了 2 次 Hint，看了答案
// 第一次出现就 "right"：学会了，本组不再出现。
// 否则要复习，需要复习答对的次数看用了多少提示（相当于权重：1 次提示 = 半个错）：
//   "hinted" → 之后答对 PASSES_AFTER_HINT（1）次就学会；"wrong" → 答对 PASSES_AFTER_WRONG（2）次才学会。
//   复习时又看了答案（"wrong"），要求提高到 2 次。复习满 MAX_REVIEWS 次，不管怎样都算通过。
//   例（看了答案之后）：对 对 → 通过；对 错 对 → 通过；对 错 错 → 再出第 4 次，不管对错都通过
// 间隔：没答对后隔 GAP_AFTER_MISS 个位置（= 三个词一组），复习答对后隔 GAP_AFTER_CORRECT 个位置。
//
// 出下一个词时按顺序判断：
//   1. 有刚答错、到点了的词（答错后的第一次复习）→ 马上出。前三个都错时就是 A B C a b c
//   2. 有到点的复习词 → 出它；但如果上一个也是复习词、而且可以出新词，就先出一个新词，
//      让新词和复习词交替
//   3. 可以出新词（还有新词，并且“还没学会”的词不到 MAX_STRUGGLING 个）→ 出新词
//   4. 都不行（新词用完了，错词都还没到点）→ 从还没学会的错词里，挑最久没出现的提前出。
//      这样只要还剩 3 个以上没学会的词，同一个词两次出现之间至少隔 2 个别的词；
//      只剩 1～2 个词时，才会连着或交替出现

import {
  PASSES_AFTER_HINT, PASSES_AFTER_WRONG, MAX_REVIEWS, GAP_AFTER_MISS, GAP_AFTER_CORRECT, MAX_STRUGGLING,
} from "./config.js";

// 开始一组。words 的顺序就是新词出现的顺序
export function createSession(words) {
  const items = words.map((word) => ({
    word: word,
    seen: false,       // 出现过没有
    done: false,       // 学会了没有（学会了本组就不再出现）
    missed: false,     // 本组答错过没有（结束时用来安排长期复习）
    reviews: 0,        // 答错之后复习了几次
    passed: 0,         // 复习时答对了几次
    needed: 0,         // 复习时需要答对几次才学会
    due: 0,            // 最早在第几个位置可以再出现
    lastShown: -1,     // 上一次在第几个位置出现
  }));
  return {
    items: items,              // 本组全部条目
    fresh: items.slice(),      // 还没出现过的
    learning: [],              // 答错了、还没通过的
    step: 0,                   // 现在是第几个位置
    lastWasRepeat: false,      // 上一个出的是不是复习词
  };
}

// 本组学会了几个（进度条用）
export function clearedCount(session) {
  return session.items.filter((item) => item.done).length;
}

export function isDone(session) {
  return session.fresh.length === 0 && session.learning.length === 0;
}

// 下一个出哪个词；本组结束了就返回 null
export function nextItem(session) {
  if (isDone(session)) return null;
  const due = session.learning
    .filter((item) => item.due <= session.step)
    .sort((a, b) => a.due - b.due);                              // 过期最久的排最前
  const firstReview = due.find((item) => item.reviews === 0);
  if (firstReview) return firstReview;                           // 规则 1

  const canAddNew = session.fresh.length > 0 && session.learning.length < MAX_STRUGGLING;
  if (due.length > 0 && !(session.lastWasRepeat && canAddNew)) return due[0];   // 规则 2
  if (canAddNew) return session.fresh[0];                        // 规则 3
  if (due.length > 0) return due[0];

  // 规则 4：错词都还没到点，也不能出新词 → 挑最久没出现的错词提前出
  return session.learning.reduce((a, b) => (b.lastShown < a.lastShown ? b : a));
}

// 记录这一次出现的结果：result = "right" / "hinted" / "wrong"（见文件开头）
// 返回 "learned" = 这一刻学会了（第一次就答对，或者复习答对满了要求的次数）；
//      "finished" = 复习满 MAX_REVIEWS 次、没有答对够次数，也算通过；其他情况返回 null
export function answer(session, item, result) {
  const isReview = session.learning.includes(item);
  const right = result === "right";
  let outcome = null;
  session.lastWasRepeat = item.seen;
  if (!item.seen) session.fresh = session.fresh.filter((other) => other !== item);

  if (isReview) {
    item.reviews += 1;
    if (right) item.passed += 1;
    if (result === "wrong") item.needed = Math.max(item.needed, PASSES_AFTER_WRONG);   // 又看了答案：要求提高
    if (item.passed >= item.needed) {
      outcome = "learned";
    } else if (item.reviews >= MAX_REVIEWS) {
      outcome = "finished";
    } else {
      item.due = session.step + (right ? GAP_AFTER_CORRECT : GAP_AFTER_MISS);
    }
    if (outcome) {
      item.done = true;                                          // 通过，本组不再出现
      session.learning = session.learning.filter((other) => other !== item);
    }
  } else if (right) {
    item.done = true;                                            // 第一次出现就答对
    outcome = "learned";
  } else {
    // 第一次出现没有直接答对：开始复习。需要答对几次，看用了多少提示
    item.missed = true;
    item.needed = result === "hinted" ? PASSES_AFTER_HINT : PASSES_AFTER_WRONG;
    item.due = session.step + GAP_AFTER_MISS;
    session.learning.push(item);
  }
  item.seen = true;
  item.lastShown = session.step;
  session.step += 1;
  return outcome;
}
