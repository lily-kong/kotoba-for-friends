# Kotoba for friends

A small web app for memorizing Japanese vocabulary on your phone.
You see a picture and an English meaning, and you type the Japanese word.

Start with [FRIENDS.md](FRIENDS.md). It is also inside the app: tap **Guide & letters** on the home page.

## Why this project has a guide for friends

This app is built for a handful of friends, not for users in general, and that changes what "working well" means.

The study log records *what* happened: which word, what was typed, whether a hint was used. It cannot record *how it felt*: an answer marked wrong that felt right, a picture that pointed to the wrong meaning, a group that was discouraging. Those are often the real reasons someone stops learning, and only the learner can report them.

The app shows the same file on its Guide page (`js/guide.js` renders it with [marked](https://github.com/markedjs/marked)), and marks the button **new** until the latest letter has been read. The numbers from the logs and the feelings from the letters come back together, and the next version is built from both. What friends report is kept, as it arrived, in [FEEDBACK.md](FEEDBACK.md).

### Writing a new letter

In `FRIENDS.md`, move the current letter down to **Earlier letters** (newest first), and write the new one in its place at the top as `## Letter — YYYY-MM-DD`. The app treats the first heading starting with `## Letter` as the latest letter. Never write anything personal about a friend, and never the picture password or a hint to it: the repository and the site are public.

## Development log

Most of the code was written with an AI coding assistant; the decisions, the design and the feedback behind it are recorded in [DEVLOG.md](DEVLOG.md), from the MVP to now, together with open questions and next ideas.

## For developers

```
index.html           page structure
style.css            look
js/main.js           entry point: loads the word list, connects the pages
js/config.js         settings (group size, target retention, ...)
js/ui.js             shared page helpers
js/words.js          loads words.json (skips retired words)
js/schedule.js       review algorithm: which words to study, when to review next
js/fsrs.js           the FSRS-5 memory model behind it (pure math)
js/storage.js        data on the phone: progress, study log, user id, export/import
js/quiz.js           the study flow
js/session.js        the order of words inside a group (see DEVLOG.md)
js/kana.js           spots answers wrong only in long vowels, voicing or a double consonant, and which characters differ
js/keyboard.js       on-screen keyboard and computer keyboard
js/sound.js          pronunciation
js/home.js           home page and category pages
js/images.js         unlocks and decrypts the pictures
js/guide.js          shows FRIENDS.md inside the app
js/kanjimode.js      Kanji mode page: units, their status, the Study kanji button
js/kanjischedule.js  Kanji mode rules: units (kanji + anchor + small words), which units go into a group
tools/check_words.py    checks words.json before you commit
tools/encrypt_images.py encrypts images/ into images-enc/
tools/make_chime.py     makes the correct-answer sound sounds/correct.mp3
tools/simulate.html     after changing the review rules: checks old progress still works, and stress-tests the rules
                        with simulated learners (python -m http.server, then open localhost:8000/tools/simulate.html)
tools/make_audio.py     makes recordings: VOICEVOX checks the reading and pitch, Azure speaks (see audio/README.md)
tools/voice.json        which engine (Azure or VOICEVOX), voice and settings
tools/audio_fixes.json  hand-corrected readings and pitch accents for recordings
tools/audio_manifest.json  which text, fix and settings made each recording
words.json           the word list
kanji.json           the JLPT N5 and N4 kanji used by Kanji mode
kanji_words.json     Kanji mode's small words, each linked to an anchor word
DEVLOG.md            why the project is built this way, version by version
FEEDBACK.md          real feedback from friends, as it arrived
FRIENDS.md           the guide and letters for friends (also shown in the app)
images/              one picture per word (originals, NOT committed)
images-enc/          encrypted pictures and index.json, the list of words that have one (committed)
audio/               recordings, audio/<id>.mp3 (see audio/README.md)
sounds/correct.mp3   the sound played when a word is learned
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
   Words that still have no picture are listed in `missing_images.txt` (Japanese, English, file name; in list order, not committed). They are not an error: the app hides them for now and shows them as soon as their picture is encrypted. This is automatic, unlike `HIDDEN_TAGS`. `tools/encrypt_images.py` writes `images-enc/index.json`, the list of ids that have a picture, and the app reads it; the checker makes sure the list is up to date.
4. Commit `words.json` and `images-enc/`.

The checker checks every field, finds duplicate ids, non-kana characters, missing, orphaned or not-yet-encrypted pictures, and words with the same English. It also compares with the last commit and refuses a word list where a committed `id` has disappeared.

### words.json

One word per line:

```json
{"id": "akeru-to_open", "kana": "あける", "kanji": "開ける", "en": "to open", "note": "(transitive)", "tags": ["Doshi_N5"], "verb": "ichidan", "polite": "開けます", "polite_kana": "あけます", "audio": false, "retired": false}
```

- One entry is one meaning of one word. Every field is required, except `anchors`.
- `id`: lowercase letters, digits, `_` and `-`. It is also the picture's file name. **Never change it once published.**
- `note`: shown in small text under the picture, above the English. Use it for part of speech, 自動詞/他動詞, or nuances English can't express. `""` for none.
- `tags`: a list of categories. The home page lists every tag, in the order it first appears in the file. Verbs are in `Doshi_N5` (common JLPT N5 verbs) or `Doshi_hoka` (all others). A tag listed in `HIDDEN_TAGS` (`js/config.js`) is hidden: its words aren't shown or studied, but progress on them stays on the phone, and removing the tag from the list brings them back. `Doshi_hoka` is hidden for now, to focus on N5.
- Spelling follows common JLPT word lists (e.g. なる, できる, 出かける in kana where JLPT lists use kana).
- Words with the same `en` must each have a different `note` (e.g. `(transitive)` / `(intransitive)`, `(shirt, coat)` / `(shoes, trousers)`), otherwise friends can't tell which one to type.
- `verb`: the verb class, `"godan"` (五段), `"ichidan"` (一段) or `"irregular"` (する, 来る); `false` for words that are not verbs. Conjugation rules depend on the class, so it is needed for future conjugation practice. Verbs also need `polite` and `polite_kana`, the ます form. The answer is shown as 開ける／開けます and both forms are read aloud, but only the plain form counts as a correct answer. The checker works out the ます form from the class and warns when it differs, which catches a wrong class or a typo.
- `retired`: `true` hides the word everywhere. Use it instead of deleting. If a word needs a big change (a different reading or meaning), retire it and add the new version under a new `id`, so it is studied as a new word.
- `audio`: `true` when `audio/<id>.mp3` exists (made by `tools/make_audio.py`; verbs contain the plain form, then the ます form). The app plays the recording for these words and uses the browser's Japanese voice for the rest. Because this is written in `words.json`, the app never has to ask the server whether a recording exists.
- `anchors` (optional, for the planned anchor practice): which kanji in this word hang on a word already learned, e.g. for 意見: `"anchors": [{"char": "見", "word": "miru-to_see", "reading": "けん", "meaning": "view"}]`. `reading` is how the character is read *in this word* (けん in 意見, み in 花見), `meaning` what it means here. A list, because a word can have two anchors (見学). The app doesn't use it yet; the checker already verifies it (the anchor word exists and is in use, the character is in both words, the reading is part of this word's kana).
- The picture must be `images/<id>.jpg` (encrypted to `images-enc/<id>.bin`).
- **Study all words** picks new words at random; a category's own **Study** button takes them in the order they appear in the file, so keep pairs (開く／開ける) next to each other.

### Kanji mode

The bar at the bottom of the home page switches between **Words** (the normal word study, the default) and **Kanji**.

**The idea.** A kanji is learned from a word the learner already knows, its *anchor* (見る), together with 1–3 *small words* that use the same kanji with another reading (意見, 花見). A unit is one kanji + one anchor word + its small words. Kanji without small words are not in Kanji mode.

**One unit in a group** (`js/kanjischedule.js`, using the prerequisite rule in `js/session.js`):

1. Reading question: only the anchor in kanji (見る), no picture of its own, no English, no note. Type the kana. Above it, the pictures of all the kanji's small words are shown, all the same size whether there is one or three: a hint, and a preview of what comes next.
2. Right on the first try → its small words come next, asked like ordinary words (picture and English → kana).
3. Not right → only the reading question is repeated inside the group; the small words of this kanji are skipped this time, and the group moves on to the next kanji.

A group has at most `MAX_KANJI_PER_GROUP` (4) kanji and `GROUP_SIZE` (12) cards. Units with something due come first (most overdue first), then new units in the order of `kanji.json` (N5, then N4).

**Anchors and generations.** A unit can be studied only when its anchor word has been learned somewhere (it has a progress record):

- first round: the anchor is a word from Words mode (`words.json`), e.g. 見る;
- second round: the anchor is a small word already learned in Kanji mode, e.g. 電車 hanging on 電話. A learned small word becomes a possible anchor automatically;
- words that can't hang on any anchor go into `words.json` and are learned in Words mode first; once learned, they can anchor kanji too.

The checker makes sure every anchor chain ends in a word of `words.json` (no small words anchoring each other in a circle), and warns when a unit has more than 3 small words.

**Data.** `kanji.json` lists the JLPT kanji (`"N5"` and `"N4"`, one string each; used for ordering and the level label). `kanji_words.json` holds the small words: `id`, `kana`, `kanji`, `en`, `note`, `audio` and `anchors` (same format as above; the anchor word is in `words.json` or is another small word). As in `words.json`, `en` is one English meaning; anything extra goes in `note` (`""` for none). Each anchor carries at most 3 small words: common exam words of N4–N5, preferably nouns, together covering the kanji's readings at that level. The anchor verb doesn't count as covering its own reading: a word with the same reading reinforces it (見る → 花見, 食べる → 食べ物), and two words with the same reading are fine when both are common (意見, 見学). Where possible a small word brings in a kanji the verbs don't have yet (先生 brings 先, 図書館 brings 図 and 館), so that it can anchor the next round. Small words need a picture `images/<id>.jpg` like any word; missing ones are listed in `missing_images.txt` as `[kanji mode]`. `tools/make_audio.py` records small words too (and sets their `audio`); a reading question plays its anchor word's recording.

**Answer display.** When the answer is shown in Kanji mode, the kanji being studied and its reading in this word are bold: green when answered right, red when the answer had to be shown; the rest stays black (先**生** / せん**せい**). For small words the reading comes from `anchors`; for an anchor word it is worked out by removing the okurigana (見る → み), or, when two kanji can't be split (面白い), by the reading a small word gives for the same kanji (白い → しろ).

**Progress.** Kanji mode keeps its own progress (`kotoba-kanji-progress-v1`, same record format and the same FSRS schedule), so it never changes the review schedule of Words mode. The reading question of 見る (`read:miru-to_see`) is a different card from "to see → みる" in Words mode. Log entries of reading questions have `"mode": "read"` and the anchor's id as `word`.

### Data on each phone

Each friend's data lives in their browser's `localStorage` (see `js/storage.js`). Deploying a new version replaces only the files on the server, never this data.

| Key | What | Changes |
|---|---|---|
| `jpwords-progress-v2` | progress: each word's review state | rewritten by the review algorithm |
| `kotoba-log-v1` | study log: every answer | **append-only**, never edited or deleted |
| `kotoba-user` | random user id, e.g. `u_8f3a2k1x` | created once |
| `kotoba-image-password` | the picture password | saved when entered |
| `kotoba-kanji-progress-v1` | Kanji mode progress: reading questions (`read:<anchor id>`) and small words | rewritten by the review algorithm |
| `kotoba-letter-read` | title of the latest letter this phone has read | when the guide is opened |

A study log entry (practice typing after the answer is shown is not logged):

```json
{"user": "u_8f3a2k1x", "word": "iku-to_go", "correct": false, "answer": "いの", "hint": false, "time": "2026-11-18T13:05:00+09:00"}
```

`hint: true` means the answer was given after the hint (number of kana and the first kana) was shown. `near: true` (only on those entries) means Hint was pressed while the typed answer was wrong only in long vowels, voicing marks or a double consonant (とる for とおる); instead of the usual hint, the app shakes the answer, shows "Almost" above the keyboard and keeps the input to fix. It is scored like any first hint. `near: true` is also used when a verb was typed in its ます form: the app asks for the dictionary form the moment it's complete, without counting it as a mistake.

Future question types (such as the planned anchor practice) will add `"mode"` to their entries; an entry without `mode` is today's English → kana question. The anchor practice will keep its own progress under a new key, so it never changes the review schedule of the ordinary word lists.

Rules that keep the data usable:

1. Never change the keys above.
2. Never change a published word's `id`, and never delete a word: retire it.
3. If a data format ever needs to change, convert the old format when reading it; don't drop old fields.
4. If `words.json` is broken (duplicate or missing `id`, `tags` not a list), the app shows the error and does not start a group, so a broken word list can't write bad data.

After a deploy, a phone may keep using cached copies of `index.html`, `style.css` and `js/` for up to 10 minutes. If something looks broken right after a deploy, reload the page.

Romaji input uses [WanaKana](https://github.com/WaniKani/WanaKana) and the guide uses [marked](https://github.com/markedjs/marked) (both MIT license). Recordings: synthetic voice by Microsoft Azure AI Speech (ja-JP-NanamiNeural); readings and pitch accents analysed with VOICEVOX.
