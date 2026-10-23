# PinQuiz

A free live quiz game. The host puts a quiz on a big screen, and players join from their phones with a 6-digit game PIN.

- **Live sync through Firebase Realtime Database.** The host and every phone follow one shared game record, so everyone sees the same thing within a fraction of a second.
- **Fair timing.** Countdowns and answer speed use Firebase's server clock, not each phone's clock.
- **Cheat-proof scoring.** The rules in `database.rules.json` let players only join, mark themselves online, and submit one answer while a question is open. Only the host can change scores or move the game on, and players can't read the correct answers.
- **Survives refreshes.** If the host or a player reloads the page, they get a **Resume** or **Rejoin** button and carry on.
- **Free.** Uses Firebase's free Spark plan (no credit card) and free static hosting.

## Set up Firebase (once, about 5 minutes)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Create a project**. Google Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save.** Players are signed in invisibly, with no accounts.
3. **Build → Realtime Database → Create database.** Pick a location, then **Start in locked mode**.
4. In the database's **Rules** tab, replace everything with the contents of `database.rules.json` and click **Publish**.
5. **Project settings** (gear icon) → **Your apps** → the **Web** icon (`</>`) → register an app (no hosting checkbox needed) → copy the `firebaseConfig` values into `firebase-config.js`. Make sure `databaseURL` is filled in. If it's missing, copy it from the top of the Realtime Database page.

The config values are meant to be public. Security comes from the rules, not from hiding them.

## Put it online (free)

**GitHub Pages:** create a public repo, upload all the files, then **Settings → Pages → Deploy from a branch → `main` / root**. Your game will be at `https://<username>.github.io/<repo>/`.

**Or Firebase Hosting:** install the [Firebase CLI](https://firebase.google.com/docs/cli), then run `firebase login`, `firebase use --add` (pick your project) and `firebase deploy`. That also publishes the database rules.

## How to play

1. Open the admin page, `admin.html` (for example `https://<username>.github.io/<repo>/admin.html`) → **Host a game** → pick a quiz. Create and edit quizzes there too.
2. Players open the main site (or scan the QR code), then enter the PIN and a nickname. The main page only lets people join games.
3. **Start game.** Correct answers score up to 1000 points (faster earns more), plus up to 500 bonus points for an answer streak. A question closes when everyone online has answered, or when time runs out (plus a 1.5-second grace period for answers already on their way).

## Free plan limits

- **100 devices connected at the same time**, across all games together.
- 1 GB stored and 10 GB downloaded per month, far more than quiz games use.
- Games older than 24 hours can be overwritten, so PINs get reused.

## Quiz file format

```json
{
  "title": "My quiz",
  "questions": [
    { "text": "2 + 2 = ?", "options": ["3", "4", "5"], "correct": 1, "time": 20 }
  ]
}
```

`options` takes 2 to 4 answers, `correct` is the index of the right one, and `time` is 5, 10, 20, 30 or 60 seconds. Quizzes are saved in the host's browser. Use **Export** / **Import JSON** to back them up.

## Credits

Firebase JS SDK (Apache 2.0) and qrcode-generator by Kazuhiko Arase (MIT) are bundled in `vendor/`.
