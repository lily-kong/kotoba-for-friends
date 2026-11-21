"""
批量生成单词录音。VOICEVOX 负责分析读音和声调（并自动检查），合成声音用 VOICEVOX 或 Azure（在 tools/voice.json 里选）。
先打开 VOICEVOX（它会在 localhost:50021 提供接口），再在项目根目录运行：

    python tools/make_audio.py                生成草稿：还没有录音的词，以及参数或校正改过的词 → audio_draft/
    python tools/make_audio.py --ids a b      只生成这几个词（例如刚改了 audio_fixes.json）
    python tools/make_audio.py --limit 5      只生成前 5 个（先试听效果）
    python tools/make_audio.py --approve      把检查通过的草稿发布成 audio/<id>.mp3，并把这些词设成 "audio": true

流程：
  1. VOICEVOX 用汉字分析读法和声调（动词是 “開ける、開けます”）
  2. 自动检查读音：VOICEVOX 的读法和 words.json 里的 kana 对比。
     读错的（例如 開く 读成 ヒラク）标成 MISMATCH，不能发布
  3. 合成草稿：
     - engine = "voicevox"：VOICEVOX 直接合成
     - engine = "azure"：把确认过的读法和声调（例如 アク'、アキマ'_ス）交给 Azure 的声音去读，
       Azure 不用自己猜读音，所以不会读错
  4. 打开 audio_draft/review.html 试听。声调只能靠耳朵判断
  5. 读音或声调不对：在 tools/audio_fixes.json 里写上正确的读法，再生成这个词，例如
         {"aku-to_open": "アク'、アキマ'_ス"}
     写法是 VOICEVOX 的片假名记法：' 写在音高下降之前的那一拍后面（写在最后一拍后面 = 平板型），
     _ 表示清音化，、 表示停顿。review.html 里会显示现在的读法，复制过来改就行。两种引擎都用这份校正
  6. --approve：把 OK / FIXED 的草稿发布到 audio/，设成 "audio": true

需要：VOICEVOX 正在运行；python -m pip install lameenc（VOICEVOX 的 WAV 转 MP3 用）；
用 Azure 时，密钥写在 .tts-keys.json：{"azure_key": "...", "azure_region": "japaneast"}
参数在 tools/voice.json。改了参数或换了引擎，所有录音都会被重新生成。
"""

import argparse
import hashlib
import html
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORDS_FILE = ROOT / "words.json"
VOICE_FILE = ROOT / "tools" / "voice.json"          # 用哪个引擎、角色和参数（提交）
FIXES_FILE = ROOT / "tools" / "audio_fixes.json"    # 人工校正的读法和声调（提交）
MANIFEST_FILE = ROOT / "tools" / "audio_manifest.json"  # 每个已发布的录音是用什么文字和参数生成的（提交）
KEYS_FILE = ROOT / ".tts-keys.json"                 # Azure 密钥（不提交）
AUDIO_DIR = ROOT / "audio"                          # 发布的录音（提交）
DRAFT_DIR = ROOT / "audio_draft"                    # 草稿和试听页面（不提交）
STATUS_FILE = DRAFT_DIR / "status.json"
VOICEVOX = "http://localhost:50021"
STATUS_ORDER = {"MISMATCH": 0, "FIXED": 1, "OK": 2}  # 试听页面里的排序：有问题的排最前


# ---------- 读写文件 ----------
def load_json(path, default):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else default


def save_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def save_words(words):
    """和 words.json 现在的格式一样：一个词一行"""
    lines = [json.dumps(w, ensure_ascii=False) for w in words]
    WORDS_FILE.write_text("[\n  " + ",\n  ".join(lines) + "\n]\n", encoding="utf-8", newline="\n")


# ---------- VOICEVOX：分析读法和声调，也可以直接合成 ----------
def voicevox(path, params, body=None):
    """向 VOICEVOX 发一个 POST 请求，返回原始的字节"""
    url = f"{VOICEVOX}{path}?{urllib.parse.urlencode(params)}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method="POST",
                                     headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request) as response:
        return response.read()


def make_query(word, fix, settings):
    """用汉字得到读法和声调；有人工校正就换成校正的读法；再填上 VOICEVOX 的参数"""
    query = json.loads(voicevox("/audio_query", {"text": text_of(word), "speaker": settings["speaker"]}))
    if fix:
        query["accent_phrases"] = json.loads(
            voicevox("/accent_phrases", {"text": fix, "speaker": settings["speaker"], "is_kana": "true"}))
    for key, value in settings.items():
        if key in query:                                  # speedScale、pitchScale … 这些参数
            query[key] = value
    return query


# ---------- Azure：按我们给的读法和声调合成 ----------
def azure_ssml(text, notation, settings):
    """把 “開く、開きます” 和 “アク'、アキマ'_ス” 按顿号对齐，每一段用 <phoneme> 指定读法和声调"""
    texts, readings = text.split("、"), notation.split("、")
    if len(texts) != len(readings):
        raise ValueError(f"文字和读法的段数对不上：{text} / {notation}")
    pieces = []
    for piece, reading in zip(texts, readings):
        if "/" in reading:   # 一段里有好几个声调单位：Azure 的写法不一样，还没支持
            raise ValueError(f"{reading} 里有多个声调单位（/），请在 audio_fixes.json 里写成一个")
        reading = reading.replace("_", "")                # Azure 的记法里没有清音化标记
        pieces.append(f"<phoneme alphabet='sapi' ph=\"{reading}\">{html.escape(piece)}</phoneme>")
    return (f"<speak version='1.0' xml:lang='ja-JP'><voice name='{settings['voice']}'>"
            f"<prosody rate='{settings['rate']}'>{'、'.join(pieces)}</prosody></voice></speak>")


def azure(text, notation, settings, keys):
    request = urllib.request.Request(
        f"https://{keys['azure_region']}.tts.speech.microsoft.com/cognitiveservices/v1",
        data=azure_ssml(text, notation, settings).encode("utf-8"), method="POST",
        headers={"Ocp-Apim-Subscription-Key": keys["azure_key"], "Content-Type": "application/ssml+xml",
                 "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "kotoba"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()                            # 已经是 MP3


# ---------- 单词 ----------
def text_of(word):
    """要读的文字：动词是 “開ける、開けます”，其他词只读汉字"""
    return word["kanji"] + ("、" + word["polite"] if word.get("verb") else "")


def katakana(text):
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in text)


def same_sound(text):
    """发音相同的假名统一写法再比较：づ/ず、ぢ/じ 读音一样（VOICEVOX 写成 ズ、ジ）"""
    return text.replace("ヅ", "ズ").replace("ヂ", "ジ")


def expected_reading(word):
    """words.json 里的读音（片假名，不含停顿），用来和 VOICEVOX 的读法对比"""
    return same_sound(katakana(word["kana"] + (word["polite_kana"] if word.get("verb") else "")))


def engine_reading(query):
    """VOICEVOX 打算怎么读（片假名，不含停顿）"""
    return same_sound("".join(m["text"] for phrase in query["accent_phrases"] for m in phrase["moras"]))


def fingerprint(word, fix, config):
    """录音是用什么文字、校正、引擎和参数生成的。任何一样变了，指纹就变，录音就需要重新生成"""
    name = config["engine"]
    # VOICEVOX 的写法和以前一样（只有参数），这样以前用 VOICEVOX 发布的录音仍然能被认出来
    voice = config[name] if name == "voicevox" else {"engine": name, **config[name]}
    source = json.dumps({"text": text_of(word), "fix": fix, "voice": voice}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]


# ---------- 生成草稿 ----------
def generate(ids, limit):
    config, fixes = load_json(VOICE_FILE, None), load_json(FIXES_FILE, {})
    manifest, status = load_json(MANIFEST_FILE, {}), load_json(STATUS_FILE, {})
    words = [w for w in json.loads(WORDS_FILE.read_text(encoding="utf-8")) if not w["retired"]]
    keys = load_json(KEYS_FILE, {}) if config["engine"] == "azure" else {}
    if config["engine"] == "azure" and not (keys.get("azure_key") and keys.get("azure_region")):
        sys.exit(f"用 Azure 需要在 {KEYS_FILE.name} 里写上 azure_key 和 azure_region")

    def current(w):
        return fingerprint(w, fixes.get(w["id"]), config)

    def published(w):   # 已经发布，而且是用现在的文字、校正、引擎和参数生成的
        return w.get("audio") and (AUDIO_DIR / f"{w['id']}.mp3").exists() and manifest.get(w["id"]) == current(w)

    def drafted(w):     # 已经有最新的草稿（例如上次运行到一半中断了），不用再生成
        s = status.get(w["id"])
        return s and s["fingerprint"] == current(w) and (DRAFT_DIR / s["file"]).exists()

    if ids:             # 指定了的词：一定重新生成
        todo = [w for w in words if w["id"] in ids]
    else:               # 还没有录音的词，以及文字、校正、引擎或参数改过的词
        todo = [w for w in words if not published(w) and not drafted(w)]
    if limit:
        todo = todo[:limit]

    DRAFT_DIR.mkdir(exist_ok=True)
    try:
        make_drafts(todo, fixes, config, keys, status)
    finally:                                              # 中途出错（例如 VOICEVOX 关了）也更新试听页面
        write_review_page(status)
    counts = {s: sum(1 for v in status.values() if v["status"] == s) for s in STATUS_ORDER}
    print(f"\n草稿共 {len(status)} 个：OK {counts['OK']}，FIXED {counts['FIXED']}，MISMATCH {counts['MISMATCH']}")
    print(f"请打开 {DRAFT_DIR / 'review.html'} 试听")


def make_drafts(todo, fixes, config, keys, status):
    name, vv = config["engine"], config["voicevox"]
    for number, word in enumerate(todo, start=1):
        fix = fixes.get(word["id"])
        query = make_query(word, fix, vv)                 # 读法和声调总是由 VOICEVOX 分析
        notation = fix or query["kana"]                   # 确认用的读法，例如 アク'、アキマ'_ス
        reading, expected = engine_reading(query), expected_reading(word)
        state = "MISMATCH" if reading != expected else ("FIXED" if fix else "OK")
        if name == "azure":
            file, audio = f"{word['id']}.mp3", azure(text_of(word), notation, config["azure"], keys)
        else:
            file, audio = f"{word['id']}.wav", voicevox("/synthesis", {"speaker": vv["speaker"]}, query)
        (DRAFT_DIR / file).write_bytes(audio)
        status[word["id"]] = {
            "text": text_of(word), "expected": expected, "reading": reading,
            "kana": notation,                             # 可以直接复制到 audio_fixes.json 修改
            "status": state, "fingerprint": fingerprint(word, fix, config), "file": file,
        }
        save_json(STATUS_FILE, status)                    # 每个词都马上保存：中途断了，下次接着做
        print(f"[{number}/{len(todo)}] {state:8} {text_of(word)}" + (f"  （读成了 {reading}）" if state == "MISMATCH" else ""))


def write_review_page(status):
    """试听页面：有问题的排最前，每个词一行，可以直接播放"""
    rows = []
    for word_id, s in sorted(status.items(), key=lambda item: (STATUS_ORDER[item[1]["status"]], item[0])):
        rows.append(
            f'<tr class="{s["status"]}"><td>{s["status"]}</td><td>{html.escape(s["text"])}</td>'
            f'<td>{html.escape(s["expected"])}</td><td>{html.escape(s["reading"])}</td>'
            f'<td><code>{html.escape(s["kana"])}</code></td><td>{word_id}</td>'
            f'<td><audio controls preload="none" src="{s.get("file", word_id + ".wav")}"></audio></td></tr>')
    page = f"""<!DOCTYPE html><html lang="ja"><meta charset="utf-8"><title>録音チェック</title>
<style>
body {{ font-family: sans-serif; margin: 16px; }}
table {{ border-collapse: collapse; }}
td, th {{ border: 1px solid #ddd; padding: 4px 8px; }}
tr.MISMATCH {{ background: #fde2e2; }} tr.FIXED {{ background: #fff6d6; }}
code {{ font-size: 14px; }}
</style>
<p>MISMATCH = VOICEVOX 的读音和 words.json 不一样（不能发布，请在 tools/audio_fixes.json 里校正）。
FIXED = 用了人工校正。OK = 读音一致，请听一下声调。</p>
<table><tr><th>状态</th><th>文字</th><th>words.json 读音</th><th>VOICEVOX 读音</th><th>读法和声调</th><th>id</th><th>试听</th></tr>
{''.join(rows)}</table></html>
"""
    (DRAFT_DIR / "review.html").write_text(page, encoding="utf-8")


# ---------- 发布 ----------
def approve():
    config, fixes = load_json(VOICE_FILE, None), load_json(FIXES_FILE, {})
    manifest, status = load_json(MANIFEST_FILE, {}), load_json(STATUS_FILE, {})
    words = json.loads(WORDS_FILE.read_text(encoding="utf-8"))
    by_id = {w["id"]: w for w in words}

    published, skipped = [], []
    for word_id, s in list(status.items()):
        word, draft = by_id.get(word_id), DRAFT_DIR / s.get("file", f"{word_id}.wav")
        if s["status"] == "MISMATCH" or not word or not draft.exists():
            skipped.append(f"{word_id}（{s['status']}）")
            continue
        current = fingerprint(word, fixes.get(word_id), config)
        if current != s["fingerprint"]:                    # 生成草稿之后又改了文字、校正、引擎或参数
            skipped.append(f"{word_id}（草稿已过期，请重新生成）")
            continue
        mp3 = wav_to_mp3(draft) if draft.suffix == ".wav" else draft.read_bytes()
        (AUDIO_DIR / f"{word_id}.mp3").write_bytes(mp3)
        word["audio"] = True
        manifest[word_id] = current
        draft.unlink()
        del status[word_id]
        published.append(word_id)

    save_words(words)
    save_json(MANIFEST_FILE, dict(sorted(manifest.items())))
    save_json(STATUS_FILE, status)
    write_review_page(status)
    print(f"发布了 {len(published)} 个录音")
    if skipped:
        print(f"没有发布 {len(skipped)} 个：" + "、".join(skipped))


def wav_to_mp3(path):
    import lameenc                                         # 只有 VOICEVOX 的 WAV 需要转换
    with wave.open(str(path), "rb") as source:
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(48)                           # 人声 48kbps 足够清楚，一个词大约 10KB
        encoder.set_in_sample_rate(source.getframerate())
        encoder.set_channels(source.getnchannels())
        encoder.set_quality(2)                             # 2 = 高质量（数字越小越好、越慢）
        return encoder.encode(source.readframes(source.getnframes())) + encoder.flush()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="批量生成单词录音")
    parser.add_argument("--ids", nargs="+", help="只生成这几个词")
    parser.add_argument("--limit", type=int, help="最多生成几个")
    parser.add_argument("--approve", action="store_true", help="把检查通过的草稿发布到 audio/")
    args = parser.parse_args()
    try:
        approve() if args.approve else generate(args.ids, args.limit)
    except urllib.error.HTTPError as error:               # 先判断：HTTPError 也属于 URLError
        sys.exit(f"请求出错（HTTP {error.code}）：{error.read().decode('utf-8', 'replace')[:300]}")
    except urllib.error.URLError:
        sys.exit("连不上 VOICEVOX。请先打开 VOICEVOX，再运行这个脚本")


if __name__ == "__main__":
    main()
