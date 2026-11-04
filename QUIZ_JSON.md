# Creating a quiz with JSON

You can write a quiz as a JSON file and load it on the admin page instead of typing it into the editor. This is handy for long quizzes, for copying questions from a spreadsheet or document, or for having an AI assistant draft the questions.

A ready-to-import example is in [`examples/sample-quiz.json`](examples/sample-quiz.json).

## Import a quiz

1. Open the admin page (`admin.html`) and sign in.
2. Click **Create and edit quizzes**, then **Import JSON**, and pick your `.json` file.
3. The quiz appears in the list. Click **Edit** to check it, then **Host a game** to play it.

Imported quizzes are saved in that browser only. To use the same quiz on another computer, import the file there too, or click **Export** to get a copy that includes its pictures and media.

## The smallest quiz

```json
{
  "title": "My quiz",
  "questions": [
    {
      "text": "2 + 2 = ?",
      "options": ["3", "4", "5"],
      "correct": 1
    }
  ]
}
```

Anything left out gets a default: a 20-second timer, standard points, single answer.

## A full example

```json
{
  "title": "Science Warm-up",
  "cover": { "title": "Welcome! Grab your phone and join" },
  "questions": [
    { "type": "slide", "text": "Round 1: Space" },
    { "type": "quiz", "text": "Which planet is known as the Red Planet?", "options": ["Venus", "Mars", "Jupiter", "Mercury"], "correct": 1, "time": 20, "points": 1 },
    { "type": "tf", "text": "The Sun is a star.", "options": ["True", "False"], "correct": 0, "time": 10, "points": 0 },
    { "type": "quiz", "text": "Which of these are prime numbers?", "options": ["2", "9", "13", "21"], "correct": [0, 2], "multi": true, "time": 30, "points": 2 }
  ]
}
```

## Quiz fields

| Field | Required | What it is |
| --- | --- | --- |
| `title` | Yes | The quiz name shown in your quiz list. Text. |
| `questions` | Yes | The list of questions and slides, in the order they're played. At least one. |
| `cover` | No | What the big screen shows while players join. See [Cover](#cover). |

## Question fields

| Field | Required | What it is |
| --- | --- | --- |
| `type` | No | `"quiz"` (2 to 4 answers), `"tf"` (true or false) or `"slide"` (a title page between questions). Default `"quiz"`. |
| `text` | Yes | The question. For a slide, its title. Keep it under 160 characters so it fits the big screen. |
| `options` | Yes, except slides | The answers, 2 to 4 of them. Keep each under 80 characters. For `"tf"`, give exactly two, such as `["True", "False"]`. |
| `correct` | Yes, except slides | Which answer is right, counting from **0** (see below). For a multi-select question, a list such as `[0, 2]`. |
| `multi` | No | `true` lets players pick several answers and then press Submit. Only for `"quiz"`. Default `false`. |
| `time` | No | Seconds to answer: `5`, `10`, `15`, `20`, `30`, `45`, `60`, `90`, `120`, `180` or `240`. Default `20`. |
| `points` | No | `1` standard, `2` double points, `0` no points (a warm-up that doesn't count). Default `1`. |
| `media` | No | A picture, GIF, MP3 or MP4 for the big screen. See [Media](#media). |

### Answers count from 0

`correct` uses the answer's position in `options`, starting at 0. Each position also has a fixed colour and shape on the big screen and on players' phones:

| Position | `correct` value | Colour and shape |
| --- | --- | --- |
| 1st answer | `0` | Red triangle |
| 2nd answer | `1` | Teal diamond |
| 3rd answer | `2` | Orange circle |
| 4th answer | `3` | Blue square |

So in `"options": ["Venus", "Mars", "Jupiter", "Mercury"]`, Mars is `"correct": 1`.

The shapes can be changed to letters, numbers or your own icons in the admin page's **Settings**. The positions stay the same.

### Multi-select questions

Set `"multi": true` and list every right answer in `correct`:

```json
{ "text": "Which are even?", "options": ["2", "3", "4", "7"], "correct": [0, 2], "multi": true, "time": 30 }
```

Players score only if they pick exactly those answers and nothing else.

### Slides

A slide is a title page shown between questions, for example to start a new round. Players' phones show "Look at the screen". Slides have no answers, timer or points, so only `text` and `media` matter:

```json
{ "type": "slide", "text": "Round 2: History" }
```

Give a slide a title, a picture, or both.

## Cover

The cover is what the big screen shows next to the game PIN and QR code while players join.

```json
"cover": {
  "title": "Welcome! Grab your phone and join",
  "media": { "kind": "image", "name": "logo.png", "data": "data:image/png;base64,..." }
}
```

- `title` is the heading on that screen. It's separate from the quiz `title`. Use `""` for no heading. If you leave it out, the quiz title is used.
- `media` must be a picture or GIF.

## Media

Pictures, GIFs, video and audio are shown or played on the big screen only, not on players' phones. A question with its own video or audio plays it instead of the question music.

Media is written inside the JSON as a data URL:

```json
"media": { "kind": "image", "name": "mars.jpg", "data": "data:image/jpeg;base64,/9j/4AAQSkZJRg..." }
```

| `kind` | Files |
| --- | --- |
| `"image"` | PNG, JPEG, GIF, WebP |
| `"video"` | MP4, WebM |
| `"audio"` | MP3, M4A, WAV, OGG |

The easiest way to get this right is to let the app write it: import the quiz without media, add the files in the editor, then click **Export**. The exported file has the media built in.

To write it by hand, turn the file into base64 and put it after the `data:<type>;base64,` prefix:

- macOS: `base64 -i mars.jpg | tr -d '\n'`
- Linux: `base64 -w0 mars.jpg`
- Windows (PowerShell): `[Convert]::ToBase64String([IO.File]::ReadAllBytes("mars.jpg"))`

Keep each file under 50 MB. Large videos make the JSON file large and slow to import.

## How scoring works

- A correct answer earns up to 1000 points: full points for an instant answer, falling to 500 at the buzzer.
- Answer streaks add a bonus of 100 points per question in the streak after the first, up to 500.
- `"points": 2` doubles the answer points (the streak bonus isn't doubled). `"points": 0` scores nothing, and a correct answer to it keeps a streak going.
- A question closes when every player online has answered, or when time runs out.

## What the importer does with mistakes

If a value is wrong but the file is otherwise valid, the importer quietly uses a default:

| You wrote | The quiz gets |
| --- | --- |
| A `time` not in the list, such as `25` | 20 seconds |
| `points` other than `0`, `1` or `2` | Standard points |
| An unknown `type` | `"quiz"` |
| `"multi": true` on a `"tf"` question | Single answer |
| A list in `correct` without `"multi": true` | Only the first answer in the list counts |
| `media` that isn't a valid data URL | No media |

Open the quiz in the editor after importing to check it. When you click **Save quiz**, the editor points out anything that still needs fixing, such as a question with no text.

## "That file isn't a PinQuiz quiz"

The import is rejected when:

- The file isn't valid JSON. A missing comma, a trailing comma after the last item, or curly quotes (“ ”) instead of straight quotes (") are the usual causes. Paste the file into a JSON validator to find the line.
- `title` is missing, or `questions` is missing or empty.
- A question has no `text`.
- A question that isn't a slide has fewer than 2 or more than 4 `options`.
- `correct` is missing, isn't a whole number, or points past the last answer, for example `"correct": 3` with only three options.

## Drafting a quiz with an AI assistant

You can ask an AI assistant to write the questions in this format. A prompt like this works well:

> Write a 10-question quiz about the solar system as JSON for PinQuiz. Use this format: `{"title": "...", "questions": [{"type": "quiz", "text": "...", "options": ["...", "...", "...", "..."], "correct": 0, "time": 20, "points": 1}]}`. `correct` is the index of the right answer, counting from 0. Mix in two true-or-false questions (`"type": "tf"`, `"options": ["True", "False"]`) and one multi-select question (`"multi": true`, `"correct"` as a list). Keep questions under 160 characters and answers under 80. Return only the JSON.

Check the answers before you host. AI assistants can get facts wrong.
