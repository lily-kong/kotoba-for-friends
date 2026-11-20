// 写给朋友的指南：直接读取仓库里的 FRIENDS.md，用 marked 转成网页显示
// （marked 由 index.html 加载，提供全局变量 marked）。
// 每次更新在 FRIENDS.md 最上面写一封新的 “## Letter — 日期”；
// 朋友还没读过最新的一封时，首页的 Guide 按钮上会显示 new

import { el, show } from "./ui.js";

const READ_KEY = "kotoba-letter-read";   // 这台手机读过的最新一封信的标题
let guideText = "";                      // FRIENDS.md 的内容（只下载一次）

async function loadGuide() {
  if (!guideText) {
    // no-cache：更新了 FRIENDS.md 之后，朋友马上能看到新的信
    guideText = await (await fetch("FRIENDS.md", { cache: "no-cache" })).text();
  }
  return guideText;
}

// 最新一封信的标题，例如 "Letter — 2026-11-19"（第一个以 "## Letter" 开头的标题）
function latestLetter(markdown) {
  const match = markdown.match(/^## (Letter.*)$/m);
  return match ? match[1].trim() : "";
}

function readLetter() {
  try { return localStorage.getItem(READ_KEY) || ""; } catch (error) { return ""; }
}

// 首页：有没读过的新信，就在 Guide 按钮上显示 new
export async function updateGuideBadge() {
  try {
    const latest = latestLetter(await loadGuide());
    el.guideNew.classList.toggle("hidden", !latest || latest === readLetter());
  } catch (error) { /* 读不到 FRIENDS.md 就不显示 */ }
}

// 打开指南页，并记下“最新的信已经读过了”
export async function openGuide() {
  try {
    const markdown = await loadGuide();
    // FRIENDS.md 是我们自己写的文件，所以可以直接把转换出来的 HTML 放进页面
    el.guideContent.innerHTML = marked.parse(markdown);
    try { localStorage.setItem(READ_KEY, latestLetter(markdown)); } catch (error) {}
    el.guideNew.classList.add("hidden");
  } catch (error) {
    el.guideContent.textContent = "Could not load the guide. Please check your internet connection.";
  }
  show("guide");
  window.scrollTo(0, 0);
}
