"""
用 VOICEVOX 批量生成单词录音。先打开 VOICEVOX（它会在 localhost:50021 提供接口），再在项目根目录运行：

    python tools/make_audio.py                生成草稿：还没有录音的词，以及参数或校正改过的词 → audio_draft/
    python tools/make_audio.py --ids a b      只生成这几个词（例如刚改了 audio_fixes.json）
    python tools/make_audio.py --limit 5      只生成前 5 个（先试听效果）
    python tools/make_audio.py --approve      把检查通过的草稿转成 MP3 放进 audio/，并把这些词设成 "audio": true

流程：
  1. 生成草稿。用汉字生成（声调更自然），动词生成 “開ける、開けます”，和你在 VOICEVOX 里的做法一样
  2. 自动检查读音：VOICEVOX 会先告诉我们它打算怎么读，和 words.json 里的 kana 对比。
     读错的（例如 開く 读成 ヒラク）标成 MISMATCH，不能发布
  3. 打开 audio_draft/review.html 试听。声调只能靠耳朵判断
  4. 读音或声调不对：在 tools/audio_fixes.json 里写上正确的读法，再生成这个词，例如
         {"aku-to_open": "アク'、アキマ'ス"}
     写法是 VOICEVOX 的片假名记法：' 写在音高下降之前的那一拍后面（写在最后一拍后面 = 平板型），
     _ 表示清音化，、 表示停顿。review.html 里会显示 VOICEVOX 现在的读法，复制过来改就行
  5. --approve：把 OK / FIXED 的草稿转成 MP3，设成 "audio": true

需要：VOICEVOX 正在运行；python -m pip install lameenc（转 MP3 用）
参数在 tools/voice.json（从 VOICEVOX 界面抄过来）。改了参数，所有录音都会被重新生成。
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
VOICE_FILE = ROOT / "tools" / "voice.json"          # 角色和参数（提交）
FIXES_FILE = ROOT / "tools" / "audio_fixes.json"    # 人工校正的读法和声调（提交）
MANIFEST_FILE = ROOT / "tools" / "audio_manifest.json"  # 每个已发布的录音是用什么文字和参数生成的（提交）
AUDIO_DIR = ROOT / "audio"                          # 发布的录音（提交）
DRAFT_DIR = ROOT / "audio_draft"                    # 草稿和试听页面（不提交）
STATUS_FILE = DRAFT_DIR / "status.json"
ENGINE = "http://localhost:50021"
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


# ---------- 调用 VOICEVOX ----------
def engine(path, params, body=None):
    """向 VOICEVOX 发一个 POST 请求，返回原始的字节"""
    url = f"{ENGINE}{path}?{urllib.parse.urlencode(params)}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, method="POST",
                                     headers={"Content-Type": "application/json"} if data else {})
    with urllib.request.urlopen(request) as response:
        return response.read()


def make_query(word, fix, voice):
    """准备合成用的数据：用汉字得到读法和声调；有人工校正就换成校正的读法；再填上你的参数"""
    query = json.loads(engine("/audio_query", {"text": text_of(word), "speaker": voice["speaker"]}))
    if fix:
        query["accent_phrases"] = json.loads(
            engine("/accent_phrases", {"text": fix, "speaker": voice["speaker"], "is_kana": "true"}))
    for key, value in voice.items():
        if key in query:                                  # speedScale、pitchScale … 这些参数
            query[key] = value
    return query


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


def fingerprint(word, fix, voice):
    """录音是用什么文字、校正和参数生成的。任何一样变了，指纹就变，录音就需要重新生成"""
    source = json.dumps({"text": text_of(word), "fix": fix, "voice": voice}, ensure_ascii=False, sort_keys=True)
    return hashlib.sha256(source.encode("utf-8")).hexdigest()[:16]


# ---------- 生成草稿 ----------
def generate(ids, limit):
    voice, fixes = load_json(VOICE_FILE, None), load_json(FIXES_FILE, {})
    manifest, status = load_json(MANIFEST_FILE, {}), load_json(STATUS_FILE, {})
    words = [w for w in json.loads(WORDS_FILE.read_text(encoding="utf-8")) if not w["retired"]]

    def current(w):
        return fingerprint(w, fixes.get(w["id"]), voice)

    def published(w):   # 已经发布，而且是用现在的文字、校正和参数生成的
        return w.get("audio") and (AUDIO_DIR / f"{w['id']}.mp3").exists() and manifest.get(w["id"]) == current(w)

    def drafted(w):     # 已经有最新的草稿（例如上次运行到一半中断了），不用再生成
        s = status.get(w["id"])
        return s and s["fingerprint"] == current(w) and (DRAFT_DIR / f"{w['id']}.wav").exists()

    if ids:             # 指定了的词：一定重新生成
        todo = [w for w in words if w["id"] in ids]
    else:               # 还没有录音的词，以及文字、校正或参数改过的词
        todo = [w for w in words if not published(w) and not drafted(w)]
    if limit:
        todo = todo[:limit]

    DRAFT_DIR.mkdir(exist_ok=True)
    try:
        make_drafts(todo, fixes, voice, status)
    finally:                                              # 中途出错（例如 VOICEVOX 关了）也更新试听页面
        write_review_page(status)
    counts = {s: sum(1 for v in status.values() if v["status"] == s) for s in STATUS_ORDER}
    print(f"\n草稿共 {len(status)} 个：OK {counts['OK']}，FIXED {counts['FIXED']}，MISMATCH {counts['MISMATCH']}")
    print(f"请打开 {DRAFT_DIR / 'review.html'} 试听")


def make_drafts(todo, fixes, voice, status):
    for number, word in enumerate(todo, start=1):
        fix = fixes.get(word["id"])
        query = make_query(word, fix, voice)
        reading, expected = engine_reading(query), expected_reading(word)
        state = "MISMATCH" if reading != expected else ("FIXED" if fix else "OK")
        (DRAFT_DIR / f"{word['id']}.wav").write_bytes(engine("/synthesis", {"speaker": voice["speaker"]}, query))
        status[word["id"]] = {
            "text": text_of(word), "expected": expected, "reading": reading,
            "kana": fix or query["kana"],                 # VOICEVOX 记法，可以直接复制到 audio_fixes.json 修改
            "status": state, "fingerprint": fingerprint(word, fix, voice),
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
            f'<td><audio controls preload="none" src="{word_id}.wav"></audio></td></tr>')
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
<table><tr><th>状态</th><th>文字</th><th>words.json 读音</th><th>VOICEVOX 读音</th><th>VOICEVOX 记法</th><th>id</th><th>试听</th></tr>
{''.join(rows)}</table></html>
"""
    (DRAFT_DIR / "review.html").write_text(page, encoding="utf-8")


# ---------- 发布 ----------
def approve():
    import lameenc                                         # 只有发布时才需要
    voice, fixes = load_json(VOICE_FILE, None), load_json(FIXES_FILE, {})
    manifest, status = load_json(MANIFEST_FILE, {}), load_json(STATUS_FILE, {})
    words = json.loads(WORDS_FILE.read_text(encoding="utf-8"))
    by_id = {w["id"]: w for w in words}

    published, skipped = [], []
    for word_id, s in list(status.items()):
        word, draft = by_id.get(word_id), DRAFT_DIR / f"{word_id}.wav"
        if s["status"] == "MISMATCH" or not word or not draft.exists():
            skipped.append(f"{word_id}（{s['status']}）")
            continue
        current = fingerprint(word, fixes.get(word_id), voice)
        if current != s["fingerprint"]:                    # 生成草稿之后又改了文字、校正或参数
            skipped.append(f"{word_id}（草稿已过期，请重新生成）")
            continue
        (AUDIO_DIR / f"{word_id}.mp3").write_bytes(wav_to_mp3(draft, lameenc))
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


def wav_to_mp3(path, lameenc):
    with wave.open(str(path), "rb") as source:
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(48)                           # 人声 48kbps 足够清楚，一个词大约 10KB
        encoder.set_in_sample_rate(source.getframerate())
        encoder.set_channels(source.getnchannels())
        encoder.set_quality(2)                             # 2 = 高质量（数字越小越好、越慢）
        return encoder.encode(source.readframes(source.getnframes())) + encoder.flush()


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description="用 VOICEVOX 批量生成单词录音")
    parser.add_argument("--ids", nargs="+", help="只生成这几个词")
    parser.add_argument("--limit", type=int, help="最多生成几个")
    parser.add_argument("--approve", action="store_true", help="把检查通过的草稿发布到 audio/")
    args = parser.parse_args()
    try:
        approve() if args.approve else generate(args.ids, args.limit)
    except urllib.error.URLError:
        sys.exit("连不上 VOICEVOX。请先打开 VOICEVOX，再运行这个脚本")


if __name__ == "__main__":
    main()
