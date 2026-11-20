# Changelog

Versions follow `major.minor.patch`. Data on friends' phones (progress, study log) must keep working across every version.

## 0.2.0 — 2026-11-20

- Every word has `verb`: its class (`godan`, `ichidan`, `irregular`) or `false`. Verbs also have their ます form (`polite`, `polite_kana`). The answer shows 開ける／開けます and reads both forms; only the plain form is accepted as an answer. The next word appears after the reading has finished.
- Hint mode: unfinished romaji (e.g. the "k" of "ku") stays in the current slot with the caret, instead of jumping to the next slot; the first slot shows the caret before the grey hint.
- 194 verbs in use (before: 36); honorific and humble verbs are left out for now. Verbs are split into `Doshi_N5` and `Doshi_hoka`. Words with the same English now always have distinguishing notes; spelling follows common JLPT lists. 見る "to watch" retired, replaced by "to see".
- Home page: a progress bar for all words and for each category (learned / to review / not yet studied), with word counts.
- Words written only in kana (ある, する…) show the answer once instead of twice.
- Recordings: a word with `"audio": true` plays `audio/<id>.mp3`; the others use the browser's Japanese voice. The app no longer asks the server about a recording for every word on start (that was one request per word).
- `tools/check_words.py`: knows the い-ending honorific verbs (いらっしゃる…), only warns about same-English words that really can't be told apart, writes the words still missing a picture to `missing_images.txt`, warns about encrypted pictures and recordings that no longer belong to any word, checks `audio` against the files in `audio/`, and detects a replaced picture by comparing its content (not its date).
- `FRIENDS.md`: a guide and letters for friends (how to study, how to report how it feels, how to share the study log). Shown in the app under **Guide & letters**, with a **new** mark until the latest letter is read. The friend-facing parts of the README moved there.
- **Study all words** picks new words at random from every category; each category on the home page has its own **Study** button (new words in list order).
- Quiz: content below the English word sits higher; Backspace is as wide as Hint and aligned with it.

## 0.1.1 — 2026-11-19

- Own on-screen romaji keyboard (iPhone layout, with ー and a Hint key); the phone's keyboard and the computer's input method are no longer used. On a computer, the real keyboard works and lights up the on-screen keys.
- Quiz screen: the English word starts large and moves up when you type; one blinking caret instead of an underline; progress bar at the top; red/green colors instead of "Correct"/"Wrong".
- `words.json`: one word per line; `tags` (a word can be in several categories) instead of `batch`; `note` for part of speech or nuances; `retired` instead of deleting; picture and audio paths come from the `id`.
- Append-only study log of every answer, a per-phone user id, and export/import that includes the log. Import now merges instead of replacing.
- Pictures are encrypted (`images-enc/`); friends enter a password once. Originals are no longer in the repository or its history.
- Code split into `style.css` and modules in `js/`. `tools/check_words.py` checks the word list before a commit; `tools/encrypt_images.py` encrypts pictures.
- `words.json` is always re-checked with the server, so an update can't mix new code with an old word list.

## 0.1.0 — 2026-11-17

- First MVP: see a picture and an English meaning, type the Japanese word in romaji.
- Hints (number of kana and the first kana), then the answer; missed words come back until answered correctly three times.
- Groups of 12 words with spaced review (1 → 60 days), progress saved on the phone, export/import/reset.
- Pronunciation with the browser's Japanese voice (fixed for iPhone).
