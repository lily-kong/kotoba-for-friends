# Kotoba for friends

A small web app for memorizing Japanese vocabulary on your phone.
You see a picture and an English meaning, and you type the Japanese word.

## Use it on your phone

1. Open the link in your phone's browser: `https://lily-kong.github.io/kotoba-for-friends/`
2. Add it to your home screen so it opens like an app:
   - **iPhone (Safari):** Share button → *Add to Home Screen*
   - **Android (Chrome):** menu (⋮) → *Add to Home screen*
3. Open it from the home-screen icon and enter the password I gave you (only the first time).
4. Tap **Study**.

You need an internet connection. Your progress is stored on your phone, so **always open the app from the home-screen icon**:

- On iPhone, the home-screen app and Safari keep **separate** progress, and Safari may delete website data you have not opened for 7 days. The home-screen app is not affected by this.
- Updates to the app or the word list never delete your progress.

## How to study

- Type the word in **romaji** on the app's own keyboard at the bottom of the screen. It turns into kana as you type (`taberu` → たべる). To type ん, press `n` twice. The ー key types a long vowel. The blue **Hint** key is where Return usually is. Your phone's own keyboard never opens, so it does not cover the page.
- **On a computer**, just type on your real keyboard; the key lights up on the screen keyboard too. **Enter** = Hint, **Backspace** = delete, **-** = ー. Your computer's Japanese input method is not used, so you can leave it on or off.
- **If you know the word:** type it. When it is correct, you hear the word and the next one appears after one second.
- **If you don't know it:** tap **Hint**. You see how many kana the word has, and the first kana.
- **Still stuck:** tap **Hint** again to see the full word and hear it. Type it once to continue.

Using a hint counts as a miss. A missed word comes back after two other words, and you must answer it correctly three times before it leaves the group.

A group has up to 12 words. It is finished when every word is cleared. If you quit in the middle, the group does not count.

## Review schedule

When there are words to review, a group is 4 new words and 8 review words. The app decides when each word comes back:

| What happened | Next review |
|---|---|
| New word, correct the first time | in 7 days |
| Missed | in 24 hours |
| Correct on review | the interval grows: 1 → 2 → 4 → 7 → 14 → 30 → 60 days |
| Missed on review | back to 24 hours |

## Word list

The home page shows every category, how many of its words you have learned, and how many are ready for review. A word can be in several categories. Tap a category to see each word and when its next review is.

## Back up your progress

Your progress and your study log are saved only in your phone's browser. They are lost if you clear your browser data or change phones.

- **Export progress** downloads a file with your progress and your study log. Send this file to me now and then, so I can see which words are hard for you.
- **Import progress** merges that file into your current data. For each word, the most recent record is kept, so importing an old backup never undoes newer study. Use it to move to a new phone.
- **Reset** deletes your progress and starts over. Your study log is kept.

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
tools/check_words.py    checks words.json before you commit
tools/encrypt_images.py encrypts images/ into images-enc/
words.json           the word list
images/              one picture per word (originals, NOT committed)
images-enc/          encrypted pictures (committed)
audio/               one recording per word (optional)
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
4. Commit `words.json` and `images-enc/`.

The checker checks every field, finds duplicate ids, non-kana characters, missing, orphaned or not-yet-encrypted pictures, and words with the same English. It also compares with the last commit and refuses a word list where a committed `id` has disappeared.

### words.json

One word per line:

```json
{"id": "akeru-to_open", "kana": "あける", "kanji": "開ける", "en": "to open", "note": "他動詞 · 五段", "tags": ["Batch 1", "他動詞"], "retired": false}
```

- One entry is one meaning of one word. Every field is required.
- `id`: lowercase letters, digits, `_` and `-`. It is also the picture's file name. **Never change it once published.**
- `note`: shown in small text under the picture, above the English. Use it for part of speech, 自動詞/他動詞, or nuances English can't express. `""` for none.
- `tags`: a list of categories. The home page lists every tag, in the order it first appears in the file.
- `retired`: `true` hides the word everywhere. Use it instead of deleting. If a word needs a big change (a different reading or meaning), retire it and add the new version under a new `id`, so it is studied as a new word.
- The picture must be `images/<id>.jpg` (encrypted to `images-enc/<id>.bin`). An optional recording goes in `audio/<id>.mp3`; without one, the browser's Japanese voice is used.
- New words are taught in the order they appear in the file.

### Data on each phone

Each friend's data lives in their browser's `localStorage` (see `js/storage.js`). Deploying a new version replaces only the files on the server, never this data.

| Key | What | Changes |
|---|---|---|
| `jpwords-progress-v2` | progress: each word's review state | rewritten by the review algorithm |
| `kotoba-log-v1` | study log: every answer | **append-only**, never edited or deleted |
| `kotoba-user` | random user id, e.g. `u_8f3a2k1x` | created once |
| `kotoba-image-password` | the picture password | saved when entered |

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

Romaji input uses [WanaKana](https://github.com/WaniKani/WanaKana) (MIT license).
