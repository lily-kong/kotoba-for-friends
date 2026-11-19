// 首页（全部分类）和分类页（一个分类里的单词）

import { DAY_MS } from "./config.js";
import { el, make, show } from "./ui.js";
import { words } from "./words.js";
import { pickGroup } from "./schedule.js";
import { loadProgress, resetProgress, exportData, importData } from "./storage.js";

// ---------- 首页 ----------
export function renderHome() {
  const progress = loadProgress();
  const now = Date.now();
  const picked = pickGroup(progress, now);
  const count = picked.fresh.length + picked.review.length;

  if (count > 0) {
    el.studyInfo.textContent =
      "Next group: " + picked.fresh.length + " new, " + picked.review.length + " review";
    el.study.classList.remove("hidden");
  } else {
    // 没有新词，也没有到期的复习词
    const dues = words.filter((w) => progress.words[w.id]).map((w) => progress.words[w.id].due);
    el.studyInfo.textContent = dues.length
      ? "Nothing to review yet. Next review " + formatWhen(Math.min(...dues)) + "."
      : "No words found.";
    el.study.classList.add("hidden");
  }

  // 每个分类一行，按在 words.json 里第一次出现的顺序。一个词可以出现在好几个分类里
  const tags = [...new Set(words.flatMap((w) => w.tags))];
  el.tagList.innerHTML = "";
  for (const tag of tags) {
    const list = words.filter((w) => w.tags.includes(tag));
    const learned = list.filter((w) => progress.words[w.id]);
    const due = learned.filter((w) => progress.words[w.id].due <= now);

    const row = make("button", "row");
    row.type = "button";
    row.append(
      make("div", "main", tag),
      make("div", "status", learned.length + " / " + list.length + " learned"
        + (due.length ? ", " + due.length + " to review" : "")),
    );
    row.addEventListener("click", () => renderTag(tag));
    el.tagList.appendChild(row);
  }
  show("home");
}

// ---------- 分类页 ----------
function renderTag(tag) {
  const progress = loadProgress();
  const now = Date.now();
  el.tagTitle.textContent = tag;
  el.wordList.innerHTML = "";

  for (const word of words.filter((w) => w.tags.includes(tag))) {
    const p = progress.words[word.id];

    const left = make("div", "");
    left.append(
      make("div", "main", word.kanji + "  " + word.kana),
      make("div", "sub", word.en + (word.note ? " · " + word.note : "")),
    );
    const status = make("div", "status");
    if (!p) {
      status.textContent = "New";
    } else if (p.due <= now) {
      status.textContent = "Review now";
      status.classList.add("due");
    } else {
      status.textContent = "Review " + formatWhen(p.due);
    }
    const row = make("div", "row");
    row.append(left, status);
    el.wordList.appendChild(row);
  }
  show("tag");
}

// 把时间显示成 "now" / "in 5 h" / "in 3 d"
function formatWhen(time) {
  const diff = time - Date.now();
  if (diff <= 0) return "now";
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  if (hours < 24) return "in " + hours + " h";
  return "in " + Math.round(diff / DAY_MS) + " d";
}

// ---------- 首页下面的三个按钮 ----------
export function setupTools() {
  // 导出：把进度和学习日志下载成一个 JSON 文件（备份，或者发给你分析）
  el.exportBtn.addEventListener("click", () => {
    const data = exportData();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    link.download = "kotoba-" + data.user + "-" + data.exported.slice(0, 10) + ".json";
    link.click();
  });

  // 导入：把导出的文件合并进现在的数据（不会覆盖更新的记录）
  el.importBtn.addEventListener("click", () => el.importFile.click());
  el.importFile.addEventListener("change", async () => {
    const file = el.importFile.files[0];
    el.importFile.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!confirm("Merge this file into your progress? For each word, the most recent record is kept.")) return;
      importData(data);
      renderHome();
    } catch (error) {
      alert("This file is not a valid progress file.");
    }
  });

  // 重置：清空进度，从头开始（学习日志保留）
  el.reset.addEventListener("click", () => {
    if (confirm("Delete all progress and start over?")) {
      resetProgress();
      renderHome();
    }
  });
}
