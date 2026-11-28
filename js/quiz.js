// 答题流程
//
// 一个词出现一次，最多经过这几个阶段（stage）：
//   "first"    第一次机会：直接打
//   "hint"     第二次机会：按了 1 次 Hint。普通情况显示字数和第一个假名（短词只显示字数）；
//              如果当时打的只差长音、浊音或促音（“差一点点”），不给普通提示，
//              而是震一下、在键盘上方说 “Almost”，保留原来的输入让他们自己改
//   "practice" 按了第 2 次 Hint，已揭晓答案，照着再打一遍（只是练习）
//   "done"     已打对，读音读完后自动进入下一个词
// 下一个出哪个词由 session.js 决定；每个词出现一次，在这一次结束时告诉它一次结果：
// 不用提示就打对 = "right"；按了 1 次 Hint 后打对 = "hinted"（“差一点点”也一样）；
// 按了 2 次 Hint、看了答案 = "wrong"。“差一点点”只在学习日志里另外记成 near
//
// 动词打成了ます形（例如 あける 打成 あけます）：一打完就震一下，提示输入辞书形，保留输入让他们自己改。
// 不算错：自己改对了就是直接答对；改不对按了 Hint，就和普通单词一样（普通提示，算半错）。
// 学习日志里和 “Almost” 一样记成 near。
// （第一条真人反馈：朋友打了ます形，应用没有任何反应，他以为卡住了。见 FEEDBACK.md）
//
// 两种组：Words 模式（startGroup，看图片和英文打假名）和汉字模式（startKanjiGroup，见 kanjischedule.js）。
// 汉字模式的锚点读法题（word.mode === "read"）只显示汉字，不显示图片、英文和 note；其余流程完全一样

import { PAUSE_MS, AFTER_SOUND_MS, GHOST_MIN_KANA } from "./config.js";
import { el, show, make } from "./ui.js";
import { imageUrl } from "./images.js";
import { playSound, playChime } from "./sound.js";
import { pickGroup, nextRecord, shuffle } from "./schedule.js";
import { createSession, nextItem, answer, clearedCount } from "./session.js";
import { isNearMiss, diffMarks } from "./kana.js";
import { loadProgress, saveProgress, loadKanjiProgress, saveKanjiProgress, appendLog } from "./storage.js";
import { setHintVisible } from "./keyboard.js";

// 键盘上方的提示文字
const NUDGE_ALMOST = "Almost — just a little off.";
const NUDGE_MASU = "Please type the dictionary form.";

// ---------- 状态 ----------
let session = null;    // 本组的出题状态（见 session.js）
let saveResults = null; // 本组结束时怎么保存（Words 模式和汉字模式存在不同的地方）
let current = null;    // 当前条目（session 里的一个 item，item.word 是单词）
let stage = "first";
let typed = "";        // 已经打出来的字（假名，末尾可能还有没拼完的罗马字，例如 "たb"）
let started = false;   // 这个词是否已经开始打字（英文缩小上移，出现光标）
let hintShown = false; // 答题区是否已变成短线
let marks = null;      // 揭晓答案时要标红的字（打的“差一点点”时才有）：{ typed: [...], answer: [...] }
let masuLogged = false; // 这次出现里，打成ます形的作答已经记进日志了（只记一次）

// ---------- 开始 / 退出 ----------
// Words 模式。tag = 只学这个分类；不写 = 从全部单词里学
export function startGroup(tag = null) {
  const picked = pickGroup(loadProgress(), Date.now(), tag);
  runGroup(shuffle(picked.fresh.concat(picked.review)), new Map(), saveWordResults);
}

// 汉字模式。cards、requires 由 kanjischedule.js 的 pickKanjiGroup 选好（顺序就是出题顺序，不打乱）
export function startKanjiGroup(cards, requires) {
  runGroup(cards, requires, saveKanjiResults);
}

function runGroup(cards, requires, save) {
  session = createSession(cards, requires);
  saveResults = save;
  // 提前把本组的图片全部解密好，换词时就不用等（读法题没有图片）
  for (const item of session.items) {
    const pictures = item.word.mode === "read" ? item.word.previews || [] : [item.word];
    for (const word of pictures) imageUrl(word).catch(() => {});
  }
  show("quiz");
  showNext();
}

// 中途退出：这一组的进度不保存（日志已经记下的作答会保留）
export function quitGroup() {
  current = null;      // 正在等待的“进入下一个词”看到 current 变了，就不会再执行
}

function showNext() {
  const item = nextItem(session);
  if (!item) {
    finishGroup();
    return;
  }
  current = item;
  stage = "first";
  started = false;
  hintShown = false;
  typed = "";
  marks = null;
  masuLogged = false;
  el.nudge.classList.add("hidden");

  updateProgress();
  const word = current.word;
  // 锚点读法题：只显示汉字（例如 見る）。图片和 note 由 style.css 的 .read-mode 藏起来
  const reading = word.mode === "read";
  el.quiz.classList.toggle("read-mode", reading);
  // 图片是解密后才有的：先清空，解密好了再显示（期间如果已经换了词，就不显示旧图）
  el.image.removeAttribute("src");
  if (!reading) imageUrl(word).then((url) => { if (current.word === word) el.image.src = url; }).catch(() => {});
  showPreviews(reading ? word.previews || [] : []);
  el.note.textContent = reading ? "" : word.note || "";   // 没有提示就留空（CSS 会把它藏起来）
  el.en.textContent = reading ? word.kanji : word.en;
  el.feedback.classList.remove("wrong", "focus-right", "focus-wrong");
  el.kanji.textContent = "";
  el.kana.textContent = "";
  render();
}

// 锚点读法题上方的一排小图：这个字的小词的图片（每张一样大，见 style.css 的 #previews）。
// 没有小词（或者不是读法题）就整排藏起来
function showPreviews(smallWords) {
  el.previews.innerHTML = "";
  el.previews.classList.toggle("hidden", smallWords.length === 0);
  const card = current.word;
  for (const small of smallWords) {
    const picture = make("img", "preview");
    picture.alt = "";
    el.previews.appendChild(picture);
    // 解密好了再显示；期间如果已经换了题，就不管了
    imageUrl(small).then((url) => { if (current.word === card) picture.src = url; }).catch(() => {});
  }
}

// 整组 clear 之后才保存进度；中途退出的话，这一组不算
function finishGroup() {
  saveResults(session.items.filter((item) => item.results.length > 0), Date.now());
  show("done");
}

// Words 模式：存进普通进度
function saveWordResults(items, now) {
  const progress = loadProgress();
  for (const item of items) {
    progress.words[item.word.id] = nextRecord(progress.words[item.word.id], item.results, now);
  }
  saveProgress(progress);
}

// 汉字模式：存进汉字模式的进度（卡片 id 见 storage.js 的 1b）
function saveKanjiResults(items, now) {
  const progress = loadKanjiProgress();
  for (const item of items) {
    progress.cards[item.word.id] = nextRecord(progress.cards[item.word.id], item.results, now);
  }
  saveKanjiProgress(progress);
}

// 记一条学习日志。锚点读法题记成锚点词的 id，加上 mode: "read"（见 storage.js）
function log(correct, typedText, hint, extra = {}) {
  const word = current.word;
  if (word.mode) appendLog({ id: word.wordId }, correct, typedText, hint, { mode: word.mode, ...extra });
  else appendLog(word, correct, typedText, hint, extra);
}

// ---------- 输入 ----------
// 屏幕键盘和电脑键盘按下时都调用这里（在 main.js 里连接）
export function typeKey(key) {
  started = true;                              // 按了任何键：英文缩小上移，出现光标
  if (key === "Enter") return onHint();        // 回车位置就是 Hint 键
  if (stage === "done") return;                // 已经打对，不再接受输入
  el.nudge.classList.add("hidden");            // 开始修改了：收起键盘上方的提示
  if (key === "Backspace") {
    typed = typed.slice(0, -1);                // 删掉最后一个字（一个假名或一个罗马字）
  } else {
    // 把新字母接在后面，再整体转成假名，例如 "たb" + "e" → "たべ"，"-" → "ー"
    // IMEMode：末尾单独的 n 先不变成 ん，因为可能是 な、に… 的开头
    typed = wanakana.toHiragana(typed + key, { IMEMode: true });
  }
  // 每打一个字就检查一次：打对了直接进入 done；打成了ます形，马上提醒（不用等他按 Hint）
  if (normalize(typed) === normalize(current.word.kana)) {
    onCorrect();
  } else if (isMasuForm()) {
    onMasu();
  } else {
    render();
  }
}

// 现在打的是不是这个动词的ます形（已经打完整）
function isMasuForm() {
  return Boolean(current.word.verb) && !/[a-z]$/.test(typed)
    && normalize(typed) === normalize(current.word.polite_kana);
}

// 打成了ます形：震一下，提示输入辞书形，保留输入。不算错，stage 不变，看他们能不能自己改对
function onMasu() {
  if (!masuLogged && stage !== "practice") {
    log(false, typed, stage === "hint", { near: true });
    masuLogged = true;
  }
  render();
  showNudge(NUDGE_MASU);
}

// 打出了正确的单词
function onCorrect() {
  if (stage === "first" || stage === "hint") log(true, typed, stage === "hint");
  // 不用提示打对 = "right"，按了 1 次 Hint 后打对 = "hinted"；
  // "practice" 阶段打对不再记录（看答案的那一刻已经记成 "wrong" 了）。
  // 这一刻学会了这个词，就放答对音效（复习满 4 次才通过的不放）
  const result = stage === "first" ? "right" : stage === "hint" ? "hinted" : null;
  const outcome = result ? answer(session, current, result) : null;
  if (outcome === "learned") playChime();
  typed = current.word.kana;
  stage = "done";
  updateProgress();
  render();
  moveOnAfter(showAnswer(), AFTER_SOUND_MS);
}

// 读音读完再停 extraMs，并且至少停留 PAUSE_MS，然后进入下一个词
function moveOnAfter(sound, extraMs) {
  const answered = current;
  Promise.all([sound.then(() => sleep(extraMs)), sleep(PAUSE_MS)]).then(() => {
    if (current === answered) showNext();      // 期间退出了这一组，就什么都不做
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 按了 Hint（或回车）
function onHint() {
  // （打成ます形时按 Hint：和普通单词一样处理，所以这里不用特别判断）
  // 现在打的是不是“差一点点”（已经打完整，只差长音、浊音或促音）
  const almost = !/[a-z]$/.test(typed) && isNearMiss(typed, current.word.kana);
  if (stage === "first" && almost) {
    // 差一点点：不给普通提示，震一下，键盘上方说 “Almost”，保留原来的输入让他们自己改。
    // 计算上和按了 1 次 Hint 一样；学习日志里记成 near
    log(false, typed, false, { near: true });
    stage = "hint";
    render();
    showNudge(NUDGE_ALMOST);
  } else if (stage === "first") {
    // 第一次没答出来：给出字数和第一个假名，再给一次机会
    log(false, typed, false);
    stage = "hint";                            // 先不记录结果：看接下来是打对，还是再按一次 Hint
    hintShown = true;
    typed = "";
    el.nudge.classList.add("hidden");          // 收起之前的提示（例如ます形的提醒）
    updateProgress();
    render();
  } else if (stage === "hint") {
    // 有提示还是没答出来：揭晓答案，照着打一遍才能继续。
    // 如果打的是“差一点点”，答案里不一样的字标红（其余照常显示），一眼看出差在哪
    log(false, typed, true, almost ? { near: true } : {});
    if (almost) marks = diffMarks(typed, current.word.kana);
    // 汉字模式：只有主要学的字和它的读音标红，其余保持黑色；Words 模式：答案整个显示成红色
    if (current.word.focus) el.feedback.classList.add("focus-wrong");
    else if (!almost) el.feedback.classList.add("wrong");
    answer(session, current, "wrong");         // 这一次出现的结果：看了答案
    updateProgress();                          // 第 4 次复习看了答案，也算通过
    stage = "practice";
    el.nudge.classList.add("hidden");
    typed = "";
    render();
    showAnswer();
  }
  // "practice" 和 "done" 阶段没有 Hint 键，回车键也不做任何事
}

// 键盘上方显示一行提示，同时答题区震一下
function showNudge(text) {
  el.nudge.textContent = text;
  el.nudge.classList.remove("hidden");
  shake();
}

// 答题区左右晃一下（只是画面动画，手机本身不振动）
function shake() {
  el.display.classList.remove("shake");
  void el.display.offsetWidth;                 // 让浏览器重新开始播放动画
  el.display.classList.add("shake");
}

// ---------- 画面 ----------
// 进度条：本组学会了几个词
function updateProgress() {
  el.progressFill.style.width = (clearedCount(session) / session.items.length) * 100 + "%";
}

// 显示答案并朗读。动词显示成 “開ける／開けます”（输入时只需要打原形）
// 打的是“差一点点”时，答案里不一样的字标红。返回读音的 Promise（读完时完成）
function showAnswer() {
  const word = current.word;
  // 汉字模式：主要学的字和它的读音标粗（答对绿、答错红，颜色由 #feedback 的 class 决定，见 style.css）
  const focus = word.focus || {};
  if (focus.char && !el.feedback.classList.contains("focus-wrong")) el.feedback.classList.add("focus-right");
  // 动词显示 “原形／敬体”；汉字模式的锚点读法题只显示原形（不然太乱），录音照常读两种
  const polite = Boolean(word.verb) && word.mode !== "read";
  const kanjiLine = polite ? word.kanji + "／" + word.polite : word.kanji;
  const kanaLine = polite ? word.kana + "／" + word.polite_kana : word.kana;
  el.kanji.replaceChildren(...withFocus(word.kanji, focus.char), polite ? "／" + word.polite : "");
  el.kana.innerHTML = "";
  if (marks) {
    // 原形的每个字：打错的标红；敬体照常显示
    el.kana.append(...markedText(word.kana, marks.answer), polite ? "／" + word.polite_kana : "");
  } else if (kanaLine !== kanjiLine) {           // 只有假名的词（ある、する…）上下两行一样，不显示第二行
    el.kana.append(...withFocus(word.kana, focus.reading), polite ? "／" + word.polite_kana : "");
  }
  return playSound(word);
}

// 把 text 里第一次出现的 part 包成 <span class="focus">；没有 part（或找不到）就原样返回
function withFocus(text, part) {
  const at = part ? text.indexOf(part) : -1;
  if (at < 0) return [text];
  return [text.slice(0, at), make("span", "focus", part), text.slice(at + part.length)];
}

// 把文字拆成一个个字，marks[i] 为 true 的字标红
function markedText(text, wrong) {
  return Array.from(text).map((char, i) => (wrong[i] ? make("span", "miss", char) : char));
}

// 根据当前 stage 和已经打出来的字，重新画一遍答题区
function render() {
  const locked = stage === "done";     // 已经打对：变绿、不再有光标
  const answer = Array.from(current.word.kana);

  el.quiz.classList.toggle("started", started);
  setHintVisible(stage === "first" || stage === "hint");   // Hint 键只在前两次机会里出现

  el.display.innerHTML = "";
  el.display.className = hintShown ? "slots" : "";
  if (locked) el.display.classList.add("ok");   // 打对了：变绿

  if (!hintShown) {
    // 普通模式：打出来的字 + 一个闪烁的光标
    const text = document.createElement("span");
    text.textContent = typed;
    el.display.appendChild(text);
    if (!locked) el.display.appendChild(makeCaret());
    return;
  }

  // 提示模式：每个假名一条短线。已经拼好的假名各占一格；
  // 还没拼完的罗马字（例如打 "ka" 时的 "k"）和光标留在当前这一格，拼成假名后才进入下一格
  const romaji = typed.match(/[a-z]*$/)[0];                    // 末尾还没拼完的罗马字
  const kana = Array.from(typed.slice(0, typed.length - romaji.length));
  // 格数 = 答案的假名数；打多了就多出几格（没有短线）。没打对之前，还要留出光标所在的格
  const count = Math.max(answer.length, kana.length + (locked ? 0 : 1));
  for (let i = 0; i < count; i++) {
    const slot = document.createElement("div");
    slot.className = "slot";
    if (i >= answer.length) slot.classList.add("extra");

    if (i < kana.length) {
      slot.textContent = kana[i];
    } else if (i === kana.length && !locked) {
      // 当前这一格：正在拼的罗马字 + 光标；第一格什么都没打时，光标后面是灰色的第一个假名
      // （1～2 个假名的短词不显示第一个假名，只提示字数，不然几乎等于告诉答案）
      if (romaji) slot.append(romaji);
      slot.appendChild(makeCaret());
      if (i === 0 && !romaji && answer.length >= GHOST_MIN_KANA) slot.appendChild(make("span", "ghost", answer[0]));
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
