"""
生成答对音效 sounds/correct.mp3：两个上行的音（C6 → E6），总长不到 0.3 秒。
录音开头留了 0.3 秒静音（tools/voice.json 里的 leading_silence_ms），音效正好在这段静音里播放，不和读音重叠。

    python tools/make_chime.py

需要：python -m pip install lameenc
"""

import math
from pathlib import Path

import lameenc

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "sounds" / "correct.mp3"
RATE = 24000                       # 采样率，和录音一样
NOTES = [                          # (开始时间 秒, 频率 Hz, 长度 秒)
    (0.00, 1046.5, 0.16),          # C6
    (0.08, 1318.5, 0.20),          # E6
]
VOLUME = 0.3                       # 最大音量（0～1），比读音轻一点


def tone(t, freq, length):
    """一个音：很快响起，然后自然减弱。加一点二倍频，听起来更像铃声"""
    if not 0 <= t < length:
        return 0.0
    envelope = min(t / 0.005, 1.0) * math.exp(-t * 18)
    return envelope * (math.sin(2 * math.pi * freq * t) + 0.3 * math.sin(4 * math.pi * freq * t)) / 1.3


def main():
    total = max(start + length for start, _, length in NOTES)
    samples = []
    for i in range(int(total * RATE)):
        t = i / RATE
        value = sum(tone(t - start, freq, length) for start, freq, length in NOTES) * VOLUME
        samples.append(int(max(-1.0, min(1.0, value)) * 32767))
    pcm = b"".join(s.to_bytes(2, "little", signed=True) for s in samples)

    encoder = lameenc.Encoder()
    encoder.set_bit_rate(64)
    encoder.set_in_sample_rate(RATE)
    encoder.set_channels(1)
    encoder.set_quality(2)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_bytes(encoder.encode(pcm) + encoder.flush())
    print(f"生成了 {OUT.relative_to(ROOT)}（{total:.2f} 秒）")


if __name__ == "__main__":
    main()
