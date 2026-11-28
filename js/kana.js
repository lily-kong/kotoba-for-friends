// 比较假名的小工具（和画面无关，可以单独测试）：
//   isNearMiss  判断是不是“差一点点”：只差长音、浊音或促音，例如 とる → とおる、かく → がく、かこ → かっこ
//   diffMarks   标出两边对不上的字：打出来的里面打错或多打的，正确答案里面漏打或打错的（标红用）
// isNearMiss 只在按 Hint 的那一刻用：按了 Hint 就是“打完了”，所以漏打结尾的长音（せんせい 打成 せんせ、
// りょこう 打成 りょこ）也算差一点点。汉字模式的小词多是音读名词，结尾的长音特别多

// 每个假名的元音，用来认出长音（おう、えい……）
const VOWEL = {};
for (const [vowel, row] of Object.entries({
  a: "あかさたなはまやらわがざだばぱぁゃゎ",
  i: "いきしちにひみりぎじぢびぴぃ",
  u: "うくすつぬふむゆるぐずづぶぷぅゅ",
  e: "えけせてねへめれげぜでべぺぇ",
  o: "おこそとのほもよろをごぞどぼぽぉょ",
})) {
  for (const kana of row) VOWEL[kana] = vowel;
}
// 什么元音后面跟什么假名算长音：あ段+あ、い段+い、う段+う、え段+い/え、お段+う/お
const LENGTHENS = { a: "あ", i: "い", u: "う", e: "いえ", o: "うお" };

// 去掉“长音、浊音和促音”之后剩下的骨架：两个答案骨架相同，就只差这几样
function skeleton(text) {
  const plain = text
    .replace(/づ/g, "ず").replace(/ぢ/g, "じ")              // づ/ず、ぢ/じ 读音一样
    .normalize("NFD").replace(/[゙゚]/g, "")       // 去掉浊点、半浊点（が → か、ぱ → は）
    .normalize("NFC")
    .replace(/[ーっ]/g, "");                               // 去掉长音符号和促音（小っ）
  let result = "";
  for (const kana of plain) {
    const previous = VOWEL[result.slice(-1)];
    if (previous && LENGTHENS[previous].includes(kana)) continue;   // 拉长前一个音的假名：去掉
    result += kana;
  }
  return result;
}

// typed = 打出来的（已经拼完的假名），answer = 正确答案。
// 骨架相同 = 只差长音、浊音或促音。打了一半就按 Hint（例如 がっこう 只打了 がっ）骨架不同，不算
export function isNearMiss(typed, answer) {
  if (!typed || typed === answer) return false;
  return skeleton(typed) === skeleton(answer);
}

// 两边每个字是否对得上：true = 对不上（要标红）。
// 用最长公共子序列（两边按顺序都有的、最长的一串字）对齐，例如 かく / がく → か 和 が 标红
export function diffMarks(typed, answer) {
  const t = Array.from(typed), a = Array.from(answer);
  const table = Array.from({ length: t.length + 1 }, () => new Array(a.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--) {
    for (let j = a.length - 1; j >= 0; j--) {
      table[i][j] = t[i] === a[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const typedMarks = new Array(t.length).fill(true), answerMarks = new Array(a.length).fill(true);
  for (let i = 0, j = 0; i < t.length && j < a.length;) {
    if (t[i] === a[j]) { typedMarks[i] = false; answerMarks[j] = false; i++; j++; }
    else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return { typed: typedMarks, answer: answerMarks };
}
