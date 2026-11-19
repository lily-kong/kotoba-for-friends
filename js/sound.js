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

// 播放读音：有音频文件就放文件，没有就用浏览器的日语语音合成
export function playSound(word) {
  if (audioFiles.has(word.id)) {
    new Audio(audioOf(word)).play().catch(() => speak(word.kana));
  } else {
    speak(word.kana);
  }
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ja-JP";
  u.rate = 0.9;
  // 明确选一个日语声音；找不到的话浏览器会用默认声音
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace("_", "-").startsWith("ja"));
  if (voice) u.voice = voice;
  // 只在正在说话时才取消：部分 Chrome 版本在 cancel() 后紧接着 speak() 会没有声音
  if (speechSynthesis.speaking) speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// 有些浏览器的声音列表是延后加载的，先触发一次
if ("speechSynthesis" in window) speechSynthesis.getVoices();
