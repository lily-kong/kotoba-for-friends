// 复习规则的兼容检查和压力测试（页面见 simulate.html）。只在电脑上运行，网站不会用到这个文件

import { words } from "../js/words.js";
import { pickGroup, nextRecord } from "../js/schedule.js";
import { createSession, nextItem, answer } from "../js/session.js";
import { DAY_MS, COUNT_SAME_DAY } from "../js/config.js";

const out = document.getElementById("out");
out.innerHTML = "";
const T0 = Date.UTC(2027, 0, 1, 10);

// 模拟用的单词：pickGroup 只需要 id 和 tags，不用读 words.json
function useWords(count) {
  words.length = 0;
  for (let i = 0; i < count; i++) words.push({ id: "w" + i, tags: [] });
}

// 可重复的随机数（同一个 seed 每次结果一样，比较两种规则时更公平）
function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- 1. 兼容检查 ----------
// 0.2.5 之前的旧算法（照抄）：手机缓存里的旧版网页会这样读写进度记录
const OLD_LADDER = [1, 2, 4, 7, 14, 30, 60];
function oldNextRecord(previous, missed, now) {
  const level = missed ? 0 : !previous ? 3 : Math.min(previous.level + 1, OLD_LADDER.length - 1);
  return { ...previous, level, due: now + OLD_LADDER[level] * DAY_MS, last: now,
    misses: ((previous && previous.misses) || 0) + (missed ? 1 : 0) };
}

function checkCompatibility() {
  useWords(5);
  const now = T0;
  const fine = (r) => [r.due, r.last, r.stability, r.difficulty, r.level].every(Number.isFinite) && r.due > now;
  const results = [];
  const check = (name, ok) => results.push([name, ok]);

  // 0.2.5 之前存下的记录：只有 level
  const old = {
    w0: { level: 0, due: now - DAY_MS, last: now - 2 * DAY_MS, misses: 2 },
    w1: { level: 6, due: now - 3 * DAY_MS, last: now - 63 * DAY_MS, misses: 0 },
    w2: { level: 3, due: now + DAY_MS, last: now - 6 * DAY_MS, misses: 1 },
  };
  const progress = { version: 2, words: structuredClone(old) };
  const group = pickGroup(progress, now);
  check("旧记录：到期的词被选进复习（w0、w1），没到期的不选", group.review.length === 2 && !group.review.some((w) => w.id === "w2"));
  // w0：稳定性 1 天、隔了 2 天（还记得的概率约 82%）；w1：稳定性 60 天、隔了 63 天（约 90%）
  check("旧记录：最可能忘了的排最前（w0 在 w1 前面）", group.review[0] && group.review[0].id === "w0");
  for (const result of ["right", "hinted", "wrong"]) {
    check(`旧记录 → 新算法（${result}）：所有数字有效`, Object.values(old).every((r) => fine(nextRecord(r, [result], now))));
  }
  check("旧记录里的其他字段保留下来", nextRecord({ ...old.w1, note: "x" }, ["right"], now).note === "x");

  // 新算法写的记录，被缓存里的旧版网页读到
  const fresh = nextRecord(undefined, ["wrong"], now);
  check("新记录有 level（旧版网页需要）", Number.isInteger(fresh.level));
  const byOld = oldNextRecord(nextRecord(old.w1, ["right"], now), false, now + 40 * DAY_MS);
  check("新记录 → 旧版网页：复习时间有效", Number.isFinite(byOld.due) && byOld.due > now);
  check("旧版网页改过的记录 → 新算法：所有数字有效", fine(nextRecord(byOld, ["right"], byOld.due)));

  // 新词
  for (const result of ["right", "hinted", "wrong"]) check(`新词（${result}）：所有数字有效`, fine(nextRecord(undefined, [result], now)));

  // 组里的复习也算进去：连错的词，难度更高、记忆更不牢
  const once = nextRecord(undefined, ["wrong", "right", "right"], now);
  const thrice = nextRecord(undefined, ["wrong", "wrong", "wrong", "right", "right"], now);
  check("组内：错→对→对 和 错→错→错→对→对 数字都有效", fine(once) && fine(thrice));
  if (COUNT_SAME_DAY) {                         // config.js 里关掉的话，组内的复习不算，就不检查这一条
    check("组内：连错三次的词，稳定性更低、难度更高", thrice.stability < once.stability && thrice.difficulty > once.difficulty);
  }

  const table = results.map(([name, ok]) => `<tr><td>${name}</td><td class="${ok ? "pass" : "fail"}">${ok ? "PASS" : "FAIL"}</td></tr>`);
  out.insertAdjacentHTML("beforeend", `<h2>1. 兼容检查</h2><table><tr><th>检查</th><th></th></tr>${table.join("")}</table>`);
  return results.every(([, ok]) => ok);
}

// ---------- 2. 压力测试 ----------
// 一个学习者学 days 天。learner：
//   attend   每天来学的概率
//   groups   每天至少学几组
//   clear    true = 一直学到没有到期的复习词（最多 maxGroups 组，学不动就停）
//   ability  记性（1 = 普通，越小忘得越快）
//   breakFrom/breakTo  这几天完全不来
function simulate(learner, days, seed) {
  const rand = rng(seed);
  const progress = { version: 2, words: {} };
  const truth = {};                                    // 学习者脑子里“真正”的记忆
  for (const w of words) truth[w.id] = { ease: (0.5 + rand()) * learner.ability, tau: 0, last: 0 };
  const recall = (t, now) => Math.pow(0.9, (now - t.last) / DAY_MS / t.tau);
  const s = { studyDays: 0, groups: 0, cleared: 0, tired: 0, reviews: 0, right: 0, late: 0, backlog: 0, maxBacklog: 0 };

  const realRandom = Math.random;
  Math.random = rand;                                  // pickGroup 洗牌用的随机数也固定下来
  for (let day = 0; day < days; day++) {
    const now = T0 + day * DAY_MS;
    const dueCount = () => words.filter((w) => progress.words[w.id] && progress.words[w.id].due <= now).length;
    const backlog = dueCount();
    s.backlog += backlog;
    s.maxBacklog = Math.max(s.maxBacklog, backlog);
    if (learner.breakFrom <= day && day < learner.breakTo) continue;
    if (rand() > learner.attend) continue;
    s.studyDays++;

    let groups = 0;
    while (groups < learner.groups || (learner.clear && dueCount() > 0 && groups < learner.maxGroups)) {
      const picked = pickGroup(progress, now);
      if (picked.fresh.length + picked.review.length === 0) break;
      groups++;
      // 用网站真正的组内顺序（session.js）：第一次见到看“真正”的记忆；组里的复习刚见过答案，
      // 按记性答对（0.55～0.95），答不对时 40% 靠提示
      const session = createSession(picked.fresh.concat(picked.review));
      for (let item = nextItem(session); item; item = nextItem(session)) {
        const w = item.word, t = truth[w.id], record = progress.words[w.id];
        let result;
        if (item.seen) {
          result = rand() < Math.min(0.95, 0.55 + 0.3 * t.ease) ? "right" : rand() < 0.4 ? "hinted" : "wrong";
        } else if (!record) {                        // 新词：10% 本来就会
          if (rand() < 0.1) { result = "right"; t.tau = 20 * t.ease; } else { result = "wrong"; t.tau = t.ease; }
        } else {
          s.reviews++;
          s.late += Math.max(0, (now - record.due) / DAY_MS);
          const p = recall(t, now);
          if (rand() < p) {                          // 想起来了：越接近忘记，记得越牢
            result = "right"; s.right++;
            t.tau *= 1 + 3 * t.ease * Math.min(1, (1 - p) / 0.1 + 0.05);
          } else {                                   // 忘了：40% 靠提示想起来
            result = rand() < 0.4 ? "hinted" : "wrong";
            t.tau = Math.max(t.ease, t.tau * 0.35);
          }
        }
        t.last = now;
        answer(session, item, result);
      }
      for (const item of session.items) {
        progress.words[item.word.id] = nextRecord(progress.words[item.word.id], item.results, now);
      }
    }
    s.groups += groups;
    if (dueCount() === 0) s.cleared++;
    else if (learner.clear) s.tired++;
  }
  Math.random = realRandom;

  const end = T0 + days * DAY_MS;
  const seen = words.filter((w) => progress.words[w.id]);
  s.seen = seen.length;
  s.remembered = seen.reduce((sum, w) => sum + recall(truth[w.id], end), 0);
  return s;
}

const LEARNERS = [
  ["累型：每天只学 1 组", {}],
  ["认真型：每天 2 组", { groups: 2 }],
  ["清完型：学到清完，最多 4 组", { clear: true, maxGroups: 4 }],
  ["清完型，记性差", { clear: true, maxGroups: 4, ability: 0.6 }],
  ["清完型，中断 20 天", { clear: true, maxGroups: 4, breakFrom: 60, breakTo: 80 }],
];
const BASE = { attend: 0.9, groups: 1, clear: false, maxGroups: 1, ability: 1, breakFrom: 0, breakTo: 0 };
const CASES = [
  { size: 194, days: 180, runs: 20 },
  { size: 1000, days: 365, runs: 6 },
];

async function stressTest() {
  out.insertAdjacentHTML("beforeend", "<h2>2. 压力测试</h2>");
  for (const c of CASES) {
    useWords(c.size);
    const rows = [];
    for (const [name, options] of LEARNERS) {
      const learner = { ...BASE, ...options };
      const all = [];
      for (let i = 0; i < c.runs; i++) all.push(simulate(learner, c.days, 7000 + i));
      const m = (key) => all.reduce((sum, x) => sum + x[key], 0) / c.runs;
      rows.push([name, (m("groups") / m("studyDays")).toFixed(1),
        Math.round(100 * m("cleared") / m("studyDays")) + "%",
        learner.clear ? Math.round(100 * m("tired") / m("studyDays")) + "%" : "–",
        Math.round(m("backlog") / c.days), Math.round(m("maxBacklog")),
        (m("late") / m("reviews")).toFixed(1), Math.round(100 * m("right") / m("reviews")) + "%",
        Math.round(m("seen")), Math.round(m("remembered"))]);
      await new Promise((resolve) => setTimeout(resolve));   // 让页面有机会刷新
    }
    const head = ["学习者", "每天几组", "清完复习的日子", "想清完但累了", "平均积压", "最多积压",
      "复习平均晚几天", "复习时答对", "学过", "最后还记得"];
    out.insertAdjacentHTML("beforeend",
      `<h3>${c.size} 个词，${c.days} 天（90% 的日子来学；每种 ${c.runs} 人平均）</h3><table>` +
      `<tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>` +
      rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join("")}</tr>`).join("") + "</table>");
  }
}

const compatible = checkCompatibility();
await stressTest();
out.insertAdjacentHTML("afterbegin", `<p id="summary" class="${compatible ? "pass" : "fail"}">${compatible ? "兼容检查全部通过" : "兼容检查有失败！"}</p>`);
