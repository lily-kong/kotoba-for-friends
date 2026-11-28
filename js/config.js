// 所有可以调整的设置都在这里

// ---------- 词表 ----------
// 暂时隐藏的分类：这些分类的词不出现在首页，也不会被学到（只属于隐藏分类的词才隐藏）。
// 已经学过的进度和日志都留在手机里，从这里删掉分类名，就原样恢复
export const HIDDEN_TAGS = ["Doshi_hoka"];

// ---------- 一组的学习方式 ----------
export const GROUP_SIZE = 12;          // 每组单词数（汉字模式：读法题 + 小词一共不超过这么多）
export const MAX_KANJI_PER_GROUP = 4;  // 汉字模式：每组最多几个汉字（js/kanjischedule.js）
export const NEW_PER_GROUP = 4;        // 每组的新词数（到期的复习词不多，放得下的时候）
export const NEW_WHEN_BACKLOG = 1;     // 到期的复习词太多、一组放不下时，每组只放几个新词（至少 1 个，一直有新东西学）
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

// ---------- 隔天之后的复习（js/schedule.js、js/fsrs.js） ----------
export const DESIRED_RETENTION = 0.9;  // 在“还记得的概率”降到 90% 时复习。调低（例如 0.85）= 复习更少、忘得更多
export const MAX_INTERVAL_DAYS = 180;  // 最多隔多少天；再牢的词也一定会再见到
export const COUNT_SAME_DAY = true;    // 组里后面的复习也算进记忆（连错几次的词以后复习得更勤）；false = 只看第一次
// 0.2.5 之前的阶梯间隔（天）。现在只用来换算旧的进度记录，不要改
export const OLD_INTERVAL_DAYS = [1, 2, 4, 7, 14, 30, 60];
export const DAY_MS = 24 * 60 * 60 * 1000;   // 1 天 = 24 小时
