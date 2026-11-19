// 读音
// 手机浏览器只允许在用户操作（点击、打字）的那一刻开始发声。
// 所以"用音频文件还是用语音合成"必须当场决定，不能等音频加载失败后再换。

import { words, audioOf } from "./words.js";

const audioFiles = new Set();   // 确认有音频文件的单词 id
let soundUnlocked = false;

// 启动时检查哪些音频文件真的存在
export function checkAudioFiles() {
  for (const word of words) {
    fetch(audioOf(word), { method: "HEAD" })
      .then((response) => { if (response.ok) audioFiles.add(word.id); })
      .catch(() => {});
  }
}

// iPhone 要求第一次发声发生在点击里。点 Study 时先"说"一句静音的话，之后就能正常发声
export function unlockSound() {
  if (soundUnlocked || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
  soundUnlocked = true;
}

const MAX_SOUND_MS = 4000;      // 最多等读音这么久（有的浏览器读完了也不通知）

// 播放读音，返回一个 Promise：读完时完成。
// 有音频文件就放文件（动词的录音请把原形和敬体都录进去）；
// 没有就用浏览器的日语语音合成，动词读两遍：原形、敬体
export function playSound(word) {
  const texts = word.verb ? [word.kana, word.polite_kana] : [word.kana];
  const playing = audioFiles.has(word.id) ? playFile(word, texts) : speak(texts);
  const timeout = new Promise((resolve) => setTimeout(resolve, MAX_SOUND_MS));
  return Promise.race([playing, timeout]);       // 两个里面先完成的那个
}

function playFile(word, texts) {
  return new Promise((resolve) => {
    const audio = new Audio(audioOf(word));
    audio.onended = resolve;
    audio.play().catch(() => speak(texts).then(resolve));   // 放不了就改用语音合成
  });
}

// 按顺序读出 texts 里的每一句，全部读完时完成
function speak(texts) {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    // 只在正在说话时才取消：部分 Chrome 版本在 cancel() 后紧接着 speak() 会没有声音
    if (speechSynthesis.speaking) speechSynthesis.cancel();
    // 明确选一个日语声音；找不到的话浏览器会用默认声音
    const voice = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith("ja"));
    texts.forEach((text, i) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.rate = 0.9;
      if (voice) u.voice = voice;
      if (i === texts.length - 1) {               // 最后一句读完（或出错）时完成
        u.onend = resolve;
        u.onerror = resolve;
      }
      speechSynthesis.speak(u);                   // 浏览器会排队，一句读完再读下一句
    });
  });
}

// 有些浏览器的声音列表是延后加载的，先触发一次
if ("speechSynthesis" in window) speechSynthesis.getVoices();
