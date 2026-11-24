// 保存在这台手机浏览器里的数据（localStorage）：
//   1. 学习进度：每个词现在的复习状态，由复习算法算出来，会被改写
//   2. 学习日志：每一次作答的原始记录，只追加，永远不修改、不删除
//   3. 用户 id：第一次打开时随机生成，用来区分日志是谁的
//
// 保护朋友数据的规则（更新网站时遵守这几条，数据就不会丢）：
// 1. 不改下面三个 KEY；单词的 id 发布后永远不改（进度和日志都是按 id 记的）
// 2. 不删除 words.json 里的词，改成 "retired": true；它的进度和日志仍然留在手机里
// 3. 想改数据格式时，不要删旧字段，而是在读取时把旧格式转换成新格式

const PROGRESS_KEY = "jpwords-progress-v2";
const LOG_KEY = "kotoba-log-v1";
const USER_KEY = "kotoba-user";

// localStorage 只能存字符串，所以存之前转成 JSON，读的时候再转回来。
// 手机可能禁止存储（例如无痕模式），所以都包在 try 里，出错也不影响学习
function read(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value === null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn("Could not save " + key, error);
  }
}

// ---------- 1. 学习进度 ----------
// 格式：
// {
//   "version": 2,
//   "words": {
//     "au-to_meet": { "stability": 4.21, "difficulty": 6.1, "level": 2, "due": 1795000000000,
//                     "last": 1794900000000, "misses": 2 }
//   }
// }
// stability、difficulty = FSRS 的记忆稳定性（天）和难度（1～10），见 fsrs.js（0.2.5 之前的记录没有，读取时换算）
// level = 旧阶梯 OLD_INTERVAL_DAYS 里的位置（现在只给缓存里的旧版网页用）
// due = 下次复习时间；last = 上次学习时间
// misses = 累计有多少组没有直接答对这个词；时间都是毫秒时间戳（Date.now()）
export function loadProgress() {
  const saved = read(PROGRESS_KEY, null);
  return saved && saved.words ? saved : { version: 2, words: {} };
}

export function saveProgress(progress) {
  write(PROGRESS_KEY, progress);
}

// 重置只清空进度（从头开始学），学习日志保留
export function resetProgress() {
  try { localStorage.removeItem(PROGRESS_KEY); } catch (error) {}
}

// 合并两份进度：同一个词保留“最近一次学习”（last 更大）的那条记录，任何一边的词都不会被删掉
function mergeProgress(a, b) {
  const merged = { ...a.words };               // 先复制 a 的全部记录
  for (const [id, record] of Object.entries(b.words)) {
    if (!merged[id] || (record.last || 0) > (merged[id].last || 0)) merged[id] = record;
  }
  return { version: 2, words: merged };
}

// ---------- 2. 学习日志 ----------
// 每次作答记一条（照着答案打的“练习”不记）：
// {"user": "u_8f3a2k1x", "word": "iku-to_go", "correct": false, "answer": "いの",
//  "hint": false, "time": "2026-11-18T13:05:00+09:00"}
// correct = 这次是否打对；answer = 这次打出来的字（没打完的罗马字也会留着，例如 "いk"）
// hint = 是否是在看到提示（字数和第一个假名）之后作答
// 以后的新题型（例如锚点练习）会在记录里加 "mode"（题型）；没有 mode 的记录都是现在的“看英文打假名”。
// 锚点练习的进度以后用新的 KEY 单独存，不写进上面的进度，所以普通复习的安排不受影响
// near = true（只在这种记录上才有）：“差一点点”的作答。按 Hint 时只差长音、浊音或促音
//   （例如 とおる 打成 とる），或者动词打成了ます形（例如 あける 打成 あけます）
export function loadLog() {
  const log = read(LOG_KEY, []);
  return Array.isArray(log) ? log : [];
}

export function appendLog(word, correct, answer, hint, extra = {}) {
  const log = loadLog();
  const entry = { user: getUser(), word: word.id, correct: correct, answer: answer, hint: hint, time: localTime() };
  log.push({ ...entry, ...extra });            // 例如 extra = { near: true }
  write(LOG_KEY, log);
}

// 合并两份日志：两边的记录都保留，完全相同的记录只留一条，按时间排序
function mergeLog(a, b) {
  const seen = new Set(a.map((entry) => JSON.stringify(entry)));
  const merged = a.concat(b.filter((entry) => !seen.has(JSON.stringify(entry))));
  return merged.sort((x, y) => new Date(x.time) - new Date(y.time));
}

// 本地时间，带时区，例如 "2026-11-18T13:05:00+09:00"
function localTime() {
  const now = new Date();
  const offset = -now.getTimezoneOffset();     // 和 UTC 差几分钟，东京是 +540
  const local = new Date(now.getTime() + offset * 60 * 1000);
  const sign = offset >= 0 ? "+" : "-";
  const hours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, "0");
  const minutes = String(Math.abs(offset) % 60).padStart(2, "0");
  return local.toISOString().slice(0, 19) + sign + hours + ":" + minutes;
}

// ---------- 3. 用户 id ----------
export function getUser() {
  let user = read(USER_KEY, null);
  if (!user) {
    user = "u_" + Math.random().toString(36).slice(2, 10);   // 例如 "u_8f3a2k1x"
    write(USER_KEY, user);
  }
  return user;
}

// ---------- 导出 / 导入（备份，或者把记录发给你分析） ----------
// 导出文件格式：{ "user": ..., "exported": 时间, "progress": 进度, "log": 日志 }
export function exportData() {
  return { user: getUser(), exported: localTime(), progress: loadProgress(), log: loadLog() };
}

// 把导出文件合并进这台手机的数据：进度保留较新的记录，日志两边都保留
export function importData(data) {
  const progress = data.progress || data;       // 旧版导出文件里只有进度
  if (!progress || typeof progress.words !== "object") throw new Error("not a progress file");
  saveProgress(mergeProgress(loadProgress(), progress));
  if (Array.isArray(data.log)) write(LOG_KEY, mergeLog(loadLog(), data.log));
  // 恢复自己的备份（例如换了手机）：继续用原来的用户 id
  if (typeof data.user === "string") write(USER_KEY, data.user);
}
