// 读音：words.json 里 "audio": true 的词播放录音文件 audio/<id>.mp3，其他词用浏览器自带的日语语音合成。
// 有没有录音写在 words.json 里，所以不用一个个去问服务器“这个文件存不存在”。
// 手机浏览器只允许在用户操作（点击、打字）的那一刻开始发声，所以点 Study 时要先“解锁”一次

import { audioOf } from "./words.js";

let soundUnlocked = false;
const MAX_SOUND_MS = 4000;      // 最多等读音这么久（有的浏览器读完了也不通知）

// iPhone 要求第一次发声发生在点击里。点 Study 时先"说"一句静音的话，之后就能正常发声
export function unlockSound() {
  if (soundUnlocked || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
  soundUnlocked = true;
}

// 朗读一个词，返回一个 Promise：读完时完成。
// 有录音就放录音（动词的录音里有原形和敬体两遍）；没有就用合成音，动词读两遍：原形、敬体
export function playSound(word) {
  const texts = word.verb ? [word.kana, word.polite_kana] : [word.kana];
  const playing = word.audio ? playFile(word, texts) : speak(texts);
  const timeout = new Promise((resolve) => setTimeout(resolve, MAX_SOUND_MS));
  return Promise.race([playing, timeout]);         // 两个里面先完成的那个
}

// 播放录音文件；放不了（例如文件出错）就改用合成音
function playFile(word, texts) {
  return new Promise((resolve) => {
    const audio = new Audio(audioOf(word));
    audio.onended = resolve;
    audio.play().catch(() => speak(texts).then(resolve));
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
