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

**Or Firebase Hosting, all in the browser:** this repo has a GitHub Action (`.github/workflows/deploy.yml`) that publishes the site to `https://cequiz-e7587.web.app` (the `cequiz-e7587` project) every time `main` changes. It needs a key, set up once:

1. Open [console.cloud.google.com/iam-admin/serviceaccounts](https://console.cloud.google.com/iam-admin/serviceaccounts) and pick the `cequiz-e7587` project.
2. **Create service account** → any name (e.g. `github-deploy`) → **Create and continue** → role **Firebase Hosting Admin** → **Done**.
3. Click the new account → **Keys → Add key → Create new key → JSON**. A `.json` file downloads. Open it and copy all of its text.
4. On GitHub: repo **Settings → Secrets and variables → Actions → New repository secret**. Name: `FIREBASE_SERVICE_ACCOUNT`, value: the text you copied → **Add secret**.
5. Repo **Actions** tab → **Deploy to Firebase Hosting** → **Run workflow**. After that it runs by itself whenever `main` changes.

Database rules aren't published by the Action. Paste `database.rules.json` into the Realtime Database **Rules** tab instead (step 4 of the Firebase setup above).

**Or Firebase Hosting from a computer:** install the [Firebase CLI](https://firebase.google.com/docs/cli), then run `firebase login`, `firebase use --add` (pick your project) and `firebase deploy`. That also publishes the database rules.

## How to play

1. Open the admin page, `admin.html` (for example `https://<username>.github.io/<repo>/admin.html`) → **Host a game** → pick a quiz. Create and edit quizzes there too.
   Presenting in a Zoom, Google Meet or Teams call? Share the host window. Every host screen fits a 16:9 window without scrolling, the **Full screen** button (or the F key) hides the browser bars, and **Copy join link** gives you the link to paste in the meeting chat.
2. Players open the main site (or scan the QR code), then enter the PIN and a nickname. The main page only lets people join games.
3. **Start game.** Correct answers score up to 1000 points (faster earns more), plus up to 500 bonus points for an answer streak. Double-points questions score twice as much, and no-points questions don't count. A question closes when everyone online has answered, or when time runs out (plus a 1.5-second grace period for answers already on their way).

## Settings: name, logo and answer icons

On the admin page, **Settings** changes the game's name, adds a logo, and picks the marks on the answer buttons (shapes, letters, numbers, or your own emoji or pictures). Everyone sees the change: the admin page, the big screen and players' phones.

- After updating to this version, paste the new `database.rules.json` into the Realtime Database **Rules** tab and click **Publish**, or settings won't save.
- Settings can only be changed from the browser that saved them first. To hand them to another browser, delete the `settings` entry in the Realtime Database **Data** tab, then save from the new browser.

## Free plan limits

- **100 devices connected at the same time**, across all games together.
- 1 GB stored and 10 GB downloaded per month, far more than quiz games use.
- Games older than 24 hours can be overwritten, so PINs get reused.

## Quiz file format

```json
{
  "title": "My quiz",
  "questions": [
    { "type": "quiz", "text": "2 + 2 = ?", "options": ["3", "4", "5"], "correct": 1, "time": 20, "points": 1 },
    { "type": "quiz", "text": "Which are even?", "options": ["2", "3", "4"], "correct": [0, 2], "multi": true, "time": 30, "points": 2 },
    { "type": "tf", "text": "The Sun is a star.", "options": ["True", "False"], "correct": 0, "time": 10, "points": 0 }
  ]
}
```

- `cover` (optional): what the big screen shows while players join, next to the game PIN and QR code: the title and a picture or GIF as `media` (same format as below).
- `type`: `"quiz"` (2 to 4 answers), `"tf"` (true or false), or `"slide"` (a cover slide between questions: `text` is its title, plus optional `media`; no answers or points).
- `correct`: the index of the right answer. For a multi-select question (`"multi": true`), a list of indexes. Players score only if they pick exactly those.
- `time`: 5, 10, 15, 20, 30, 45, 60, 90, 120, 180 or 240 seconds.
- `points`: `1` standard, `2` double points, `0` no points.
- `media` (optional): a picture, GIF, MP3 or MP4 shown or played on the host screen, as `{ "kind": "image" | "video" | "audio", "name": "file name", "data": "data:...;base64,..." }`. Export writes it this way; the editor stores uploads (up to 50 MB each) in the browser's IndexedDB, so a quiz's media only exists in the browser that made or imported it. Export it to move it to another computer. Quizzes are saved in the host's browser. Use **Export** / **Import JSON** to back them up.

## Credits

Firebase JS SDK (Apache 2.0) and qrcode-generator by Kazuhiko Arase (MIT) are bundled in `vendor/`.
