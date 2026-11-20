// 复习算法：决定每组学哪些词，以及学完之后什么时候再复习。
// 以后想换更复杂的算法，主要改这个文件；原始的作答记录在学习日志里（见 storage.js）

import { GROUP_SIZE, NEW_PER_GROUP, INTERVAL_DAYS, FIRST_CORRECT_LEVEL, DAY_MS } from "./config.js";
import { words } from "./words.js";

// 选出一组单词：{ fresh: 新词列表, review: 复习词列表 }
// tag = 只学这个分类（首页每个分类的 Study 按钮）；不写 tag = 从全部单词里学（首页上方的 Study 按钮）
export function pickGroup(progress, now, tag = null) {
  const pool = tag ? words.filter((w) => w.tags.includes(tag)) : words;

  // 新词：还没学过的。学全部单词时随机挑；学一个分类时按 words.json 里的顺序（成对的词会挨在一起）
  const unseen = pool.filter((w) => !progress.words[w.id]);
  const fresh = tag ? unseen : shuffle(unseen);

  // 复习词：已经到复习时间的，过期最久的排最前
  const review = pool
    .filter((w) => progress.words[w.id] && progress.words[w.id].due <= now)
    .sort((a, b) => progress.words[a.id].due - progress.words[b.id].due);

  // 先给新词留 4 个位置，剩下的给复习词；复习词不够时，再用新词补满 12 个
  const reviewCount = Math.min(review.length, GROUP_SIZE - Math.min(NEW_PER_GROUP, fresh.length));
  const newCount = Math.min(fresh.length, GROUP_SIZE - reviewCount);

  return {
    fresh: fresh.slice(0, newCount),
    review: review.slice(0, reviewCount),
  };
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

// 学完一组后，算出一个词新的进度记录
// previous = 这个词原来的记录（新词是 undefined）；missed = 这组里是否答错过
export function nextRecord(previous, missed, now) {
  let level;
  if (missed) {
    level = 0;                                   // 答错：24 小时后复习
  } else if (!previous) {
    level = FIRST_CORRECT_LEVEL;                 // 新词第一次就答对：一周后复习
  } else {
    level = Math.min(previous.level + 1, INTERVAL_DAYS.length - 1);  // 复习答对：前进一级
  }
  return {
    ...previous,                                 // 保留旧记录里的其他字段（以后可能会加新字段）
    level: level,
    due: now + INTERVAL_DAYS[level] * DAY_MS,
    last: now,
    misses: ((previous && previous.misses) || 0) + (missed ? 1 : 0),
  };
}
