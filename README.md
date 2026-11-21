# Kotoba for friends

A small web app for memorizing Japanese vocabulary on your phone.
You see a picture and an English meaning, and you type the Japanese word.

Start with [FRIENDS.md](FRIENDS.md). It is also inside the app: tap **Guide & letters** on the home page.

## Why this project has a guide for friends

This app is built for a handful of friends, not for users in general, and that changes what "working well" means.

The study log records *what* happened: which word, what was typed, whether a hint was used. It cannot record *how it felt*: an answer marked wrong that felt right, a picture that pointed to the wrong meaning, a group that was discouraging. Those are often the real reasons someone stops learning, and only the learner can report them.

The app shows the same file on its Guide page (`js/guide.js` renders it with [marked](https://github.com/markedjs/marked)), and marks the button **new** until the latest letter has been read. The numbers from the logs and the feelings from the letters come back together, and the next version is built from both.

### Writing a new letter

In `FRIENDS.md`, move the current letter down to **Earlier letters** (newest first), and write the new one in its place at the top as `## Letter — YYYY-MM-DD`. The app treats the first heading starting with `## Letter` as the latest letter. Never write anything personal about a friend, and never the picture password or a hint to it: the repository and the site are public.

## How the design evolved

The code is small; the interesting part is the decisions behind it. Each one came from a concrete problem met while building and using the app.

**Own keyboard, no input field.** On phones the system keyboard covered half the screen, and the input method converted romaji in its own way. The app has no text field at all: an on-screen keyboard and the computer's keys (read by physical position, `event.code`) feed one function, and WanaKana turns romaji into kana. The phone keyboard and the input method never appear, so the layout stays under control.

**Friends' data comes first.** Progress lives only on friends' phones, so every update must keep it readable:

- a word's `id` never changes, and a word is never deleted, only `retired`; a big change means retiring the old word and adding a new `id`;
- storage keys never change, and formats only grow: old fields are converted when read, never dropped;
- importing a backup merges (the newest record wins) instead of replacing;
- the checker compares with the last commit and refuses a word list where a published `id` has disappeared.

**Keep raw events, derive the rest.** The progress record (level, next review) is the output of one particular algorithm. The study log is append-only and keeps every answer as it happened, including what was typed. A future algorithm, or an analysis of a friend's weak words, can be recomputed from the log; the reverse is impossible.

**The data describes itself, so the app never guesses.** The verb class (`godan` / `ichidan` / `irregular`) is stored instead of a `true` flag, because conjugation depends on it. Whether a recording exists is stored as `"audio": true`, instead of asking the server about every word on every start (that was about 200 requests). Picture and recording paths come from the `id`, so they can't drift apart.

**A checker as the gatekeeper.** The word list is edited by hand, hundreds of lines at a time. `tools/check_words.py` runs before every commit: required fields, kana only, the ます form worked out from the verb class, same-English words that can't be told apart, missing or orphaned pictures and recordings, and pictures replaced after encryption (compared by content, because copying a file on Windows keeps its old date). Words still missing a picture go to `missing_images.txt`, ready for searching. The browser keeps only a minimal check: enough to refuse a broken list before it touches anyone's data.

**Copyright: encrypt, don't hide.** The pictures can't be public, but GitHub Pages is. The originals stay on one PC, the repository holds AES-GCM encrypted copies, and friends enter a password once. The history was rewritten so that earlier commits don't contain the originals either.

**One source for words to friends.** `FRIENDS.md` is both a repository document and the in-app guide, so the two can never disagree.

**Small modules, wired in one place.** Each file has one job (`schedule.js` is the review algorithm, `storage.js` the data on the phone, ...), and only `main.js` connects them. Modules don't import each other in circles, and the review algorithm can be replaced by editing one file.

### Known limits and next ideas

- Right after a deploy, a phone can mix cached old and new JS files for a few minutes and show a blank page; reloading fixes it. A small service worker would remove the problem.
- Logs reach me only when a friend exports them. Cloud sync would close the loop, and append-only logs make merging easy.
- A "this word confuses me" button in the quiz, written to the log, would tie feelings to specific words.
- Conjugation practice, built on the stored verb class.
- A Python script that reads exported logs and lists each friend's hardest words and typical mistakes.

## For developers

```
index.html           page structure
style.css            look
js/main.js           entry point: loads the word list, connects the pages
js/config.js         settings (group size, review intervals, ...)
js/ui.js             shared page helpers
js/words.js          loads words.json (skips retired words)
js/schedule.js       review algorithm: which words to study, when to review next
js/storage.js        data on the phone: progress, study log, user id, export/import
js/quiz.js           the study flow
js/keyboard.js       on-screen keyboard and computer keyboard
js/sound.js          pronunciation
js/home.js           home page and category pages
js/images.js         unlocks and decrypts the pictures
js/guide.js          shows FRIENDS.md inside the app
tools/check_words.py    checks words.json before you commit
tools/encrypt_images.py encrypts images/ into images-enc/
tools/make_audio.py     makes recordings with VOICEVOX (see audio/README.md)
tools/voice.json        VOICEVOX voice and settings
tools/audio_fixes.json  hand-corrected readings and pitch accents for recordings
tools/audio_manifest.json  which text, fix and settings made each recording
words.json           the word list
FRIENDS.md           the guide and letters for friends (also shown in the app)
images/              one picture per word (originals, NOT committed)
images-enc/          encrypted pictures (committed)
audio/               recordings, audio/<id>.mp3, made with VOICEVOX (see audio/README.md)
```

Run it locally:

```
python -m http.server
```

Then open `http://localhost:8000`. Opening `index.html` directly does not work, because the browser blocks loading `words.json` and the JS modules. Picture decryption only works on `https://` or `localhost`, so testing from a phone via your PC's IP address (`http://192.168...`) will not show pictures.

### Pictures are encrypted

The pictures have copyright restrictions, so the originals in `images/` stay on your PC only (`.gitignore`). GitHub and the site only have `images-enc/`: each picture encrypted with AES-256-GCM, using a key derived from a password (PBKDF2). Friends enter the password once; the browser remembers it and decrypts the pictures. Anyone without the password sees only random bytes. (Friends can of course still screenshot what they see.)

- The password is in `.image-password` (not committed). Share it with friends privately.
- To change it: edit `.image-password`, run `python tools/encrypt_images.py --all`, and give friends the new one.
- New PC: clone the repo, create `.image-password`, run `python tools/encrypt_images.py --restore` to get the originals back. Without the password the pictures cannot be recovered, so keep it safe.
- Needs `python -m pip install cryptography`.

### Adding or changing words

1. Put the picture in `images/<id>.jpg` and edit `words.json`.
2. `python tools/encrypt_images.py` (encrypts only new or changed pictures)
3. `python tools/check_words.py`, and fix every ERROR.
   Words that still have no picture are listed in `missing_images.txt` (Japanese, English, file name; in list order, not committed).
4. Commit `words.json` and `images-enc/`.

The checker checks every field, finds duplicate ids, non-kana characters, missing, orphaned or not-yet-encrypted pictures, and words with the same English. It also compares with the last commit and refuses a word list where a committed `id` has disappeared.

### words.json

One word per line:

```json
{"id": "akeru-to_open", "kana": "あける", "kanji": "開ける", "en": "to open", "note": "(transitive)", "tags": ["Doshi_N5"], "verb": "ichidan", "polite": "開けます", "polite_kana": "あけます", "audio": false, "retired": false}
```

- One entry is one meaning of one word. Every field is required.
- `id`: lowercase letters, digits, `_` and `-`. It is also the picture's file name. **Never change it once published.**
- `note`: shown in small text under the picture, above the English. Use it for part of speech, 自動詞/他動詞, or nuances English can't express. `""` for none.
- `tags`: a list of categories. The home page lists every tag, in the order it first appears in the file. Verbs are in `Doshi_N5` (common JLPT N5 verbs) or `Doshi_hoka` (all others).
- Spelling follows common JLPT word lists (e.g. なる, できる, 出かける in kana where JLPT lists use kana).
- Words with the same `en` must each have a different `note` (e.g. `(transitive)` / `(intransitive)`, `(shirt, coat)` / `(shoes, trousers)`), otherwise friends can't tell which one to type.
- `verb`: the verb class, `"godan"` (五段), `"ichidan"` (一段) or `"irregular"` (する, 来る); `false` for words that are not verbs. Conjugation rules depend on the class, so it is needed for future conjugation practice. Verbs also need `polite` and `polite_kana`, the ます form. The answer is shown as 開ける／開けます and both forms are read aloud, but only the plain form counts as a correct answer. The checker works out the ます form from the class and warns when it differs, which catches a wrong class or a typo.
- `retired`: `true` hides the word everywhere. Use it instead of deleting. If a word needs a big change (a different reading or meaning), retire it and add the new version under a new `id`, so it is studied as a new word.
- `audio`: `true` when `audio/<id>.mp3` exists (made by `tools/make_audio.py`; verbs contain the plain form, then the ます form). The app plays the recording for these words and uses the browser's Japanese voice for the rest. Because this is written in `words.json`, the app never has to ask the server whether a recording exists.
- The picture must be `images/<id>.jpg` (encrypted to `images-enc/<id>.bin`).
- **Study all words** picks new words at random; a category's own **Study** button takes them in the order they appear in the file, so keep pairs (開く／開ける) next to each other.

### Data on each phone

Each friend's data lives in their browser's `localStorage` (see `js/storage.js`). Deploying a new version replaces only the files on the server, never this data.

| Key | What | Changes |
|---|---|---|
| `jpwords-progress-v2` | progress: each word's review state | rewritten by the review algorithm |
| `kotoba-log-v1` | study log: every answer | **append-only**, never edited or deleted |
| `kotoba-user` | random user id, e.g. `u_8f3a2k1x` | created once |
| `kotoba-image-password` | the picture password | saved when entered |
| `kotoba-letter-read` | title of the latest letter this phone has read | when the guide is opened |

A study log entry (practice typing after the answer is shown is not logged):

```json
{"user": "u_8f3a2k1x", "word": "iku-to_go", "correct": false, "answer": "いの", "hint": false, "time": "2026-11-18T13:05:00+09:00"}
```

`hint: true` means the answer was given after the hint (number of kana and the first kana) was shown. The log is the raw record: a future review algorithm can be computed from it, and it shows each friend's weak words.

Rules that keep the data usable:

1. Never change the keys above.
2. Never change a published word's `id`, and never delete a word: retire it.
3. If a data format ever needs to change, convert the old format when reading it; don't drop old fields.
4. If `words.json` is broken (duplicate or missing `id`, `tags` not a list), the app shows the error and does not start a group, so a broken word list can't write bad data.

After a deploy, a phone may keep using cached copies of `index.html`, `style.css` and `js/` for up to 10 minutes. If something looks broken right after a deploy, reload the page.

Romaji input uses [WanaKana](https://github.com/WaniKani/WanaKana) and the guide uses [marked](https://github.com/markedjs/marked) (both MIT license). Recordings: VOICEVOX:四国めたん.
