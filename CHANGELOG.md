# Changelog

Versions follow `major.minor.patch`. Data on friends' phones (progress, study log) must keep working across every version.

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
