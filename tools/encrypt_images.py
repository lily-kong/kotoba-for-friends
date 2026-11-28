"""
把 images/ 里的原图加密成 images-enc/<id>.bin。
原图有版权限制，只保存在自己电脑上（.gitignore 里排除了 images/），GitHub 上只有加密后的文件。

在项目根目录运行：

    python tools/encrypt_images.py            只加密新增或改过的图片（包括替换过的同名图片）
    python tools/encrypt_images.py --all      全部重新加密（改了密码之后用）
    python tools/encrypt_images.py --restore  从 images-enc/ 解密还原出原图（例如换了电脑）

密码保存在项目根目录的 .image-password 文件里（不会提交）。第一次运行时会请你设置。
朋友第一次打开网站时要输入同一个密码。

需要先安装：python -m pip install cryptography
"""

import argparse
import base64
import getpass
import hashlib
import json
import secrets
import sys
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "images"                  # 原图（不提交）
OUT = ROOT / "images-enc"              # 加密后的图片（提交）
META = OUT / "meta.json"               # 解密需要的公开参数：salt、迭代次数、用来验证密码的一小段密文
INDEX = OUT / "index.json"             # 有加密图片的词的 id 列表：网页用它暂时隐藏还没有图片的词
PASSWORD_FILE = ROOT / ".image-password"
ITERATIONS = 200_000                   # PBKDF2 的迭代次数：越大越难暴力猜密码，手机上解锁也越慢
CHECK_TEXT = b"kotoba"                 # 网页用它判断密码对不对


# 密码 + salt → 256 位密钥。网页里用的是完全相同的算法（js/images.js）
def derive_key(password, salt, iterations):
    return hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations)


# 加密结果 = 12 字节随机 nonce + 密文（AES-GCM 会在密文最后附上 16 字节校验码）
def encrypt(key, data):
    nonce = secrets.token_bytes(12)
    return nonce + AESGCM(key).encrypt(nonce, data, None)


def decrypt(key, blob):
    return AESGCM(key).decrypt(blob[:12], blob[12:], None)   # 密钥不对会抛出 InvalidTag


def is_up_to_date(key, image, target):
    """加密文件存在，并且解密出来和现在的原图一模一样（替换过同名图片就会不一样）"""
    if not target.exists():
        return False
    try:
        return decrypt(key, target.read_bytes()) == image.read_bytes()
    except InvalidTag:                                  # 用别的密码加密的，也算需要重新加密
        return False


def get_password():
    if PASSWORD_FILE.exists():
        return PASSWORD_FILE.read_text(encoding="utf-8").strip()
    password = getpass.getpass("设置图片密码（朋友第一次打开网站时要输入）：").strip()
    if not password:
        sys.exit("密码不能为空")
    PASSWORD_FILE.write_text(password, encoding="utf-8")
    print(f"密码已保存到 {PASSWORD_FILE.name}（不会提交到 GitHub）")
    return password


def load_key(password):
    """用现有的 meta.json 算出密钥，并验证密码；密码不对就退出"""
    meta = json.loads(META.read_text(encoding="utf-8"))
    key = derive_key(password, base64.b64decode(meta["salt"]), meta["iterations"])
    try:
        decrypt(key, base64.b64decode(meta["check"]))
    except InvalidTag:
        sys.exit("ERROR 密码和已经加密的图片对不上。如果是改了密码，请用 --all 全部重新加密")
    return key


def new_key(password):
    """生成新的 salt 和 meta.json"""
    salt = secrets.token_bytes(16)
    key = derive_key(password, salt, ITERATIONS)
    meta = {
        "iterations": ITERATIONS,
        "salt": base64.b64encode(salt).decode(),
        "check": base64.b64encode(encrypt(key, CHECK_TEXT)).decode(),
    }
    META.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return key


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="加密 / 还原单词图片")
    parser.add_argument("--all", action="store_true", help="全部重新加密（会生成新的 salt）")
    parser.add_argument("--restore", action="store_true", help="从 images-enc/ 还原原图到 images/")
    args = parser.parse_args()

    password = get_password()
    OUT.mkdir(exist_ok=True)

    if args.restore:
        key = load_key(password)
        SRC.mkdir(exist_ok=True)
        for blob in sorted(OUT.glob("*.bin")):
            (SRC / f"{blob.stem}.jpg").write_bytes(decrypt(key, blob.read_bytes()))
        print(f"还原了 {len(list(OUT.glob('*.bin')))} 张图片到 images/")
        return 0

    key = new_key(password) if args.all or not META.exists() else load_key(password)

    count = 0
    for image in sorted(SRC.glob("*.jpg")):
        target = OUT / f"{image.stem}.bin"
        # 加密结果每次都不一样（nonce 是随机的），所以没改过的图片不重新加密，免得 git 里每次都有改动。
        # 判断“改没改过”是把加密文件解密后和原图逐字节比较，不看修改时间
        # （Windows 里复制文件会保留旧的修改时间，只看时间会漏掉替换过的同名图片）
        if not args.all and is_up_to_date(key, image, target):
            continue
        target.write_bytes(encrypt(key, image.read_bytes()))
        count += 1

    for blob in sorted(OUT.glob("*.bin")):
        if not (SRC / f"{blob.stem}.jpg").exists():
            print(f"WARN  images-enc/{blob.name}: images/ 里没有对应的原图")
    write_index()
    print(f"加密了 {count} 张图片（共 {len(list(OUT.glob('*.bin')))} 张）")
    return 0


def write_index():
    """写出 images-enc/index.json：现在有加密图片的全部 id。
    网页读这个列表：还没有图片的词先不出现（不用一个个去问服务器“这张图存不存在”）"""
    ids = sorted(blob.stem for blob in OUT.glob("*.bin"))
    INDEX.write_text("[\n" + ",\n".join(f'  "{i}"' for i in ids) + "\n]\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    sys.exit(main())
