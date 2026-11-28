// 汉字模式：把小词整理成“单元”，决定每一组学哪些单元。只有数据和规则，和画面无关（可以单独测试）。
//
// 单元 = 一个汉字 + 一个锚点词 + 挂在上面的小词（kanji_words.json 里 anchors 指向这个锚点词、这个字的词）。
//   例：見 + 見る + [意見, 花見]
// 一个单元在一组里这样学（前置条件见 session.js）：
//   1. 锚点读法题：只显示 見る（没有图片、英文），答假名
//   2. 第一次就答对 → 接着学小词（和普通单词一样：看图片和英文，答假名）
//      没答对 → 只在组里复习这道读法题，这个字的小词这一组不出现，直接进入下一个字
//
// 什么时候可以学一个单元：锚点词已经在别的地方学过（有学习记录）。
//   第一版：锚点词是 Words 模式学过的词（words.json，例如 見る）
//   第二版：锚点词是汉字模式里学过的小词（例如以后用 電話 带出 電車）。小词学过之后，自动可以当锚点
//   怎么都挂不上锚点的词：先放进 words.json 在 Words 模式里学；学过之后，它也可以当锚点
// 没有小词的字不会出现在汉字模式里（单元就是从小词整理出来的）。

import { GROUP_SIZE, MAX_KANJI_PER_GROUP } from "./config.js";

// 锚点读法题的卡片：复制锚点词的内容，换一个 id（进度和“看英文答 見る”分开记）。
// focus = 主要学的字和它在这个词里的读音（揭晓答案时标粗，答对绿、答错红，见 quiz.js）
// previews = 这个字的全部小词：题目上方显示它们的图片，当作提示，也是接下来要学的词的预告
export function readCard(anchor, char = "", smalls = []) {
  return {
    ...anchor, id: "read:" + anchor.id, wordId: anchor.id, mode: "read",
    focus: { char: char, reading: readingInAnchor(anchor, char, smalls) },
    previews: smalls,
  };
}

// 小词的卡片：复制小词，加上 focus（这个字和它在小词里的读音，来自 anchors）
function smallCard(small, char) {
  const link = small.anchors.find((anchor) => anchor.char === char);
  return { ...small, focus: { char: char, reading: link ? link.reading : "" } };
}

// 锚点词里这个字读什么：去掉词尾的送假名（汉字写法和假名末尾相同的部分），再去掉开头相同的假名。
// 剩下只有这一个字时，剩下的假名就是它的读音（見る → み，出かける → で）。
// 剩下好几个汉字时（面白い → 面白 / おもしろ）分不开：用小词里这个字的读音对一下（白い 的 しろ），
// 对不上就返回 ""（只标汉字，不标假名）
function readingInAnchor(anchor, char, smalls) {
  let kanji = anchor.kanji, kana = anchor.kana;
  while (kanji && kana && kanji.slice(-1) === kana.slice(-1)) { kanji = kanji.slice(0, -1); kana = kana.slice(0, -1); }
  while (kanji && kana && kanji[0] === kana[0]) { kanji = kanji.slice(1); kana = kana.slice(1); }
  if (kanji === char) return kana;
  const readings = smalls.map((small) => (small.anchors.find((a) => a.char === char) || {}).reading);
  return readings.find((reading) => reading && kana.includes(reading)) || "";
}

// 整理出全部单元。levels = kanji.json；wordList = Words 模式里在用的词；smallWords = kanji_words.json。
// 锚点词找不到（被隐藏、退役）的单元先不出现。顺序：按 kanji.json 里的顺序（先 N5 再 N4），不在表里的字排最后
export function buildUnits(levels, wordList, smallWords) {
  const position = new Map();
  for (const [level, chars] of Object.entries(levels)) {
    for (const char of chars) position.set(char, { index: position.size, level: level });
  }
  const anchorOf = new Map([...wordList, ...smallWords].map((word) => [word.id, word]));
  const units = new Map();
  for (const small of smallWords) {
    for (const link of small.anchors) {
      const anchor = anchorOf.get(link.word);
      if (!anchor) continue;
      const key = link.char + ":" + anchor.id;
      if (!units.has(key)) {
        const place = position.get(link.char);
        units.set(key, {
          key: key, char: link.char, anchor: anchor, smalls: [],
          level: place ? place.level : "", order: place ? place.index : Infinity,
        });
      }
      units.get(key).smalls.push(small);
    }
  }
  return [...units.values()].sort((a, b) => a.order - b.order);
}

// 这个词在任何地方学过没有（Words 模式的进度，或者汉字模式里学过的小词）
function isLearned(id, progress, kanjiProgress) {
  return Boolean(progress.words[id] || kanjiProgress.cards[id]);
}

// 一个单元现在的状态：
//   { status: "locked" }                         锚点词还没学过
//   { status: "new", smalls }                    还没学过这个单元
//   { status: "due", smalls, since }             有到期的卡片（或者后来新加了小词）；smalls = 这次要学的小词
//   { status: "waiting", next }                  都还没到期；next = 最早什么时候到期
export function unitStatus(unit, progress, kanjiProgress, now) {
  if (!isLearned(unit.anchor.id, progress, kanjiProgress)) return { status: "locked" };
  const cards = kanjiProgress.cards;
  const read = cards["read:" + unit.anchor.id];
  if (!read) return { status: "new", smalls: unit.smalls };
  const studied = unit.smalls.filter((word) => cards[word.id]);
  const fresh = unit.smalls.filter((word) => !cards[word.id]);
  const dueSmalls = studied.filter((word) => cards[word.id].due <= now);
  const dues = [read.due, ...studied.map((word) => cards[word.id].due)];
  if (read.due <= now || dueSmalls.length > 0 || fresh.length > 0) {
    return { status: "due", smalls: fresh.concat(dueSmalls), since: Math.min(...dues) };
  }
  return { status: "waiting", next: Math.min(...dues) };
}

// 选出一组：先选到期的单元（到期最久的先），再按顺序选新单元。
// 最多 MAX_KANJI_PER_GROUP 个字，整组（读法题 + 小词）不超过 GROUP_SIZE 个；
// 同一个锚点词、同一个小词，一组里只出现一次。
// 返回 { units, cards, requires }：cards 按出题顺序（读法题，它的小词锁在读法题后面），requires 见 session.js
export function pickKanjiGroup(units, progress, kanjiProgress, now) {
  const states = units.map((unit) => ({ unit: unit, ...unitStatus(unit, progress, kanjiProgress, now) }));
  const due = states.filter((s) => s.status === "due").sort((a, b) => a.since - b.since);
  const fresh = states.filter((s) => s.status === "new");

  const chosen = [];
  const usedAnchors = new Set(), usedSmalls = new Set();
  let size = 0;
  for (const state of due.concat(fresh)) {
    if (chosen.length >= MAX_KANJI_PER_GROUP) break;
    const cost = 1 + state.smalls.length;
    const overlaps = usedAnchors.has(state.unit.anchor.id) || state.smalls.some((word) => usedSmalls.has(word.id));
    if (size + cost > GROUP_SIZE || overlaps) continue;
    chosen.push(state);
    size += cost;
    usedAnchors.add(state.unit.anchor.id);
    for (const word of state.smalls) usedSmalls.add(word.id);
  }

  const cards = [];
  const requires = new Map();
  for (const state of chosen) {
    const read = readCard(state.unit.anchor, state.unit.char, state.unit.smalls);
    cards.push(read);
    for (const small of state.smalls) {
      const card = smallCard(small, state.unit.char);
      cards.push(card);
      requires.set(card, read);                // 读法题第一次答对，才出这个小词
    }
  }
  return { units: chosen, cards: cards, requires: requires };
}
