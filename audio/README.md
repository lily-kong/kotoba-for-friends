# Recordings

One recording per word, named after its `id`: `audio/<id>.mp3` (for example `audio/akeru-to_open.mp3`).

- For verbs, record both forms in one file: the plain form, then the ます form (開ける … 開けます).
- Then set `"audio": true` for that word in `words.json`. Words with `"audio": false` use the browser's Japanese voice.
- `python tools/check_words.py` reports a word marked `true` without a file, and a file whose word is still `false`.
