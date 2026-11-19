// 单词图片。图片有版权限制，所以是加密存放的（images-enc/<id>.bin，由 tools/encrypt_images.py 生成），
// 放在 GitHub 上也没法直接查看。朋友输入一次密码，之后在浏览器里解密显示。
// 用的是浏览器自带的加密功能 crypto.subtle，算法和 Python 那边完全一样：PBKDF2 → AES-GCM
// 注意：crypto.subtle 只能在 https 或 localhost 下使用

const PASSWORD_KEY = "kotoba-image-password";   // 密码记在这台手机里，下次不用再输
let key = null;                                 // 解密用的密钥，unlock 成功后才有
const cache = new Map();                        // 单词 id → 解密后的图片地址（只解密一次）

// 用密码解锁。密码对就返回 true，并记住密码
export async function unlock(password) {
  if (!password) return false;
  const meta = await (await fetch("images-enc/meta.json", { cache: "no-cache" })).json();
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const candidate = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(meta.salt), iterations: meta.iterations, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  try {
    await decrypt(candidate, fromBase64(meta.check));   // 密码不对，这里会出错
  } catch (error) {
    return false;
  }
  key = candidate;
  try { localStorage.setItem(PASSWORD_KEY, password); } catch (error) {}
  return true;
}

export function savedPassword() {
  try { return localStorage.getItem(PASSWORD_KEY) || ""; } catch (error) { return ""; }
}

// 返回一个 Promise，得到可以直接放进 <img src> 的图片地址
export function imageUrl(word) {
  if (!cache.has(word.id)) {
    const loading = loadImage(word.id);
    loading.catch(() => cache.delete(word.id));   // 失败了（例如断网）就不缓存，下次再试
    cache.set(word.id, loading);
  }
  return cache.get(word.id);
}

async function loadImage(id) {
  // no-cache：重新加密过的图片不会用到浏览器缓存里的旧文件
  const response = await fetch("images-enc/" + id + ".bin", { cache: "no-cache" });
  if (!response.ok) throw new Error("Missing image: " + id);
  const data = await decrypt(key, new Uint8Array(await response.arrayBuffer()));
  return URL.createObjectURL(new Blob([data], { type: "image/jpeg" }));
}

// 文件格式：前 12 字节是 nonce，后面是密文
function decrypt(cryptoKey, bytes) {
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, cryptoKey, bytes.slice(12));
}

function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}
