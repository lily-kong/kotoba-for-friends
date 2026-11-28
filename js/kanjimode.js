// 汉字模式的页面（首页底部的 “Kanji 漢字”）。学习的规则在 kanjischedule.js，答题在 quiz.js。
//
// 页面上：Study kanji 按钮，和每个汉字单元一行（汉字、锚点词、小词、现在的状态）。
// 只列出有小词的单元；锚点词还没学过的单元也列出来，告诉朋友先去学哪个词。

import { el, make, show } from "./ui.js";
import { words, hasImage } from "./words.js";
import { formatWhen } from "./home.js";
import { buildUnits, unitStatus, pickKanjiGroup } from "./kanjischedule.js";
import { loadProgress, loadKanjiProgress } from "./storage.js";

let levels = null;       // kanji.json：{ "N5": "人入力…", "N4": "夕工文…" }（只下载一次）
let smallWords = null;   // kanji_words.json：汉字模式的小词
let units = [];          // 整理好的单元（见 kanjischedule.js）

// 点 Study kanji 时要做什么（在 main.js 里设置：解锁读音，然后开始一组）。参数 = pickKanjiGroup 选好的一组
let studyHandler = (group) => {};
export function onStudyKanji(handler) {
  studyHandler = handler;
}

async function loadData() {
  if (!levels) levels = await (await fetch("kanji.json", { cache: "no-cache" })).json();
  if (!smallWords) {
    // 还没有图片的小词暂时不出现（和 words.json 的词一样，见 words.js 的 hasImage）
    const all = await (await fetch("kanji_words.json", { cache: "no-cache" })).json();
    smallWords = all.filter(hasImage);
  }
  units = buildUnits(levels, words, smallWords);
}

// 现在该学的一组（每次点按钮时重新选，用最新的进度）
function currentGroup() {
  return pickKanjiGroup(units, loadProgress(), loadKanjiProgress(), Date.now());
}

export async function renderKanji() {
  el.kanjiList.innerHTML = "";
  el.kanjiStudy.classList.add("hidden");
  try {
    await loadData();
  } catch (error) {
    el.kanjiInfo.textContent = "Could not load the kanji list. Please check your internet connection.";
    show("kanjiPage");
    return;
  }
  const progress = loadProgress(), kanjiProgress = loadKanjiProgress(), now = Date.now();
  const states = units.map((unit) => unitStatus(unit, progress, kanjiProgress, now));
  const locked = states.filter((s) => s.status === "locked").length;
  el.kanjiInfo.textContent = "Each kanji starts from a word you already know (its anchor). "
    + "Read the anchor right, and you learn new words with the same kanji. "
    + (units.length - locked) + " of " + units.length + " kanji are ready.";

  // Study kanji 按钮和下一组的说明
  const group = currentGroup();
  if (group.units.length > 0) {
    const fresh = group.units.filter((s) => s.status === "new").length;
    el.kanjiStudyInfo.textContent = "Next group: " + group.units.map((s) => s.unit.char).join("・")
      + " (" + fresh + " new, " + (group.units.length - fresh) + " review)";
    el.kanjiStudy.classList.remove("hidden");
  } else {
    el.kanjiStudyInfo.textContent = locked === units.length
      ? "Learn some words in Words mode first — they are the anchors."
      : "Nothing to study right now.";
  }

  units.forEach((unit, i) => el.kanjiList.appendChild(makeRow(unit, states[i])));
  show("kanjiPage");
  window.scrollTo(0, 0);
}

// 一个单元一行：左边汉字和级别；右边锚点词、小词（括号里是这个字在小词里的读音）、状态
function makeRow(unit, state) {
  const row = make("div", "row kanji-row");
  if (state.status === "locked") row.classList.add("locked");
  const head = make("div", "kanji-head");
  head.append(make("span", "kanji-char", unit.char), make("span", "kanji-level", unit.level));

  const body = make("div", "kanji-body");
  const anchors = make("div", "kanji-anchors");
  anchors.appendChild(makeChip("kanji-anchor", unit.anchor.kanji, unit.anchor.kana));
  body.appendChild(anchors);
  const small = make("div", "kanji-small");
  for (const word of unit.smalls) {
    const reading = word.anchors.find((link) => link.char === unit.char).reading;
    // 读音就是整个词（例如 上 うえ）时不重复写括号
    const kana = reading === word.kana ? word.kana : word.kana + "（" + reading + "）";
    small.appendChild(makeChip("kanji-anchor small", word.kanji, kana));
  }
  body.append(small, make("div", "kanji-status" + (state.status === "due" ? " due" : ""), statusText(unit, state)));
  row.append(head, body);
  return row;
}

function statusText(unit, state) {
  if (state.status === "locked") return "Learn " + unit.anchor.kanji + " in Words mode first";
  if (state.status === "new") return "New";
  if (state.status === "due") return "Review now";
  return "Review " + formatWhen(state.next);
}

// 一个词的小卡片：汉字在上，读音在下
function makeChip(className, kanji, kana) {
  const chip = make("span", className);
  chip.append(make("span", "", kanji), make("span", "sub", kana));
  return chip;
}

// Study kanji 按钮
export function setupKanji() {
  el.kanjiStudy.addEventListener("click", () => {
    const group = currentGroup();
    if (group.units.length > 0) studyHandler(group);
  });
}
