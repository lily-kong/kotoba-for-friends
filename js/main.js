// 程序入口：网页打开时从这里开始执行（相当于 Python 的 if __name__ == "__main__":）
// 其他文件只定义函数，在这里把它们连接起来

import { el, show } from "./ui.js";
import { loadWords } from "./words.js";
import { renderHome, setupTools } from "./home.js";
import { startGroup, quitGroup, typeKey } from "./quiz.js";
import { setupKeyboard } from "./keyboard.js";
import { unlockSound, checkAudioFiles } from "./sound.js";
import { unlock, savedPassword } from "./images.js";

// ---------- 页面之间的跳转 ----------
el.study.addEventListener("click", () => {
  unlockSound();
  startGroup();
});
el.quit.addEventListener("click", () => {
  quitGroup();
  renderHome();
});
el.continue.addEventListener("click", renderHome);
el.back.addEventListener("click", renderHome);

setupKeyboard(typeKey);   // 键盘按下时调用答题流程里的 typeKey
setupTools();

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
    checkAudioFiles();
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
