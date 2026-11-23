# Feedback from friends

Real feedback from people using Kotoba, kept as it arrived. [DEVLOG.md](DEVLOG.md) records *decisions*, and decisions get rewritten as the design changes; this file keeps the *evidence* behind them, so the original experience isn't lost. Friends are numbered, never named, because the repository is public.

Each entry: what happened, in the friend's own terms → what it showed → what changed.

---

## #1 · 2026-11-23 · Friend 1 · version 0.2.3

**What happened.** They typed the ます form of a verb. The app neither accepted it nor moved on, and they thought it had frozen.

**What it showed.**

- The app only accepts the dictionary form, and nothing said so. The answer screen even shows 開ける／開けます, so typing the ます form is a natural guess.
- More generally: answers are checked while typing, with no submit key, so a wrong but complete answer gets **no visible reaction at all**. To a user, silence looks like a crash, not like "wrong". The Hint key is the way out, but only if you know to press it.

**What changed** (after 0.2.3). As soon as the full ます form is typed, the answer shakes and "Please type the dictionary form." appears above the keyboard; the input stays, so deleting ます is enough. It doesn't count as a mistake: this is a misunderstanding of the task, which a learner makes once, not a gap in memory. If they fix it, it's a right answer; if they can't and press Hint, it continues like any other word (the usual hint, counted as one hint). The log marks the attempt with `"near": true`, like other near misses. See DEVLOG, "The first real feedback".

**Still open.** Other wrong but complete answers still get no reaction until Hint is pressed.
