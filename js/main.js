// 程序入口：网页打开时从这里开始执行（相当于 Python 的 if __name__ == "__main__":）
// 其他文件只定义函数，在这里把它们连接起来

import { el, show } from "./ui.js";
import { loadWords } from "./words.js";
import { renderHome, setupTools, onStudy } from "./home.js";
import { startGroup, startKanjiGroup, quitGroup, typeKey } from "./quiz.js";
import { setupKeyboard } from "./keyboard.js";
import { unlockSound } from "./sound.js";
import { unlock, savedPassword } from "./images.js";
import { openGuide, updateGuideBadge } from "./guide.js";
import { renderKanji, onStudyKanji, setupKanji } from "./kanjimode.js";

// ---------- 页面之间的跳转 ----------
// 一组学完（Continue）或中途退出（×）后回到哪一页：从哪个模式开始的，就回到哪个模式
let backToMode = renderHome;

// 开始学习：先解锁读音（iPhone 要求在点击时做），再开始一组。tag = null 表示从全部单词里学
function study(tag) {
  unlockSound();
  backToMode = renderHome;
  startGroup(tag);
}
el.study.addEventListener("click", () => study(null));   // 首页上方：全部单词，随机
onStudy(study);                                          // 每个分类自己的 Study 按钮
// 汉字模式的 Study kanji 按钮：group = kanjischedule.js 选好的一组
onStudyKanji((group) => {
  unlockSound();
  backToMode = renderKanji;
  startKanjiGroup(group.cards, group.requires);
});
el.quit.addEventListener("click", () => {
  quitGroup();
  backToMode();
});
el.continue.addEventListener("click", () => backToMode());
el.back.addEventListener("click", renderHome);
el.guideBtn.addEventListener("click", openGuide);
el.guideBack.addEventListener("click", renderHome);
// 底部的模式切换：Words = 普通背单词（首页，默认），Kanji = 汉字模式
el.modeWords.addEventListener("click", renderHome);
el.modeKanji.addEventListener("click", renderKanji);

setupKeyboard(typeKey);   // 键盘按下时调用答题流程里的 typeKey
setupTools();
setupKanji();
updateGuideBadge();       // 有新的信，就在首页的 Guide 按钮上显示 new

// 密码页：输入密码 → 解锁成功就进入首页
el.lock.addEventListener("submit", async (event) => {
  event.preventDefault();                      // 不让表单真的提交（那会刷新页面）
  el.lockError.textContent = "";
  if (await unlock(el.password.value.trim())) {
    el.password.value = "";
    renderHome();
  } else {
    el.lockError.textContent = "Wrong password.";
  }
});

// ---------- 读取词表，用记住的密码解锁，显示首页 ----------
loadWords()
  .then(() => unlock(savedPassword()))
  .then((unlocked) => {
    if (unlocked) renderHome();
    else show("lock");                         // 第一次打开（或密码换了）：先输入密码
    // 请求浏览器不要自动清理这个网站的数据（浏览器可能不理会）
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
  })
  .catch((error) => {
    show("home");
    el.studyInfo.textContent = "Could not start. " + error.message;
    el.study.classList.add("hidden");
  });
