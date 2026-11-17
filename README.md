# Japanese Words

A small web app for memorizing Japanese vocabulary on your phone.
You see a picture and an English meaning, and you type the Japanese word.

## Use it on your phone

1. Open the link in your phone's browser: `https://lily-kong.github.com/`
2. Add it to your home screen so it opens like an app:
   - **iPhone (Safari):** Share button → *Add to Home Screen*
   - **Android (Chrome):** menu (⋮) → *Add to Home screen*
3. Tap **Study**.

You need an internet connection. Always use the same browser on the same phone, because your progress is stored there.

## How to study

- Type the word in **romaji** on your normal English keyboard. It turns into kana as you type (`taberu` → たべる). To type ん, press `n` twice.
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

The home page shows every batch of words, how many you have learned, and how many are ready for review. Tap a batch to see each word and when its next review is.

## Back up your progress

Your progress is saved only in your phone's browser. It is lost if you clear your browser data or change phones.

- **Export progress** downloads a file with your progress.
- **Import progress** restores it from that file.
- **Reset** deletes all progress.

Export from time to time to keep a backup.

## For developers

```
index.html     the whole app
words.json     the word list
images/        one picture per word
audio/         one recording per word (optional)
```

Run it locally:

```
python3 -m http.server
```

Then open `http://localhost:8000`. Opening `index.html` directly does not work, because the browser blocks loading `words.json`.

Each word in `words.json` looks like this:

```json
{
  "id": "au-to_meet",
  "kana": "あう",
  "kanji": "会う",
  "en": "to meet",
  "image": "images/au-to_meet.jpg",
  "audio": "audio/au-to_meet.mp3",
  "batch": 1
}
```

- One entry is one meaning of one word. `id` and `en` must be unique, and an `id` should never change once published, because progress is stored by `id`.
- If an audio file is missing, the app uses the browser's built-in Japanese voice.
- Group size, review intervals and other settings are constants at the top of the script in `index.html`.

Romaji input uses [WanaKana](https://github.com/WaniKani/WanaKana) (MIT license).
