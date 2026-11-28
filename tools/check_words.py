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
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent      # 项目根目录
WORDS_FILE = ROOT / "words.json"
IMAGES_DIR = ROOT / "images"            # 原图（只在自己电脑上）
ENCRYPTED_DIR = ROOT / "images-enc"     # 加密后的图片（提交到 GitHub）
AUDIO_DIR = ROOT / "audio"              # 录音（"audio": true 的词才有）
MISSING_FILE = ROOT / "missing_images.txt"  # 还没有图片的词（每次检查时重新生成，不提交）
CONFIG_FILE = ROOT / "js" / "config.js"     # 读取 HIDDEN_TAGS（暂时隐藏的分类）
KANJI_WORDS_FILE = ROOT / "kanji_words.json"  # 汉字模式的小词（每个都用 anchors 挂在一个锚点词上）
# 小词必须有的字段（小词只在汉字模式里出现；和普通单词一样要有图片 images/<id>.jpg）
# note 和 words.json 一样：英文只写一个意思，需要补充时写在 note 里（没有就写 ""）
# audio 和 words.json 一样：有录音 audio/<id>.mp3 时为 true（tools/make_audio.py --approve 会设好）
KANJI_WORD_FIELDS = {"id": str, "kana": str, "kanji": str, "en": str, "note": str, "audio": bool, "anchors": list}

# 每个词必须有的字段，以及它的类型
FIELDS = {"id": str, "kana": str, "kanji": str, "en": str, "note": str, "tags": list,
          "verb": (str, bool), "audio": bool, "retired": bool}
# verb：动词写类别，不是动词写 false
VERB_CLASSES = {"godan", "ichidan", "irregular"}   # 五段、一段、不规则（する、来る）
# 动词还必须有的字段：敬体（ます形）
VERB_FIELDS = {"polite": str, "polite_kana": str}
# 可以没有的字段
# anchors：这个词里的汉字挂在哪个已学的词（锚点）上，给以后的锚点练习用（格式见 README）。例如 意見：
#   "anchors": [{"char": "見", "word": "miru-to_see", "reading": "けん", "meaning": "view"}]
OPTIONAL_FIELDS = {"anchors": list}
ANCHOR_KEYS = {"char", "word", "reading", "meaning"}
I_ROW = dict(zip("うくぐすつぬぶむる", "いきぎしちにびみり"))   # 五段动词：词尾 う段 → い段
# 五段动词里的例外：敬体是 ～います，不是 ～ります
HONORIFIC_ARU = ("いらっしゃる", "おっしゃる", "なさる", "くださる", "ござる")
ID_PATTERN = re.compile(r"^[a-z0-9_-]+$")           # id 也是文件名，只用小写字母、数字、_ 和 -
KANA_PATTERN = re.compile(r"^[ぁ-ゟ゠-ヿ]+$")         # 平假名、片假名（含 ー）


def expected_polite(kana, verb_class):
    """按动词类别推算 ます形的假名；推算不了就返回 None"""
    if verb_class == "godan" and kana.endswith(HONORIFIC_ARU):
        return kana[:-1] + "います"                   # いらっしゃる → いらっしゃいます
    if verb_class == "ichidan" and kana.endswith("る"):
        return kana[:-1] + "ます"                     # 食べる → 食べます
    if verb_class == "godan" and kana[-1:] in I_ROW:
        return kana[:-1] + I_ROW[kana[-1]] + "ます"   # 飲む → 飲みます
    if verb_class == "irregular" and kana.endswith("する"):
        return kana[:-2] + "します"                   # 勉強する → 勉強します
    if verb_class == "irregular" and kana.endswith("くる"):
        return kana[:-2] + "きます"                   # 来る → 来ます
    return None


_key = None   # 图片密钥（第一次用到时才计算）；False = 算不出来


def encryption_key():
    """用 .image-password 算出图片密钥；没有密码文件或没装 cryptography 时返回 None"""
    global _key
    if _key is None:
        try:
            import encrypt_images                          # 同一个文件夹里的加密脚本
            password = encrypt_images.PASSWORD_FILE.read_text(encoding="utf-8").strip()
            _key = encrypt_images.load_key(password)       # 密码不对时它会 sys.exit
        except (ImportError, OSError, SystemExit):
            _key = False
    return _key or None


def encrypted_is_current(image, encrypted):
    """加密图片是否和现在的原图一致。
    有密码时：解密后逐字节比较（替换过同名图片也能发现）；没有密码时：只能比较修改时间"""
    if not encrypted.exists():
        return False
    key = encryption_key()
    if key is None:
        return encrypted.stat().st_mtime >= image.stat().st_mtime
    import encrypt_images
    return encrypt_images.is_up_to_date(key, image, encrypted)


def load_published():
    """读取上一次提交里的 words.json；还没有提交过就返回空列表"""
    try:
        result = subprocess.run(["git", "show", "HEAD:words.json"], cwd=ROOT, capture_output=True, check=True)
        return json.loads(result.stdout.decode("utf-8"))
    except (subprocess.CalledProcessError, FileNotFoundError, json.JSONDecodeError):
        return []


def load_hidden_tags():
    """从 js/config.js 读出 HIDDEN_TAGS，例如 ["Doshi_hoka"]；读不到就当作没有隐藏的分类"""
    match = re.search(r"HIDDEN_TAGS\s*=\s*(\[[^\]]*\])", CONFIG_FILE.read_text(encoding="utf-8"))
    try:
        return json.loads(match.group(1)) if match else []
    except json.JSONDecodeError:
        return []


def is_hidden(word, hidden_tags):
    """这个词的分类全都被隐藏了（和 js/words.js 的规则一样）：朋友现在学不到它"""
    tags = word.get("tags")
    return isinstance(tags, list) and len(tags) > 0 and all(tag in hidden_tags for tag in tags)


def load_kanji_words(errors):
    """读取 kanji_words.json；没有这个文件就返回空列表，写错了就报错"""
    if not KANJI_WORDS_FILE.exists():
        return []
    try:
        data = json.loads(KANJI_WORDS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        errors.append(f"{KANJI_WORDS_FILE.name} 不是合法的 JSON：{error}")
        return []
    if not isinstance(data, list) or not all(isinstance(w, dict) for w in data):
        errors.append(f"{KANJI_WORDS_FILE.name} 最外层必须是一个列表，里面每一项是一个词")
        return []
    return data


def check_kanji_words(kanji_words, word_ids, errors):
    """检查小词本身：字段齐全、id 不重复（也不能和 words.json 重复）、假名正确。锚点由 check_anchors 检查"""
    seen = set()
    for word in kanji_words:
        where = f"{KANJI_WORDS_FILE.name} {word.get('id', '?')}"
        for field, kind in KANJI_WORD_FIELDS.items():
            if not isinstance(word.get(field), kind):
                errors.append(f"{where}: 缺少字段 {field}，或者类型不对")
        for field in word.keys() - KANJI_WORD_FIELDS.keys():
            errors.append(f"{where}: 不认识的字段 {field}")
        word_id = word.get("id")
        if isinstance(word_id, str):
            if not ID_PATTERN.match(word_id):
                errors.append(f"{where}: id 只能用小写字母、数字、_ 和 -")
            if word_id in seen or word_id in word_ids:
                errors.append(f"{where}: id 重复（kanji_words.json 和 words.json 里的 id 都不能重复）")
            seen.add(word_id)
        if isinstance(word.get("kana"), str) and not KANA_PATTERN.match(word["kana"]):
            errors.append(f"{where}: kana 里有假名以外的字符：{word['kana']}")


def check_anchor_roots(words, kanji_words, errors):
    """每个小词的锚点链最后都要连到 words.json 里在用的词。
    例：電車 挂在 電話 上，電話 挂在 話す 上 → 可以；两个小词互相挂着 → 谁都学不到，报错"""
    learnable = {w.get("id") for w in words if isinstance(w, dict) and w.get("retired") is False}
    pending = [w for w in kanji_words if isinstance(w.get("anchors"), list)]
    changed = True
    while changed:                               # 一轮轮往外扩：锚点词能学到，挂在它上面的小词也能学到
        changed = False
        for word in pending[:]:
            if any(isinstance(a, dict) and a.get("word") in learnable for a in word["anchors"]):
                learnable.add(word.get("id"))
                pending.remove(word)
                changed = True
    for word in pending:
        errors.append(f"{KANJI_WORDS_FILE.name} {word.get('id')}: 锚点链连不到 words.json 里在用的词（互相挂着？），永远学不到")


def units_of(kanji_words):
    """小词按单元（汉字 + 锚点词）分组：{"見:miru-to_see": [小词 id, ...]}"""
    units = {}
    for word in kanji_words:
        for anchor in word.get("anchors") or []:
            if isinstance(anchor, dict):
                units.setdefault(f"{anchor.get('char')}:{anchor.get('word')}", []).append(word.get("id"))
    return units


def check(words, published, hidden_tags=(), kanji_words=()):
    """返回 (errors, warnings, missing, hidden_missing)：
    missing = 朋友现在学得到、却还没有图片的词；hidden_missing = 被隐藏、也没有图片的词（不算错误）"""
    errors, warnings, missing, hidden_missing = [], [], [], []
    ids = set()
    en_groups = {}         # 英文释义 → [(id, note), ...]（只看在用、没有隐藏的词）

    for number, word in enumerate(words, start=1):
        if not isinstance(word, dict):
            errors.append(f"第 {number} 项不是一个词：{word!r}")
            continue
        where = f"{word.get('id', f'第 {number} 个词')}"
        # 隐藏分类里的词朋友现在学不到：不给它警告（错误照常报），取消隐藏后才警告
        hidden = is_hidden(word, hidden_tags)
        warn = (lambda message: None) if hidden else warnings.append

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
        for field, kind in OPTIONAL_FIELDS.items():
            if field in word and not isinstance(word[field], kind):
                errors.append(f"{where}: {field} 应该是 {kind.__name__}，现在是 {word[field]!r}")
        for field in word.keys() - required.keys() - OPTIONAL_FIELDS.keys():
            if field in VERB_FIELDS:
                warn(f"{where}: 不是动词，却有 {field}")
            else:
                warn(f"{where}: 不认识的字段 {field}（拼错了？）")

        # 敬体：假名部分只能是假名，并且以 ます 结尾
        polite_kana = word.get("polite_kana")
        if is_verb and isinstance(polite_kana, str):
            if not KANA_PATTERN.match(polite_kana):
                errors.append(f"{where}: polite_kana 里有假名以外的字符：{polite_kana}")
            for field in VERB_FIELDS:
                if isinstance(word.get(field), str) and not word[field].endswith("ます"):
                    warn(f"{where}: {field} 没有以 ます 结尾：{word[field]}")
            # 和按类别推算出来的敬体对照（例外的动词会出现警告，确认没错就可以忽略）
            if isinstance(kana, str):
                expected = expected_polite(kana, verb)
                if expected is None:
                    warn(f"{where}: {kana} 不像 {verb} 动词，请确认类别")
                elif expected != polite_kana:
                    warn(f"{where}: 按 {verb} 规则，{kana} 的敬体应该是 {expected}，"
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
                warn(f"{where}: 没有 tags，首页的任何分类里都看不到它（但仍然会被学到）")

        # 以下只检查在用的词
        if word.get("retired") is not False:
            continue
        if isinstance(word_id, str):
            image = IMAGES_DIR / f"{word_id}.jpg"
            encrypted = ENCRYPTED_DIR / f"{word_id}.bin"
            if not image.exists():
                # 不逐个报错，最后汇总成一行，详细列表写进文件；隐藏分类里的词朋友学不到，先不用找图
                (hidden_missing if hidden else missing).append(word)
            elif not encrypted_is_current(image, encrypted):
                errors.append(f"{where}: 加密图片不存在，或者和原图不一样（换过图片？），请运行 python tools/encrypt_images.py")
        # 录音：标了 true 就必须有文件；有文件却还是 false，提醒改成 true（否则不会播放）
        if isinstance(word_id, str):
            has_file = (AUDIO_DIR / f"{word_id}.mp3").exists()
            if word.get("audio") is True and not has_file:
                errors.append(f"{where}: \"audio\": true，但找不到 audio/{word_id}.mp3")
            elif word.get("audio") is False and has_file:
                warn(f"{where}: 有录音 audio/{word_id}.mp3，把 \"audio\" 改成 true 才会播放")
        en = word.get("en")
        if isinstance(en, str) and not hidden:       # 英文重复只在朋友学得到的词之间比较
            en_groups.setdefault(en, []).append((word_id, word.get("note", "")))

    # 英文释义相同的词：学的时候只看到英文和 note，所以每个都要有自己独特的 note
    for en, group in en_groups.items():
        if len(group) < 2:
            continue
        notes = [note for _, note in group]
        others = "、".join(word_id for word_id, _ in group)
        for word_id, note in group:
            if not note:
                warnings.append(f"{word_id}: 英文 \"{en}\" 有 {len(group)} 个词（{others}），这个没有 note，学的时候分不清")
            elif notes.count(note) > 1:
                warnings.append(f"{word_id}: 英文 \"{en}\" 有 {len(group)} 个词（{others}），note \"{note}\" 也一样，分不清")

    # 锚点：words.json 里的词和汉字模式的小词一起检查。小词的锚点词可以是 words.json 里的词（第一版），
    # 也可以是另一个小词（第二版），但锚点链最后一定要连到 words.json
    check_kanji_words(kanji_words, {w.get("id") for w in words if isinstance(w, dict)}, errors)
    check_anchors(list(words) + list(kanji_words), errors)
    check_anchor_roots(words, kanji_words, errors)
    for unit, smalls in units_of(kanji_words).items():
        if len(smalls) > 3:
            warnings.append(f"{KANJI_WORDS_FILE.name}: {unit} 有 {len(smalls)} 个小词（{'、'.join(smalls)}），一个单元最好只有 1～3 个")
    # 小词也要有图片（汉字模式里和普通单词一样看图片答假名）
    for word in kanji_words:
        word_id = word.get("id")
        if not isinstance(word_id, str):
            continue
        ids.add(word_id)                         # 小词的图片不算“没有对应的单词”
        image, encrypted = IMAGES_DIR / f"{word_id}.jpg", ENCRYPTED_DIR / f"{word_id}.bin"
        if not image.exists():
            missing.append(word)
        elif not encrypted_is_current(image, encrypted):
            errors.append(f"{KANJI_WORDS_FILE.name} {word_id}: 加密图片不存在，或者和原图不一样，请运行 python tools/encrypt_images.py")
        has_audio = (AUDIO_DIR / f"{word_id}.mp3").exists()
        if word.get("audio") is True and not has_audio:
            errors.append(f"{KANJI_WORDS_FILE.name} {word_id}: \"audio\": true，但找不到 audio/{word_id}.mp3")
        elif word.get("audio") is False and has_audio:
            warnings.append(f"{KANJI_WORDS_FILE.name} {word_id}: 有录音 audio/{word_id}.mp3，把 \"audio\" 改成 true 才会播放")

    # 没有对应单词的图片（例如文件名打错了）
    for image in sorted(IMAGES_DIR.glob("*.jpg")):
        if image.stem not in ids:
            warnings.append(f"images/{image.name}: 没有对应的单词")
    # 没有对应单词的加密图片（例如改了原图的文件名，旧名字的加密文件还留着）：会被一起推送，应该删掉
    for blob in sorted(ENCRYPTED_DIR.glob("*.bin")):
        if blob.stem not in ids:
            warnings.append(f"images-enc/{blob.name}: 没有对应的单词，请删除")
    # 没有对应单词的录音（例如文件名打错了）
    for recording in sorted(AUDIO_DIR.glob("*.mp3")):
        if recording.stem not in ids:
            warnings.append(f"audio/{recording.name}: 没有对应的单词")

    # 和上一次提交比较
    current = {w.get("id"): w for w in words if isinstance(w, dict)}
    for old in published:
        old_id = old.get("id")
        if old_id not in current:
            errors.append(f"{old_id}: 已经提交过的词不能删除，请改成 \"retired\": true（朋友的进度是按 id 记的）")
        elif current[old_id].get("kana") != old.get("kana") and not is_hidden(current[old_id], hidden_tags):
            warnings.append(f"{old_id}: kana 从 {old.get('kana')} 改成了 {current[old_id].get('kana')}。"
                            f"如果是大改，请退役这个词，再用新 id 添加")

    # 还没有图片的词不算错误：网页会暂时不显示它们（见 js/words.js 的 hasImage），图片加上后自动出现。
    # 但 images-enc/index.json（网页靠它判断有没有图片）必须和实际的加密图片一致
    index_file = ENCRYPTED_DIR / "index.json"
    actual = sorted(blob.stem for blob in ENCRYPTED_DIR.glob("*.bin"))
    listed = json.loads(index_file.read_text(encoding="utf-8")) if index_file.exists() else None
    if listed != actual:
        errors.append(f"images-enc/index.json 和加密图片对不上（新图片不会出现），请运行 python tools/encrypt_images.py")
    return errors, warnings, missing, hidden_missing


def check_anchors(words, errors):
    """检查 anchors 字段：锚点字在这个词里、锚点词存在并且在用、读音是这个词读音的一部分"""
    by_id = {w.get("id"): w for w in words if isinstance(w, dict)}
    for word in words:
        if not isinstance(word, dict) or not isinstance(word.get("anchors"), list):
            continue
        where = word.get("id")
        if not word["anchors"]:
            errors.append(f"{where}: anchors 是空列表，没有锚点就删掉这个字段")
        for anchor in word["anchors"]:
            if not isinstance(anchor, dict) or anchor.keys() != ANCHOR_KEYS                     or not all(isinstance(anchor[key], str) and anchor[key] for key in ANCHOR_KEYS):
                errors.append(f"{where}: anchors 里每一项都要有 char、word、reading、meaning 四个非空文字：{anchor!r}")
                continue
            char, target = anchor["char"], by_id.get(anchor["word"])
            if len(char) != 1 or char not in word.get("kanji", ""):
                errors.append(f"{where}: 锚点字 {char} 应该是一个字，并且出现在 {word.get('kanji')} 里")
            if target is None:
                errors.append(f"{where}: 锚点词 {anchor['word']} 不存在")
            elif target is word:
                errors.append(f"{where}: 锚点词不能是自己")
            else:
                if target.get("retired") is not False:
                    errors.append(f"{where}: 锚点词 {anchor['word']} 已经退役")
                if char not in target.get("kanji", ""):
                    errors.append(f"{where}: 锚点字 {char} 不在锚点词 {target.get('kanji')} 里")
            reading = anchor["reading"]
            if not KANA_PATTERN.match(reading):
                errors.append(f"{where}: 锚点字的读音只能是假名：{reading}")
            elif reading not in word.get("kana", ""):
                errors.append(f"{where}: 锚点字的读音 {reading} 不在这个词的读音 {word.get('kana')} 里")


def write_missing_list(missing):
    """把没有图片的词写进 missing_images.txt（不提交）；全部都有图片时删掉这个文件"""
    if not missing:
        MISSING_FILE.unlink(missing_ok=True)
        return
    rows = [("#", "日语", "英文", "文件名")]
    for number, word in enumerate(missing, start=1):
        japanese = word.get("kanji", "") + (" " + word["note"] if word.get("note") else "")
        if "anchors" in word and "tags" not in word:
            japanese += " [kanji mode]"              # 汉字模式的小词（kanji_words.json）
        rows.append((str(number), japanese, word.get("en", ""), f"{word.get('id')}.jpg"))

    # 每一列的宽度 = 这一列里最宽的内容；用空格补齐（不用 Tab，Tab 遇到汉字会对不齐）
    widths = [max(display_width(row[i]) for row in rows) for i in range(len(rows[0]))]
    def format_row(row):
        number, *rest = row
        cells = [number.rjust(widths[0])]                    # 序号靠右对齐
        cells += [pad(cell, width) for cell, width in zip(rest, widths[1:])]
        return "   ".join(cells).rstrip()

    lines = [
        f"还没有图片的词：{len(missing)} 个（按 words.json 里的顺序）",
        "找到后保存为 images/<文件名>，再运行 python tools/encrypt_images.py",
        "",
        format_row(rows[0]),
        "-" * display_width(format_row(rows[0])),
        *[format_row(row) for row in rows[1:]],
    ]
    MISSING_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def display_width(text):
    """在等宽字体里占几格：汉字、假名等全角字符算 2 格，其他算 1 格"""
    return sum(2 if unicodedata.east_asian_width(c) in "WF" else 1 for c in text)


def pad(text, width):
    """在右边补空格，让 text 占满 width 格"""
    return text + " " * (width - display_width(text))


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

    hidden_tags = load_hidden_tags()
    kanji_errors = []
    kanji_words = load_kanji_words(kanji_errors)
    errors, warnings, missing, hidden_missing = check(words, load_published(), hidden_tags, kanji_words)
    errors = kanji_errors + errors
    write_missing_list(missing)                    # 列表里只有朋友现在学得到的词
    for message in warnings:
        print("WARN ", message)
    for message in errors:
        print("ERROR", message)
    if missing:
        print(f"INFO  {len(missing)} 个词还没有图片，网页上暂时不会出现（图片加上、加密后自动出现），"
              f"列表见 {MISSING_FILE.name}")
    if hidden_missing:
        print(f"INFO  另有 {len(hidden_missing)} 个隐藏分类（{'、'.join(hidden_tags)}）里的词没有图片，"
              f"取消隐藏之前不用找")

    retired = sum(1 for w in words if isinstance(w, dict) and w.get("retired") is True)
    print(f"\n{len(words)} 个词（{len(words) - retired} 个在用，{retired} 个已退役）："
          f"{len(errors)} 个错误，{len(warnings)} 个警告")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
