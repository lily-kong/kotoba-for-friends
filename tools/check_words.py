"""
提交前检查 words.json。在项目根目录运行：

    python tools/check_words.py

- 错误（ERROR）：必须修好再提交，退出码为 1
- 警告（WARN）：可能有问题，自己判断，退出码为 0

除了检查格式，还会和上一次提交（git HEAD）里的 words.json 比较：
已经提交过的 id 不能从词表里消失（要退役请改成 "retired": true）。
"""

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # 项目根目录
WORDS_FILE = ROOT / "words.json"
IMAGES_DIR = ROOT / "images"            # 原图（只在自己电脑上）
ENCRYPTED_DIR = ROOT / "images-enc"     # 加密后的图片（提交到 GitHub）

# 每个词必须有的字段，以及它的类型
FIELDS = {"id": str, "kana": str, "kanji": str, "en": str, "note": str, "tags": list,
          "verb": (str, bool), "retired": bool}
# verb：动词写类别，不是动词写 false
VERB_CLASSES = {"godan", "ichidan", "irregular"}   # 五段、一段、不规则（する、来る）
# 动词还必须有的字段：敬体（ます形）
VERB_FIELDS = {"polite": str, "polite_kana": str}
I_ROW = dict(zip("うくぐすつぬぶむる", "いきぎしちにびみり"))   # 五段动词：词尾 う段 → い段


def expected_polite(kana, verb_class):
    """按动词类别推算 ます形的假名；推算不了就返回 None"""
    if verb_class == "ichidan" and kana.endswith("る"):
        return kana[:-1] + "ます"                     # 食べる → 食べます
    if verb_class == "godan" and kana[-1:] in I_ROW:
        return kana[:-1] + I_ROW[kana[-1]] + "ます"   # 飲む → 飲みます
    if verb_class == "irregular" and kana.endswith("する"):
        return kana[:-2] + "します"                   # 勉強する → 勉強します
    if verb_class == "irregular" and kana.endswith("くる"):
        return kana[:-2] + "きます"                   # 来る → 来ます
    return None
ID_PATTERN = re.compile(r"^[a-z0-9_-]+$")           # id 也是文件名，只用小写字母、数字、_ 和 -
KANA_PATTERN = re.compile(r"^[ぁ-ゟ゠-ヿ]+$")   # 平假名、片假名（含 ー）


def load_published():
    """读取上一次提交里的 words.json；还没有提交过就返回空列表"""
    try:
        result = subprocess.run(["git", "show", "HEAD:words.json"], cwd=ROOT, capture_output=True, check=True)
        return json.loads(result.stdout.decode("utf-8"))
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError):
        return []


def check(words, published):
    errors, warnings = [], []
    ids = set()
    en_owner = {}          # 英文释义 → 第一个用它的 id（只看在用的词）

    for number, word in enumerate(words, start=1):
        if not isinstance(word, dict):
            errors.append(f"第 {number} 项不是一个词：{word!r}")
            continue
        where = f"{word.get('id', f'第 {number} 个词')}"

        kana = word.get("kana")

        # 字段齐全、类型正确
        verb = word.get("verb")
        is_verb = verb in VERB_CLASSES
        if "verb" in word and not is_verb and verb is not False:
            errors.append(f"{where}: verb 必须是 \"godan\"、\"ichidan\"、\"irregular\" 或 false，现在是 {verb!r}")
        required = {**FIELDS, **VERB_FIELDS} if is_verb else FIELDS
        for field, kind in required.items():
            if field not in word:
                errors.append(f"{where}: 缺少字段 {field}")
            elif field != "verb" and not isinstance(word[field], kind):
                errors.append(f"{where}: {field} 应该是 {kind.__name__}，现在是 {word[field]!r}")
        for field in word.keys() - required.keys():
            if field in VERB_FIELDS:
                warnings.append(f"{where}: 不是动词，却有 {field}")
            else:
                warnings.append(f"{where}: 不认识的字段 {field}（拼错了？）")

        # 敬体：假名部分只能是假名，并且以 ます 结尾
        polite_kana = word.get("polite_kana")
        if is_verb and isinstance(polite_kana, str):
            if not KANA_PATTERN.match(polite_kana):
                errors.append(f"{where}: polite_kana 里有假名以外的字符：{polite_kana}")
            for field in VERB_FIELDS:
                if isinstance(word.get(field), str) and not word[field].endswith("ます"):
                    warnings.append(f"{where}: {field} 没有以 ます 结尾：{word[field]}")
            # 和按类别推算出来的敬体对照（例外的动词会出现警告，确认没错就可以忽略）
            if isinstance(kana, str):
                expected = expected_polite(kana, verb)
                if expected is None:
                    warnings.append(f"{where}: {kana} 不像 {verb} 动词，请确认类别")
                elif expected != polite_kana:
                    warnings.append(f"{where}: 按 {verb} 规则，{kana} 的敬体应该是 {expected}，"
                                    f"现在是 {polite_kana}。请确认类别和敬体")

        word_id = word.get("id")
        if isinstance(word_id, str):
            if not ID_PATTERN.match(word_id):
                errors.append(f"{where}: id 只能用小写字母、数字、_ 和 -")
            if word_id in ids:
                errors.append(f"{where}: id 重复")
            ids.add(word_id)

        if isinstance(kana, str) and not KANA_PATTERN.match(kana):
            errors.append(f"{where}: kana 里有假名以外的字符：{kana}")

        tags = word.get("tags")
        if isinstance(tags, list):
            if not all(isinstance(tag, str) and tag for tag in tags):
                errors.append(f"{where}: tags 里每一项都必须是非空的文字")
            if not tags:
                warnings.append(f"{where}: 没有 tags，首页的任何分类里都看不到它（但仍然会被学到）")

        # 以下只检查在用的词
        if word.get("retired") is not False:
            continue
        if isinstance(word_id, str):
            image = IMAGES_DIR / f"{word_id}.jpg"
            encrypted = ENCRYPTED_DIR / f"{word_id}.bin"
            if not image.exists():
                errors.append(f"{where}: 找不到图片 images/{word_id}.jpg")
            elif not encrypted.exists() or encrypted.stat().st_mtime < image.stat().st_mtime:
                errors.append(f"{where}: 加密图片不存在或比原图旧，请运行 python tools/encrypt_images.py")
        en = word.get("en")
        if isinstance(en, str):
            if en in en_owner:
                warnings.append(f"{where}: 英文释义 \"{en}\" 和 {en_owner[en]} 一样，学的时候分不清。可以用 note 区分")
            else:
                en_owner[en] = word_id

    # 没有对应单词的图片
    for image in sorted(IMAGES_DIR.glob("*.jpg")):
        if image.stem not in ids:
            warnings.append(f"images/{image.name}: 没有对应的单词")

    # 和上一次提交比较
    current = {w.get("id"): w for w in words if isinstance(w, dict)}
    for old in published:
        old_id = old.get("id")
        if old_id not in current:
            errors.append(f"{old_id}: 已经提交过的词不能删除，请改成 \"retired\": true（朋友的进度是按 id 记的）")
        elif current[old_id].get("kana") != old.get("kana"):
            warnings.append(f"{old_id}: kana 从 {old.get('kana')} 改成了 {current[old_id].get('kana')}。"
                            f"如果是大改，请退役这个词，再用新 id 添加")

    return errors, warnings


def main():
    sys.stdout.reconfigure(encoding="utf-8")       # Windows 终端也能正常显示中文
    try:
        words = json.loads(WORDS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        print(f"ERROR words.json 不是合法的 JSON：{error}")
        return 1
    if not isinstance(words, list):
        print("ERROR words.json 最外层必须是一个列表 [ ... ]")
        return 1

    errors, warnings = check(words, load_published())
    for message in warnings:
        print("WARN ", message)
    for message in errors:
        print("ERROR", message)

    retired = sum(1 for w in words if isinstance(w, dict) and w.get("retired") is True)
    print(f"\n{len(words)} 个词（{len(words) - retired} 个在用，{retired} 个已退役）："
          f"{len(errors)} 个错误，{len(warnings)} 个警告")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
