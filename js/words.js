// 读取 words.json

import { HIDDEN_TAGS } from "./config.js";

// 正在使用的单词（已退役的 retired 词、隐藏分类里的词、还没有图片的词不在这里）。
// 用 const 数组 + push 填进去，其他模块 import 之后拿到的就是同一个数组（和 Python 模块里的 list 一样）
export const words = [];

// 录音文件的路径由 id 决定（只有 "audio": true 的词才有录音）
// 汉字模式的锚点读法题（id 是 "read:<锚点词 id>"）用锚点词自己的录音（wordId 见 kanjischedule.js 的 readCard）
export function audioOf(word) { return "audio/" + (word.wordId || word.id) + ".mp3"; }

// 读取词表。async 函数和 Python 的 async def 类似：await 会等网络请求完成再往下走
export async function loadWords() {
  // no-cache：每次都先问服务器 words.json 有没有更新，不直接用浏览器缓存里的旧版本
  const response = await fetch("words.json", { cache: "no-cache" });
  const data = await response.json();
  // words.json 写错时不开始学习，免得把错误的数据写进朋友的进度里
  const problem = checkWords(data);
  if (problem) throw new Error(problem);
  await loadImageIndex();
  words.push(...data.filter((word) => !word.retired && !isHidden(word) && hasImage(word)));
}

// 有加密图片的词：images-enc/index.json（tools/encrypt_images.py 每次运行时写出）。
// 还没有图片的词暂时不出现（和 HIDDEN_TAGS 不同：图片一加上就自动出现，不用改设置）。
// 读不到这个列表（例如旧版本还没有它），就当作全部都有图片
let withImage = null;
async function loadImageIndex() {
  try {
    const response = await fetch("images-enc/index.json", { cache: "no-cache" });
    if (response.ok) withImage = new Set(await response.json());
  } catch (error) { /* 读不到就不隐藏 */ }
}

// 这个词有没有图片（汉字模式的小词也用这个判断）
export function hasImage(word) {
  return withImage === null || withImage.has(word.id);
}

// 这个词的分类全都被隐藏了（config.js 的 HIDDEN_TAGS）
function isHidden(word) {
  return word.tags.length > 0 && word.tags.every((tag) => HIDDEN_TAGS.includes(tag));
}

// 最基本的安全检查（完整的检查在 tools/check_words.py，提交前在电脑上运行）
// 返回错误说明，没问题就返回 ""
function checkWords(list) {
  const seen = new Set();
  for (const word of list) {
    if (!word.id || !word.kana) return "A word has no id or kana: " + JSON.stringify(word);
    if (!Array.isArray(word.tags)) return "tags must be a list, like [\"Doshi_N5\"]: " + word.id;
    if (seen.has(word.id)) return "Duplicate id: " + word.id;
    seen.add(word.id);
  }
  return "";
}
