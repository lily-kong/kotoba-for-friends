// 页面工具：其他模块都会用到

// 把 HTML 里所有带 id 的元素收进 el，例如 <div id="kanji"> 就是 el.kanji
export const el = {};
for (const node of document.querySelectorAll("[id]")) el[node.id] = node;

// 新建一个元素，例如 make("div", "sub", "to eat") → <div class="sub">to eat</div>
export function make(tag, className, text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}

// 切换页面：只显示 name 这一页（lock / home / guide / tag / quiz / done）
export function show(name) {
  for (const view of ["lock", "home", "guide", "tag", "quiz", "done"]) {
    el[view].classList.toggle("hidden", view !== name);
  }
}
