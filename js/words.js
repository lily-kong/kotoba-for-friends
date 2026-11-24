// 读取 words.json

import { HIDDEN_TAGS } from "./config.js";

// 正在使用的单词（已退役的 retired 词、隐藏分类里的词不在这里）。
// 用 const 数组 + push 填进去，其他模块 import 之后拿到的就是同一个数组（和 Python 模块里的 list 一样）
export const words = [];

// 录音文件的路径由 id 决定（只有 "audio": true 的词才有录音）
export function audioOf(word) { return "audio/" + word.id + ".mp3"; }

// 读取词表。async 函数和 Python 的 async def 类似：await 会等网络请求完成再往下走
export async function loadWords() {
  // no-cache：每次都先问服务器 words.json 有没有更新，不直接用浏览器缓存里的旧版本
  const response = await fetch("words.json", { cache: "no-cache" });
  const data = await response.json();
  // words.json 写错时不开始学习，免得把错误的数据写进朋友的进度里
  const problem = checkWords(data);
  if (problem) throw new Error(problem);
  words.push(...data.filter((word) => !word.retired && !isHidden(word)));
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
