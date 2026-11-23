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

## 0.2.3 — 2026-11-22 · Inside a group: order, rhythm and a small reward

**The problem.** A missed word was always put back two places later and had to be answered right three times in a row. Near the end of a group, when no new words were left, the same few missed words looped again and again, which is exactly the feeling I wanted to avoid. I wanted something like SpanishDict: words in threes, and when all three are missed, they come back as a block right after; later repetitions should be mixed with other words, not cycled.

**What exists to borrow.** There is no standard algorithm for the order *inside* one session (FSRS, which I plan to use later, schedules *between* days). But a few ideas are well tested: Pimsleur's graduated intervals and expanding retrieval practice (Landauer & Bjork, 1978) — the gap grows after each success; Anki's learning steps — a missed card comes back within the same session; and the "working set" used by apps like Memrise and SpanishDict — only a few words are in play at once.

**Design by simulation, before touching the app.** The ordering logic lives in its own file, `js/session.js`, with no UI, so the exact same code can run in a simulation and in the app. Every rule change below was checked by printing the real order for typical cases (uppercase = first time, lowercase = repetition, ✗ = missed).

- **First version:** a missed word comes back three places later, then the gap grows (4, then 7); a repetition is never followed by another repetition when a new word could be shown instead; at most 4 unlearned words at once. All three missed gave exactly `A✗ B✗ C✗ a b c D a E b F c …`. But the simulation also showed the old problem at the end: a last missed word gave `L✗ l l l`, and with 30% errors a group took 77 appearances with 16 repetitions in a row.
- **My rule: low pressure.** Instead of three right answers in a row: a missed word passes after **two** right answers in its reviews, or after **four** reviews whatever happens (right right → done; right wrong right → done; right wrong wrong → a fourth, then done). With the same random answers, the 30%-error group went from 77 to 31 appearances.
- **Rejected: re-using learned words as spacers.** I tried filling gaps with words already learned in this group. It kept the spacing, but I decided learned words should not come back: being re-tested on something you just got right feels like distrust, and getting it wrong then is a punishment. Spacing has to come from new words and *other* missed words.

**A hint is half a mistake.** Pressing Hint once (number of kana and first kana) and then answering right felt very different from needing the answer, but both counted as a full miss, which was discouraging. I suggested weights: one hint = 0.5, two hints = 1. → Each appearance now ends as *right*, *hinted* or *wrong*, and the weight decides how many right reviews are needed: hinted → 1, wrong → 2. If a hinted word later needs its answer shown, it goes up to 2. The result is only recorded when the appearance ends, so the app knows whether the hint was enough.

**Small slips, small cost.** Two more sources of frustration: for one- or two-kana words the hint (length + first kana) nearly gives the answer away, and a wrong long vowel, voicing mark or double consonant is a near miss, not a blank. Long vowels and double consonants are especially hard for Spanish speakers, whose language doesn't distinguish length; voicing (k/g, t/d) exists in Spanish, so it's less of a problem but still happens. → Short words get only the length as a hint. For near misses I first made the app react on its own: as soon as the typed answer was a near miss, it showed the answer with the differing characters in red. Then I realised there is no submit key: learners already *see* that their answer isn't accepted, and they press Hint exactly when they don't know *why*. So the reaction moved to the Hint key: if the typed answer is a near miss, there is no usual hint; the answer shakes, "Almost — just a little off." appears above the keyboard, and the input stays so they can fix it themselves. Scoring isn't special (it counts like any first hint), but the log records `"near": true` with what was typed, so the raw data stays separate. If they press Hint again, the answer is shown with only the differing characters in red. Detection lives in `js/kana.js`: both answers are reduced to a "skeleton" without voicing marks, small っ and lengthening kana (づ/ず and ぢ/じ sound the same and count too), and compared; the red characters come from aligning the two strings (longest common subsequence). *Limit:* a missing long vowel at the very end (せんせ for せんせい) looks like an unfinished answer, so it gets the usual hint.

**Final design.** Words come in threes: a miss comes back three places later, right after its batch of three; a right review pushes the next one four places away. Priority for the next word: a missed word's first review when due → another due review, but alternate with a new word when possible → a new word, unless 4 words are still unlearned → otherwise the unlearned word *shown longest ago*, even if it is a bit early. That last rule gives a guarantee: the last two positions hold at most two different words, so while three or more words are still unlearned, the word shown longest ago is never one of them. **The same word is never repeated back-to-back or alternated (a x a) while three or more words remain**; only the last one or two words can repeat closely.

**Stress test.** The real `session.js`, 28,192 groups of 12 words: every combination of first-try misses (4,096) with all reviews right, the same 4,096 with all reviews wrong, and 20,000 random groups at 90 / 70 / 50 / 30 / 10% right.

| | All cases | While 3+ words remain |
|---|---|---|
| Same word back-to-back | 13,990 | **0** |
| Same word alternating (a x a) | 28,120 | **0** |

After adding hint weights, the test was widened to 32,288 groups (first tries that were hinted or wrong, reviews all right or all wrong, and random right / hinted / wrong at five different rates): still **0** in both rows while three or more words remain.

Every group ended; the longest took 60 appearances (90% wrong). To make sure the test could fail, I broke the gaps on purpose in a copy: with gaps of 1 it reported 164,431 violations, with gaps of 2 it reported 192,736 alternations. Finally, in the real app, missing the first three words produced `A✗ B✗ C✗ a b c D a E b F c G H I J K L`, identical to the simulation, with the right progress, log and saved review levels.

**The moment a word is learned.** I wanted a small sound when a word is learned — right the first time, or right twice in its reviews — but not when it only passes because it reached four reviews: that would celebrate a word that wasn't really learned. → `answer()` in `session.js` reports *learned* or *finished*, and only *learned* plays the sound. The sound is generated by a small script (`tools/make_chime.py`, two rising notes, 0.28 s), so there's no sound file to license and it's easy to change.

**Moving on felt slow.** After the reading, the next word took too long. Measuring all 194 recordings showed why: Azure adds about 1.1 s of silence at the end of each one, and the app waited for it. → Recordings are made with exact silences (none at the end, 0.3 s at the start), and the next word comes 0.5 s after the reading. The 0.3 s at the start has a second job: on iPhones a sound can only start inside the tap, so the correct-answer sound and the reading must start together, and the chime fits in that silence instead of overlapping the voice.


**Assessment: does lower pressure cost learning?** My aim was less pressure without weaker memory. My judgement is that it costs little, for these reasons, but it is not proven yet:

*Strengths*

- **Every appearance is real retrieval.** The learner has to produce the word from a picture and English before seeing it, which is the strongest form of practice (the testing effect; Roediger & Karpicke, 2006). Even a hint (length and first kana) leaves most of the word to recall.
- **Spacing and interleaving inside the group.** A word comes back only after other words, with a growing gap, and never back-to-back while three or more words remain (proved by the stress test). Spaced practice beats massed repetition (Cepeda et al., 2006).
- **The cut repetitions were the least useful ones.** Extra repetitions in the same session give quickly diminishing returns for long-term memory (overlearning; Rohrer et al., 2005). Durable memory comes from the next days' reviews, and every word not answered right without help comes back the next day. Lowering the in-group requirement from three right answers to one or two mainly removes low-value repetitions.
- **Bounded effort.** At most four reviews per word and at most four unlearned words at a time keep a bad day short. The sound only marks real success, never "passed because of the limit".
- **Measurable.** Every attempt is in the log with its hint level, so these claims can be checked.

*Limits*

- **Passing in the group only shows short-term memory.** The gaps are three or four words, a few dozen seconds. The real test is the next day.
- **The hint is strong for short words.** For あう, "2 kana, starting with あ" is almost the answer, so counting it as half a mistake may be too generous for two- or three-kana words.
- **Typing slips count as misses.** A wrong long vowel or づ/ず may be an input problem, not a memory problem, and feels unfair.
- **Words that never stick.** A word can pass by the four-review limit every day without being learned. There is no detection yet of such words (Anki calls them leeches), which might need a better note or picture.
- **The schedule between days ignores the hint level.** A hinted word and a word whose answer was shown both start again from one day.
- **Built on principles and simulations, not on friends' results yet.**

*How to check it.* From the logs: compare next-day accuracy for words that were right, hinted or wrong in the group. If hinted words are recalled next day about as well as right ones, the half-mistake weight is fair; if not, hinted short words should need two right reviews. The same data can flag leeches, and can feed FSRS later, where *hinted* would map naturally to "Hard".

---

## 0.2.4 — 2026-11-23 · Smoother typing, and the first real feedback

**Feedback:** on the phone, some taps clearly landed on a key but typed nothing. Three causes in the code: the page could still scroll, so the slightest finger movement turned a tap into a scroll and the browser cancelled the press (`pointercancel`); the 6 px gaps between keys and 12 px between rows were dead zones; and sliding off a key before lifting cancelled the letter. → The keyboard area blocks scrolling and zooming (`touch-action: none`); each key's touch area now fills the gaps, while the visible key is drawn inside it (`::before`), so it looks exactly the same — like the iPhone keyboard, whose touch areas have no gaps; and a key captures the finger on press (`setPointerCapture`), so lifting slightly off it still types it. Checked by probing over 21,000 points across the keyboard: none fell outside a key.

**The first real feedback** ([FEEDBACK.md](FEEDBACK.md) #1). A friend typed the ます form of a verb; the app neither accepted it nor moved on, and they thought it had frozen. Until then every decision came from my own use; this was the first time someone else's experience showed a gap I couldn't see. Real feedback now has its own file, `FEEDBACK.md`, kept apart from this log: here the decisions, there the evidence as it arrived. The deeper lesson: because answers are checked while typing, a wrong but complete answer produces *no reaction*, and silence reads as a crash. → The ます form is now recognised as soon as it's complete (it can never be the start of the dictionary form, so it can't fire while someone is still typing). The answer shakes, "Please type the dictionary form." appears above the keyboard, and the input stays. The learner shouldn't have to know about the Hint key to get unstuck, so it reacts without waiting for it. My first version counted it as one hint and logged a new `masu` field; I then decided against both. It's a misunderstanding of the task that people make once, not a memory gap, so it isn't counted as a mistake: fixing it is a right answer, and only if they still can't and press Hint does it continue like any other word (the usual hint, half a mistake). The log simply marks it `"near": true`, like other near misses, instead of adding a field for a one-time error.

**Feeling the keys, later.** I tried real vibration on key presses and reminders. Android browsers support it, but iPhone web pages have no vibration API, only an unofficial trick (toggling a hidden switch control on iOS 18+). I decided against shipping half a feature built on a trick: phone vibration waits for a future app version, and the reminders keep only the on-screen shake.

**A quiz page that stays still** (fixed after the release, no new version). **Feedback (my own, on the phone):** double-tapping zoomed the page, which nobody needs here, and the quiz page could slide up and down. I'd rather it didn't move at all, but on a short phone the keyboard might then cover the words. → Zoom is off everywhere (`touch-action: manipulation` stops double-tap zoom; iPhone Safari ignores `user-scalable=no`, so a `gesturestart` listener stops pinching). The quiz page is now a column exactly one screen high (`100dvh`, which follows the browser bars as they appear and disappear), with the keyboard as its last item instead of floating over the page. Because the keyboard takes real space, nothing can be underneath it. The picture is the only part allowed to shrink, so a short screen gets a smaller picture, never hidden text. Below 600 px of visible height (an iPhone SE with the browser bars) the keyboard, text and spacing get smaller too, and below 460 px the picture goes. Checked in headless Chrome at visible heights from 382 to 746 px: the page never scrolls, the keyboard touches the bottom edge, and the English, the typed answer and the revealed answer all stay above it, with and without the reminder bar.

**Why a friend still saw the old version.** After 0.2.4 was published, a friend who opened the link from Instagram still had no ます-form reminder. The site was up to date; their phone wasn't. GitHub Pages lets browsers keep files for 10 minutes, and Instagram's in-app browser keeps its copy much longer. It also keeps its own storage, separate from Safari, so progress made inside Instagram doesn't follow the friend to Safari or the home-screen app. For now the advice is to open the link in Safari and add it to the home screen.

---

## Lessons that keep coming back

- **Store facts, not guesses.** A verb class instead of `true`, an `audio` field instead of asking the server, a raw log instead of only the derived progress.
- **Make the tools say where to look.** The checker, mismatches first on the review page, the missing-pictures list: my attention is the scarcest resource.
- **Test on the real thing.** iPhone sound, a stale cache, a password that never leaves my PC.
- **Small feedback, small fix, right away.** Almost every entry above started as one sentence from a user.
- **Simulate before building, and test the test.** Printing the real order for a few cases exposed problems no description would have; breaking the code on purpose proved the stress test could catch them.

## Open questions and next ideas

- From the first real feedback: a wrong but complete answer still gets no reaction until Hint is pressed. A gentle sign after a pause (without giving anything away) might help people who don't know about Hint.

- The review schedule between days is still a simple ladder (1 → 60 days). FSRS (used by Anki; `ts-fsrs` for JavaScript) could replace it in `js/schedule.js`, and the append-only log is the history it needs.

- Right after a deploy, a phone can mix cached old and new JS files and show a blank page until reloaded, and in-app browsers (Instagram) can keep an old version much longer. A service worker wouldn't help inside Instagram on iPhone; giving every release new file addresses (e.g. `main.js?v=…`) would.
- Logs reach me only when a friend exports them; cloud sync would close the loop (append-only logs make merging easy).
- A "this word confuses me" button, written to the log, to tie feelings to specific words.
- Per-word speech speed for words like 増える.
- Conjugation practice, built on the stored verb class.
- A Python script that reads exported logs and lists each friend's hardest words and typical mistakes. It should also answer two questions about the in-group rules: are hinted words recalled the next day as well as right ones, and which words keep failing day after day (leeches)?
