// 所有可以调整的设置都在这里

// ---------- 一组的学习方式 ----------
export const GROUP_SIZE = 12;          // 每组单词数
export const NEW_PER_GROUP = 4;        // 有复习词时，每组的新词数
export const AFTER_SOUND_MS = 500;     // 读音结束后，再停多久进入下一个词（毫秒）
export const PAUSE_MS = 1000;          // 答对后至少停留多久（毫秒；没有读音时也会停这么久）
export const GHOST_MIN_KANA = 3;       // 提示时显示第一个假名，只对 3 个假名以上的词（短词只提示长度）

// ---------- 一组之内的出题顺序（js/session.js） ----------
// 没有直接答对的词要复习。需要复习答对几次，看这一次用了多少提示：
export const PASSES_AFTER_HINT = 1;         // 按了 1 次 Hint 后答对 → 之后复习答对 1 次就学会
export const PASSES_AFTER_WRONG = 2;        // 按了 2 次 Hint、看了答案 → 之后复习答对 2 次才学会
export const MAX_REVIEWS = 4;               // 最多复习几次；满了也算通过（但不放答对音效）
export const GAP_AFTER_MISS = 3;            // 答错后，隔 3 个位置再出现 = 三个词一组（前三个都错 → A B C a b c）
export const GAP_AFTER_CORRECT = 4;         // 复习答对后，隔 4 个位置再出现
export const MAX_STRUGGLING = 4;            // 同时“还没学会”的词最多几个；到了上限就先不出新词，减轻负担

// ---------- 复习间隔 ----------
// 复习间隔（天）。复习时答对前进一级，答错回到第一级（1 天 = 24 小时）
export const INTERVAL_DAYS = [1, 2, 4, 7, 14, 30, 60];
// 新词第一次就答对：直接从这一级开始（INTERVAL_DAYS[3] = 7 天）
export const FIRST_CORRECT_LEVEL = 3;
export const DAY_MS = 24 * 60 * 60 * 1000;
