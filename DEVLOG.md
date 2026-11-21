# Development log

Kotoba is a small Japanese vocabulary app for a few friends. Most of its code was written by an AI coding assistant. What I did was decide what to build, use the app and judge the result, review the word data, and turn every piece of feedback into the next decision. This log records those decisions in order, because they are the part of the project that is really mine, and the part worth reusing.

Each entry follows the same shape: **problem or feedback → decision → why → trade-off**. So far the feedback is mostly my own, as the first user; the next step is my friends'.

---

## 0.1.0 — 2026-11-17 · The MVP

**A prototype in one sitting.** You see a picture and an English word, and type the Japanese in romaji (WanaKana turns it into kana). A hint shows the number of kana and the first kana; a second hint shows the answer. A missed word comes back two words later until it is answered right three times. Groups of 12, spaced review from 1 to 60 days, progress in the browser, export and import, and the browser's Japanese voice.

**No sound on iPhones.** Mobile browsers only let sound *start* inside a tap. The prototype tried an audio file first and fell back to speech after it failed, which was already too late. → Unlock speech with a silent sentence when Study is tapped, and decide between file and speech immediately. *Lesson: some bugs only exist on the real device.*

---

## 0.1.1 — 2026-11-19 · From prototype to something friends can rely on

**Understand the code before growing it.** One 700-line HTML file, and I know Python and C but not JavaScript. I don't plan to write it all myself, but I want to understand every part. → Simplify first (remove state that could be derived, let one `render()` draw the screen from the current stage), then split into modules with one job each, connected only in `main.js`, with comments that explain JavaScript in Python terms. *Trade-off: more files; in exchange, the review algorithm can be replaced by editing one of them.*

**Our own keyboard.** The phone keyboard covered half the screen and the input method converted romaji its own way. → No text field at all: an iPhone-style romaji keyboard on screen, and the computer's keys read by physical position (`event.code`, so a Japanese input method doesn't matter). My feedback shaped the details: no pop-up letters, just a colour change; the Hint key where Return usually is; Backspace as wide as Hint and aligned with it; a ー key.

**A quieter screen.** A black answer line and "Correct / Wrong" text felt noisy. → The English word starts large in the middle and moves up when you start typing; one blinking caret; red and green instead of words; a progress bar for the group.

**Friends' progress must survive every update.** Progress lives only on each phone, so a careless update could make it unreadable. → Rules: storage keys and word ids never change; a word is never deleted, only `retired`; data formats only grow; importing a backup merges (the newest record wins) instead of replacing; the app refuses a broken word list before it can write anything.

**An append-only study log.** I proposed one record per answer: who, which word, right or wrong, what was typed, when. → Every attempt is logged (practice typing after the answer is not); the progress record is treated as just one algorithm's output. *Why: from raw events, any future review algorithm, or an analysis of a friend's weak words, can be recomputed. The reverse is impossible.*

**A word list built to grow.** → One word per line in `words.json`; `tags` instead of a fixed batch, so a word can be in several categories; a `note` for things English can't say; picture and audio paths derived from the `id`. A Python checker runs before every commit, and compares with the last commit so a published id can't disappear.

**Copyrighted pictures on a public site.** The repository and GitHub Pages served the pictures to anyone. → Encrypt them (AES-GCM, key from a password), keep the originals on my PC only, friends enter the password once; the git history was rewritten so old commits don't contain them either. *A mistake worth recording: I changed the password locally and pushed, but the password file is never pushed, by design; the re-encrypted pictures are what must be committed.*

**Versions from the start.** A changelog, with the MVP named 0.1.0 after the fact.

**Old word list, new code.** Right after an update, a cached word list met new code and the app stopped with an error. → `words.json` is always re-checked with the server.

---

## 0.2.0 — 2026-11-20 · Verbs, categories, and a guide for friends

**A verb class, not a flag.** I first asked for `"verb": true`. Conjugation practice will need the class, so → `"godan"`, `"ichidan"` or `"irregular"`. The checker works out the ます form from the class and warns when it differs, which catches a wrong class or a typo.

**Show the polite form, accept the plain one.** → The answer shows 開ける／開けます and reads both; only the dictionary form counts. The next word waits until the reading has finished.

**Reviewing 170 new verbs.** Several words shared the same English, so a learner couldn't know which to type. → Every word with the same English must have its own note: `(transitive)` / `(intransitive)`, `(shirt, coat)` / `(shoes, trousers)`. Spelling follows common JLPT lists; verbs split into `Doshi_N5` and `Doshi_hoka`; honorific and humble verbs left out for now, to keep the scope clear.

**Hint mode felt bad to type in.** The caret jumped to the next box while a kana was still half-typed ("k" of "ku"). → Unfinished romaji stays in the current box with the caret.

**Progress you can see, and two ways to study.** → Progress bars (learned / due / not yet) for all words and each category. **Study all words** picks new words at random; each category's own **Study** keeps list order, so pairs like 開く／開ける appear together.

**Finding pictures at scale.** 170 pictures to find by hand. → The checker writes the words still missing a picture to `missing_images.txt` (Japanese, English, file name), warns about encrypted files left behind after renaming a picture, and detects a replaced picture by comparing content, because copying a file on Windows keeps its old date.

**200 needless requests.** The app asked the server about a recording for every word on every start. → Removed; later replaced by a field in the data (0.2.1).

**A guide for friends.** The log records *what* happened, never *how it felt*: an answer marked wrong that felt right, a misleading picture, a discouraging group. Those are often why people stop. → `FRIENDS.md`, in plain and warm English: three questions to notice, "just send a screenshot", how to share the log and that it's optional, and a short letter with each update. The app shows the same file, with a **new** mark until the latest letter is read. One source, so the two can never disagree.

---

## 0.2.1 — 2026-11-21 · Real recordings with VOICEVOX

**Say whether a recording exists in the data.** → `"audio": true` per word; the app never has to ask the server.

**Use the kanji for natural pitch, but check every reading.** Generating from kanji gives better pitch accent, but VOICEVOX sometimes picks the wrong reading. → `tools/make_audio.py` asks VOICEVOX how it *will* read each word and compares that with `kana`. It caught 開く read as ヒラク, 描く as エガク, 汚れる as ケガレル, a broken parse of 晴れる and more. Wrong readings can't be published; corrections go to `tools/audio_fixes.json` in VOICEVOX's kana notation, with the pitch accent; a review page lists problems first. A fingerprint of text, correction and settings means only changed words are made again, and the script resumes after VOICEVOX stops.

**When my ear disagreed with the dictionary.** 上がる sounded wrong to me with a flat ending, but it is flat (⓪) in standard Tokyo pitch. My intonation setting (1.16) exaggerated the flat ending. → Intonation back to 1.0, and OJAD as the reference when ear and memory disagree.

**A false alarm.** 続く was flagged because VOICEVOX writes ツズク; づ and ず sound the same. → They are treated as equal when comparing.

---

## 0.2.2 — 2026-11-22 · A more natural voice without losing accuracy

**Comparing voices.** Ten hard words with Azure and Google. Azure's Nanami sounded most natural, but read ambiguous kanji wrong (開く as ひらく), and unlike VOICEVOX it can't tell you its reading first.

**An experiment before a decision.** SSML `<phoneme>` with VOICEVOX's notation: 着る (`キル'`, flat) and 切る (`キ'ル`, falling) came out clearly different, so Azure follows the pitch accent we give it.

**Decision.** VOICEVOX analyses and checks the reading; Azure speaks exactly that. Every earlier correction still applies, and switching back to VOICEVOX recognises the recordings it made before. *Open: a few words come out too fast (増える ふえ sounds like "fei").*

---

## Lessons that keep coming back

- **Store facts, not guesses.** A verb class instead of `true`, an `audio` field instead of asking the server, a raw log instead of only the derived progress.
- **Make the tools say where to look.** The checker, mismatches first on the review page, the missing-pictures list: my attention is the scarcest resource.
- **Test on the real thing.** iPhone sound, a stale cache, a password that never leaves my PC.
- **Small feedback, small fix, right away.** Almost every entry above started as one sentence from a user.

## Open questions and next ideas

- Right after a deploy, a phone can mix cached old and new JS files and show a blank page until reloaded; a small service worker would fix it.
- Logs reach me only when a friend exports them; cloud sync would close the loop (append-only logs make merging easy).
- A "this word confuses me" button, written to the log, to tie feelings to specific words.
- Per-word speech speed for words like 増える.
- Conjugation practice, built on the stored verb class.
- A Python script that reads exported logs and lists each friend's hardest words and typical mistakes.
