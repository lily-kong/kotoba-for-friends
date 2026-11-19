// 答题流程
//
// 一个词出现一次，最多经过这几个阶段（stage）：
//   "first"    第一次机会：直接打
//   "hint"     第二次机会：显示字数和第一个假名（已经算错）
//   "practice" 已揭晓答案，照着再打一遍（只是练习）
//   "done"     已打对，停留一秒后自动进入下一个词

import { CORRECT_AFTER_MISS, REPEAT_GAP, PAUSE_MS } from "./config.js";
import { el, show } from "./ui.js";
import { imageUrl } from "./images.js";
import { playSound } from "./sound.js";
import { pickGroup, nextRecord } from "./schedule.js";
import { loadProgress, saveProgress, appendLog } from "./storage.js";
import { setHintVisible } from "./keyboard.js";

// ---------- 状态 ----------
let group = [];        // 本组的全部条目：{ word, need, missed }
let queue = [];        // 本组还没 clear 的条目，排在最前面的就是下一个
let current = null;    // 当前条目
let stage = "first";
let typed = "";        // 已经打出来的字（假名，末尾可能还有没拼完的罗马字，例如 "たb"）
let started = false;   // 这个词是否已经开始打字（英文缩小上移，出现光标）
let hintShown = false; // 答题区是否已变成短线
let nextTimer = null;  // 答对后"停留一秒"的计时器

// ---------- 开始 / 退出 ----------
export function startGroup() {
  const picked = pickGroup(loadProgress(), Date.now());
  group = picked.fresh.concat(picked.review)
    .map((word) => ({ word: word, need: 1, missed: false }));
  queue = shuffle(group);
  // 提前把本组的图片全部解密好，换词时就不用等
  for (const item of group) imageUrl(item.word).catch(() => {});
  show("quiz");
  showNext();
}

// 中途退出：这一组的进度不保存（日志已经记下的作答会保留）
export function quitGroup() {
  clearTimeout(nextTimer);
}

function showNext() {
  if (queue.length === 0) {
    finishGroup();
    return;
  }
  current = queue.shift();
  stage = "first";
  started = false;
  hintShown = false;
  typed = "";

  updateProgress();
  // 图片是解密后才有的：先清空，解密好了再显示（期间如果已经换了词，就不显示旧图）
  const word = current.word;
  el.image.removeAttribute("src");
  imageUrl(word).then((url) => { if (current.word === word) el.image.src = url; }).catch(() => {});
  el.note.textContent = current.word.note || "";   // 没有提示就留空（CSS 会把它藏起来）
  el.en.textContent = current.word.en;
  el.feedback.classList.remove("wrong");
  el.kanji.textContent = "";
  el.kana.textContent = "";
  render();
}

// 整组 clear 之后才保存进度；中途退出的话，这一组不算
function finishGroup() {
  const progress = loadProgress();
  const now = Date.now();
  for (const item of group) {
    progress.words[item.word.id] = nextRecord(progress.words[item.word.id], item.missed, now);
  }
  saveProgress(progress);
  show("done");
}

// ---------- 输入 ----------
// 屏幕键盘和电脑键盘按下时都调用这里（在 main.js 里连接）
export function typeKey(key) {
  started = true;                              // 按了任何键：英文缩小上移，出现光标
  if (key === "Enter") return onHint();        // 回车位置就是 Hint 键
  if (stage === "done") return;                // 已经打对，不再接受输入
  if (key === "Backspace") {
    typed = typed.slice(0, -1);                // 删掉最后一个字（一个假名或一个罗马字）
  } else {
    // 把新字母接在后面，再整体转成假名，例如 "たb" + "e" → "たべ"，"-" → "ー"
    // IMEMode：末尾单独的 n 先不变成 ん，因为可能是 な、に… 的开头
    typed = wanakana.toHiragana(typed + key, { IMEMode: true });
  }
  // 每打一个字就检查一次，打对了直接进入 done
  if (normalize(typed) === normalize(current.word.kana)) {
    onCorrect();
  } else {
    render();
  }
}

// 打出了正确的单词
function onCorrect() {
  if (stage === "first" || stage === "hint") appendLog(current.word, true, typed, stage === "hint");
  if (stage === "first") {
    // 只有第一次机会打对才算答对
    current.need -= 1;
    if (current.need > 0) requeue(current);
  }
  typed = current.word.kana;
  stage = "done";
  updateProgress();
  render();
  showAnswer();
  nextTimer = setTimeout(showNext, PAUSE_MS);
}

// 按了 Hint（或回车）
function onHint() {
  if (stage === "first") {
    // 第一次没答出来：算错，给出字数和第一个假名，再给一次机会
    appendLog(current.word, false, typed, false);
    current.need = CORRECT_AFTER_MISS;
    current.missed = true;
    requeue(current);
    stage = "hint";
    hintShown = true;
    typed = "";
    updateProgress();
    render();
  } else if (stage === "hint") {
    // 有提示还是没答出来：揭晓答案，照着打一遍才能继续
    appendLog(current.word, false, typed, true);
    stage = "practice";
    el.feedback.classList.add("wrong");        // 答案显示成红色
    typed = "";
    render();
    showAnswer();
  }
  // "practice" 和 "done" 阶段没有 Hint 键，回车键也不做任何事
}

// 把还没 clear 的词放回队列：隔 REPEAT_GAP 个别的词之后再出现
// 例：第 1 个词答错，第 2、3 个词之后，它在第 4 个位置重新出现
function requeue(item) {
  const index = Math.min(REPEAT_GAP, queue.length);
  queue.splice(index, 0, item);
}

// ---------- 画面 ----------
function updateProgress() {
  const cleared = group.filter((item) => item.need === 0).length;
  el.progressFill.style.width = (cleared / group.length) * 100 + "%";
}

function showAnswer() {
  el.kanji.textContent = current.word.kanji;
  el.kana.textContent = current.word.kana;
  playSound(current.word);
}

// 根据当前 stage 和已经打出来的字，重新画一遍答题区
function render() {
  const locked = stage === "done";     // 已经打对：变绿、不再有光标
  const chars = Array.from(typed);
  const answer = Array.from(current.word.kana);

  el.quiz.classList.toggle("started", started);
  setHintVisible(stage === "first" || stage === "hint");   // Hint 键只在前两次机会里出现

  el.display.innerHTML = "";
  el.display.className = hintShown ? "slots" : "";
  if (locked) el.display.classList.add("ok");

  if (!hintShown) {
    // 普通模式：打出来的字 + 一个闪烁的光标
    const text = document.createElement("span");
    text.textContent = typed;
    el.display.appendChild(text);
    if (!locked) el.display.appendChild(makeCaret());
    return;
  }

  // 提示模式：每个假名一条短线，第一格用灰色显示第一个假名
  const count = Math.max(answer.length, chars.length);
  for (let i = 0; i < count; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (i >= answer.length) slot.classList.add("extra");

    if (i < chars.length) {
      slot.textContent = chars[i];
    } else if (i === chars.length && !locked && i > 0) {
      slot.appendChild(makeCaret());
    } else if (i === 0) {
      slot.textContent = answer[0];
      slot.classList.add("ghost");
    }
    el.display.appendChild(slot);
  }
}

function makeCaret() {
  const caret = document.createElement("span");
  caret.className = "caret";
  return caret;
}

// ---------- 小工具 ----------
// 把输入和答案都统一成平假名再比较
function normalize(text) {
  return wanakana.toHiragana(text.trim().toLowerCase());
}

// 打乱顺序（Fisher–Yates 洗牌），返回新数组
function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
