# Recordings

One recording per word: `audio/<id>.mp3`, generated with [VOICEVOX](https://voicevox.hiroshiba.jp/) (voice: VOICEVOX:四国めたん). A word plays its recording when it has `"audio": true` in `words.json`; the others use the browser's Japanese voice.

## Making recordings

Open VOICEVOX, then from the project root:

1. `python tools/make_audio.py` — makes drafts in `audio_draft/` (not committed) for words without a recording, and for words whose text, fix or voice settings changed. It reads the kanji (better pitch accent than kana); verbs are read as 開ける、開けます.
2. It compares VOICEVOX's reading with `kana` in `words.json`. A wrong reading (開く read as ヒラク) is marked **MISMATCH** and can't be published.
3. Open `audio_draft/review.html` and listen. Problems are listed first. Pitch accent can only be checked by ear.
4. Wrong reading or pitch: add the correct reading to `tools/audio_fixes.json`, then run `python tools/make_audio.py --ids <id>`:

   ```json
   {"aku-to_open": "アク'、アキマ'ス"}
   ```

   This is VOICEVOX's kana notation: `'` after the mora where the pitch falls (after the last mora = flat), `_` = devoiced, `、` = pause. The review page shows VOICEVOX's current notation for every word, so copy it and change what's wrong.
5. `python tools/make_audio.py --approve` — turns the OK and FIXED drafts into MP3 files here, sets `"audio": true`, and records in `tools/audio_manifest.json` which text, fix and settings made each file.

Voice settings are in `tools/voice.json` (copied from the VOICEVOX window). Change them and every recording is made again. Needs `python -m pip install lameenc`.
