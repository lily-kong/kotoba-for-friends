// 所有可以调整的设置都在这里

// ---------- 一组的学习方式 ----------
export const GROUP_SIZE = 12;          // 每组单词数
export const NEW_PER_GROUP = 4;        // 有复习词时，每组的新词数
export const CORRECT_AFTER_MISS = 3;   // 答错后需要再答对的次数
export const REPEAT_GAP = 2;           // 答错的词隔几个别的词之后再出现
export const PAUSE_MS = 1000;          // 答对后停留多久再进入下一个词（毫秒）

// ---------- 复习间隔 ----------
// 复习间隔（天）。复习时答对前进一级，答错回到第一级（1 天 = 24 小时）
export const INTERVAL_DAYS = [1, 2, 4, 7, 14, 30, 60];
// 新词第一次就答对：直接从这一级开始（INTERVAL_DAYS[3] = 7 天）
export const FIRST_CORRECT_LEVEL = 3;
export const DAY_MS = 24 * 60 * 60 * 1000;
