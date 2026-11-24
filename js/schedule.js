// 复习算法：决定每组学哪些词，以及学完之后什么时候再复习。
// 记忆的数学在 fsrs.js；这个文件把一组里的作答结果换成 FSRS 的评分，算出下次复习的时间。
// 原始的作答记录在学习日志里（见 storage.js）

import {
  GROUP_SIZE, NEW_PER_GROUP, NEW_WHEN_BACKLOG, DESIRED_RETENTION, MAX_INTERVAL_DAYS, COUNT_SAME_DAY, OLD_INTERVAL_DAYS, DAY_MS,
} from "./config.js";
import { firstState, nextState, sameDayState, retrievability, intervalDays } from "./fsrs.js";
import { words } from "./words.js";

// 选出一组单词：{ fresh: 新词列表, review: 复习词列表 }
// tag = 只学这个分类（首页每个分类的 Study 按钮）；不写 tag = 从全部单词里学（首页上方的 Study 按钮）
export function pickGroup(progress, now, tag = null) {
  const pool = tag ? words.filter((w) => w.tags.includes(tag)) : words;

  // 新词：还没学过的。学全部单词时随机挑；学一个分类时按 words.json 里的顺序（成对的词会挨在一起）
  const unseen = pool.filter((w) => !progress.words[w.id]);
  const fresh = tag ? unseen : shuffle(unseen);

  // 复习词：已经到复习时间的。现在“还记得的概率”最低的（最可能已经忘了的）排最前
  const chance = (w) => recallChance(progress.words[w.id], now);
  const review = pool
    .filter((w) => progress.words[w.id] && progress.words[w.id].due <= now)
    .sort((a, b) => chance(a) - chance(b));

  // 先定新词的位置，剩下的给复习词；复习词不够时，再用新词补满 12 个
  const reviewCount = Math.min(review.length, GROUP_SIZE - newWordCount(review.length, fresh.length));
  const newCount = Math.min(fresh.length, GROUP_SIZE - reviewCount);

  return {
    fresh: fresh.slice(0, newCount),
    review: review.slice(0, reviewCount),
  };
}

// 这一组留几个位置给新词。due = 到期的复习词有几个；fresh = 还有几个新词。
// 只要还有新词，每组至少有一个（不会全是复习，一直有新东西学）：
//   到期的复习词放得下（不超过 12 - 4 = 8 个）→ 4 个新词
//   放不下（积压了）→ 只放 1 个新词，其余位置先消化复习
// 为什么：每个新词之后都要复习好几次。积压时还每组 4 个新词，复习只会越积越多，
// 最后学过很多、记得很少（压力测试见 DEVLOG.md 和 tools/simulate.html）。
// 以后想加规则（例如按时间段、按分类），都加在这个函数里
function newWordCount(due, fresh) {
  const fits = due <= GROUP_SIZE - NEW_PER_GROUP;
  return Math.min(fits ? NEW_PER_GROUP : NEW_WHEN_BACKLOG, fresh);
}

// 打乱顺序（Fisher–Yates 洗牌），返回新数组，原数组不变
export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 一组里每次见到这个词的结果（"right" / "hinted" / "wrong"，见 session.js）→ FSRS 评分。
// 第一次见到：新词第一次出现就答对，说明以前就会（Easy）；复习词答对是正常记得（Good）。
// 组里后面的复习（同一天里又见到）：答对 Good，提示后答对 Hard，看了答案 Again
const NEW_GRADE = { right: 4, hinted: 2, wrong: 1 };
const REVIEW_GRADE = { right: 3, hinted: 2, wrong: 1 };

// 学完一组后，算出一个词新的进度记录
// previous = 这个词原来的记录（新词是 undefined）；results = 这组里每次见到它的结果，按顺序
export function nextRecord(previous, results, now) {
  const [first, ...again] = results;
  let state = previous
    ? nextState(memoryOf(previous), REVIEW_GRADE[first], (now - previous.last) / DAY_MS)
    : firstState(NEW_GRADE[first]);
  if (COUNT_SAME_DAY) {                          // 组里后面的每次作答，也更新 S 和 D（可以在 config.js 关掉）
    for (const result of again) state = sameDayState(state, REVIEW_GRADE[result]);
  }
  // 在“还记得的概率”降到 90% 时复习；最少隔 1 天，最多隔 180 天（再牢的词半年内也一定再见一次）
  const days = Math.round(intervalDays(state.stability, DESIRED_RETENTION));
  const interval = Math.min(Math.max(days, 1), MAX_INTERVAL_DAYS);
  return {
    ...previous,                                 // 保留旧记录里的其他字段（以后可能会加新字段）
    stability: Math.max(round(state.stability), 0.01),   // 不会变成 0（0 会被当成旧记录）
    difficulty: round(state.difficulty),
    level: oldLevel(interval),                   // 只给旧版网页用（见下面 oldLevel）
    due: now + interval * DAY_MS,
    last: now,
    misses: ((previous && previous.misses) || 0) + (first === "right" ? 0 : 1),
  };
}

// 这个词现在还记得的概率（0～1）
function recallChance(record, now) {
  return retrievability(memoryOf(record).stability, Math.max(now - record.last, 0) / DAY_MS);
}

// 一条进度记录的 S 和 D。0.2.5 之前的记录只有 level（旧的阶梯 1, 2, 4, 7, 14, 30, 60 天）：
// 把当时排的间隔当作 S（旧算法正是“隔这么多天应该还记得”），答错过的词算难一点
function memoryOf(record) {
  if (record.stability) return { stability: record.stability, difficulty: record.difficulty };
  const level = Math.min(Math.max(record.level || 0, 0), OLD_INTERVAL_DAYS.length - 1);
  return {
    stability: OLD_INTERVAL_DAYS[level],
    difficulty: firstState(record.misses ? 1 : 3).difficulty,
  };
}

// 旧版网页（手机里可能还缓存着）只认识 level：给它一个和新间隔差不多的 level，旧版也能照常排复习
function oldLevel(interval) {
  let level = 0;
  while (level + 1 < OLD_INTERVAL_DAYS.length && OLD_INTERVAL_DAYS[level + 1] <= interval) level++;
  return level;
}

function round(x) {
  return Math.round(x * 1000) / 1000;
}
