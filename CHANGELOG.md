# Changelog

Versions follow `major.minor.patch`. Data on friends' phones (progress, study log) must keep working across every version.

## 0.2.4 — 2026-11-23

- Fix after release: the page can't be zoomed any more (double-tap or pinch).
- Fix after release: the quiz page fits exactly one screen and doesn't scroll. The keyboard is part of the page instead of floating over it, so it can never cover text. On shorter screens only the picture gets smaller; below 600 px of visible height the keyboard, text and spacing are a little smaller, and below 460 px the picture is hidden. The home and guide pages still scroll as before.

- Smoother on-screen keyboard: a tiny finger movement no longer cancels a key press (the keyboard no longer lets the page scroll), the gaps between keys count as part of the nearest key, and a finger that slides slightly off a key before lifting still types it. The keyboard looks the same.
- Typing a verb's ます form (from the first friend's feedback, see `FEEDBACK.md`): as soon as it's complete, the answer shakes and "Please type the dictionary form." appears above the keyboard; the input stays to be fixed. It isn't counted as a mistake: fixing it is a right answer; pressing Hint instead continues like any other word. Logged with `"near": true`.
- `FEEDBACK.md`: real feedback from friends, kept apart from `DEVLOG.md`.

## 0.2.3 — 2026-11-22

- New order of words inside a group (`js/session.js`): words come in threes, and a missed word comes back right after its three, then mixed with new words and other missed words instead of looping. A word answered after one hint passes after one right answer in its reviews; a word whose answer had to be shown needs two (and a hinted word whose answer is shown later needs two as well); four reviews at most. Learned words don't come back in the same group. While three or more words are still unlearned, the same word never appears twice in a row or alternating (stress-tested on 28,192 groups; see `DEVLOG.md`).
- The progress bar counts learned words.
- Words of one or two kana: the hint shows only the length, not the first kana.
- Pressing Hint when the typed answer is wrong only in long vowels, voicing marks or a double consonant (とる for とおる, あける for あげる, かこ for かっこ, つずく for つづく): no usual hint; the answer shakes, "Almost — just a little off." appears above the keyboard, and the input stays to be fixed. It's scored like a first hint, and logged with `"near": true`. If the answer is then shown, only the differing characters are red. A missing long vowel at the very end can't be spotted, because the learner may still be typing.
- A short correct-answer sound when a word is learned: right the first time, or right twice in its reviews (not when it only passes after four reviews). Made by `tools/make_chime.py`.
- The next word comes 0.5 s after the reading ends (`AFTER_SOUND_MS`). Recordings no longer end with about a second of silence, so moving on is faster.

## 0.2.2 — 2026-11-22

- Recordings now use Microsoft Azure's synthetic voice ja-JP-NanamiNeural, which sounds more natural. VOICEVOX still works out each reading and pitch accent (and the automatic reading check and hand corrections still apply); Azure is told exactly how to read each word with SSML `<phoneme>`, so it can't misread kanji like 開く.
- `tools/make_audio.py`: `"engine"` in `tools/voice.json` chooses Azure or VOICEVOX for the voice; switching back to VOICEVOX recognises the recordings it made before.
- `DEVLOG.md`: the decisions and feedback behind every version since the MVP; the design notes and open ideas moved there from the README.

## 0.2.1 — 2026-11-21

- Every word now has a recording made with VOICEVOX (四国めたん): the plain form, then the ます form. Readings were checked automatically against `kana` and pitch accents by ear; 7 words needed a corrected reading.
- `tools/make_audio.py`: makes drafts with VOICEVOX from the kanji, compares VOICEVOX's reading with `kana` (wrong readings can't be published), writes a review page for listening, applies hand corrections from `tools/audio_fixes.json`, and publishes MP3s with `--approve`. `tools/audio_manifest.json` records the text, fix and settings behind each recording, so only changed words are made again. It picks up where it left off if VOICEVOX stops.
- VOICEVOX credit in the guide and the README.

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
