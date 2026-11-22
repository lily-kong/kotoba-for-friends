// 屏幕键盘 + 电脑键盘。两种键盘按下时都调用同一个 onKey(key)，所以行为完全一样

import { el, make } from "./ui.js";

// 和 iPhone 日文罗马字键盘一样的排列，长音 ー 在第二行末尾
const KEY_ROWS = [
  [..."qwertyuiop"],                           // [..."abc"] 把字符串拆成 ["a", "b", "c"]
  [..."asdfghjkl", "-"],
  [..."zxcvbnm", "Backspace"],
  ["Enter"],
];
const KEY_LABELS = { "-": "ー", Backspace: "⌫", Enter: "Hint" };  // 其他键直接显示字母
const keyButtons = {};                         // 按键名 → 屏幕上的按钮

// 生成屏幕键盘，并开始监听电脑键盘
export function setupKeyboard(onKey) {
  for (const keys of KEY_ROWS) {
    const row = make("div", "key-row");
    for (const key of keys) row.appendChild(makeKey(key, onKey));
    el.keyboard.appendChild(row);
  }

  document.addEventListener("keydown", (event) => {
    const key = keyFromCode(event.code);
    if (!key || el.quiz.classList.contains("hidden")) return;   // 只在答题页有效
    if (event.ctrlKey || event.metaKey || event.altKey) return; // 不影响 Ctrl+R 之类的快捷键
    event.preventDefault();
    keyButtons[key].classList.add("pressed");  // 屏幕上对应的键也显示按下
    if (key === "Enter" && event.repeat) return; // 按住回车不放，不会连续触发 Hint
    onKey(key);
  });

  document.addEventListener("keyup", (event) => {
    const key = keyFromCode(event.code);
    if (key) keyButtons[key].classList.remove("pressed");
  });
}

// 显示或隐藏 Hint 键（隐藏时仍占位置，键盘不会跳动）
export function setHintVisible(visible) {
  keyButtons.Enter.classList.toggle("invisible", !visible);
}

function makeKey(key, onKey) {
  const button = make("button", "key", KEY_LABELS[key] || key);
  button.type = "button";
  button.dataset.key = key;                    // CSS 用 [data-key="Enter"] 给特殊键上色
  keyButtons[key] = button;

  // 手指按下：显示按下效果；手指抬起：才真正输入（iPhone 键盘也是抬起时才输入）
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();                    // 不让按钮获得焦点，避免和电脑回车键冲突
    // “锁定”这个键：手指按下后稍微滑出这个键再抬起，仍然算按了它，不会丢字
    try { button.setPointerCapture(event.pointerId); } catch (error) { /* 不支持就算了 */ }
    button.classList.add("pressed");
  });
  button.addEventListener("pointerup", () => {
    if (button.classList.contains("pressed")) onKey(key);
    button.classList.remove("pressed");
  });
  // 被系统打断（例如来电）：取消，不输入。键盘设了 touch-action: none，滑动页面不会再打断按键
  button.addEventListener("pointercancel", () => button.classList.remove("pressed"));
  return button;
}

// 电脑键盘：用 event.code（物理键位，例如 "KeyA"）而不是 event.key，
// 这样就算电脑开着日文输入法，按 A 键也一定得到 "a"
function keyFromCode(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (code === "Enter" || code === "NumpadEnter") return "Enter";
  if (code === "Backspace") return "Backspace";
  if (code === "Minus") return "-";            // 减号键 = 长音 ー
  return null;                                 // 其他键不管
}
