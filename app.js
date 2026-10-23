/* PinQuiz: a free live quiz game.
 * The host and every player follow one shared game record in Firebase
 * Realtime Database; database.rules.json decides who may write what. */
(function () {
  "use strict";

  const STORE_QUIZZES = "pinquiz.quizzes";
  const STORE_PLAYER = "pinquiz.player";
  const STORE_HOSTING = "pinquiz.hosting";
  const MAX_POINTS = 1000;

  const SHAPES = [
    '<svg class="shape" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 4 37 34H3z"/></svg>',
    '<svg class="shape" viewBox="0 0 40 40" aria-hidden="true"><path d="M20 2 38 20 20 38 2 20z"/></svg>',
    '<svg class="shape" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"/></svg>',
    '<svg class="shape" viewBox="0 0 40 40" aria-hidden="true"><rect x="4" y="4" width="32" height="32" rx="4"/></svg>',
  ];

  const SAMPLE_QUIZ = {
    id: "sample-space",
    title: "Space Quick-Fire (example)",
    questions: [
      { text: "Which planet is closest to the Sun?", options: ["Venus", "Mercury", "Mars", "Earth"], correct: 1, time: 20 },
      { text: "How long does sunlight take to reach Earth?", options: ["About 8 seconds", "About 8 minutes", "About 8 hours", "About 1 day"], correct: 1, time: 20 },
      { text: "Which planet has the most known moons?", options: ["Jupiter", "Saturn", "Uranus", "Neptune"], correct: 1, time: 20 },
      { text: "The Moon has no atmosphere to speak of.", options: ["True", "False"], correct: 0, time: 10 },
      { text: "What is the largest planet in our solar system?", options: ["Saturn", "Neptune", "Jupiter", "Earth"], correct: 2, time: 20 },
    ],
  };

  // ---------- small helpers ----------
  const app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel) => app.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage blocked: keep going in memory */ }
  }
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function joinUrl(pin) {
    return location.origin + location.pathname + "?pin=" + pin;
  }

  function getQuizzes() {
    const list = load(STORE_QUIZZES, null);
    if (Array.isArray(list) && list.length) return list;
    return [SAMPLE_QUIZ];
  }
  function setQuizzes(list) { save(STORE_QUIZZES, list); }

  function validQuiz(q) {
    return q && typeof q.title === "string" && Array.isArray(q.questions) && q.questions.length > 0 &&
      q.questions.every((x) => typeof x.text === "string" && Array.isArray(x.options) &&
        x.options.length >= 2 && x.options.length <= 4 && Number.isInteger(x.correct) &&
        x.correct >= 0 && x.correct < x.options.length);
  }

  let cleanup = null; // tears down the current screen's timers/connections
  function go(render) {
    if (cleanup) { const c = cleanup; cleanup = null; c(); }
    render();
    window.scrollTo(0, 0);
  }

  // ---------- home ----------
  function home() {
    app.innerHTML = `
      <section class="stack home">
        <div class="stack center">
          <div class="brand"><h1>PinQuiz</h1><span class="dot"></span></div>
          <p class="muted">Live quiz games for a room full of phones. Free, no accounts.</p>
        </div>
        <div class="row center" id="resume"></div>
        <div class="choices narrow" style="max-width:720px">
          <form class="card stack" id="joinForm">
            <h2>Join a game</h2>
            <label class="label" for="pinIn">Game PIN</label>
            <input id="pinIn" class="pin" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="000000" required>
            <label class="label" for="nickIn">Nickname</label>
            <input id="nickIn" maxlength="16" autocomplete="nickname" placeholder="Your name" pattern="[A-Za-z0-9 _\\-]{1,16}" title="Letters, numbers, spaces, - and _" required>
            <button type="submit">Join</button>
          </form>
          <div class="card stack">
            <h2>Host a game</h2>
            <p class="muted">Pick a quiz, put this screen where everyone can see it, and share the PIN.</p>
            <div class="spacer"></div>
            <button id="hostBtn">Host a game</button>
            <button class="ghost" id="editBtn">Create and edit quizzes</button>
          </div>
        </div>
      </section>`;
    const params = new URLSearchParams(location.search);
    const me = load(STORE_PLAYER, {});
    if (params.get("pin")) $("#pinIn").value = params.get("pin").replace(/\D/g, "").slice(0, 6);
    if (me.nick) $("#nickIn").value = me.nick;
    ($("#pinIn").value ? $("#nickIn") : $("#pinIn")).focus();
    const hosting = load(STORE_HOSTING, null);
    if (hosting && hosting.pin) {
      $("#resume").innerHTML = `<button class="ghost small" id="resumeHost">Resume hosting game ${esc(hosting.pin)}</button>`;
      $("#resumeHost").onclick = () => go(() => hostScreen(null, hosting.pin));
    } else if (me.pin && me.nick && !params.get("pin")) {
      $("#resume").innerHTML = `<button class="ghost small" id="rejoin">Rejoin game ${esc(me.pin)} as ${esc(me.nick)}</button>`;
      $("#rejoin").onclick = () => go(() => playerScreen(me.pin, me.nick));
    }
    $("#joinForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const pin = $("#pinIn").value.replace(/\D/g, "");
      const nick = $("#nickIn").value.trim().slice(0, 16);
      if (pin.length !== 6) return toast("The game PIN has 6 digits.");
      if (!/^[A-Za-z0-9 _-]{1,16}$/.test(nick)) return toast("Nicknames use letters, numbers, spaces, - and _ (up to 16).");
      go(() => playerScreen(pin, nick));
    });
    $("#hostBtn").addEventListener("click", () => go(pickQuiz));
    $("#editBtn").addEventListener("click", () => go(quizList));
  }

  // ---------- quiz library + editor ----------
  function quizList() {
    const list = getQuizzes();
    app.innerHTML = `
      <section class="stack narrow" style="max-width:760px">
        <div class="row"><button class="ghost small" id="back">← Back</button><div class="spacer"></div>
          <label class="btn ghost small" style="background:transparent;color:var(--fg);box-shadow:inset 0 0 0 2px var(--line)">Import JSON<input type="file" id="imp" accept="application/json,.json" hidden></label>
          <button class="small" id="new">New quiz</button></div>
        <h2>Your quizzes</h2>
        <p class="muted">Quizzes are saved in this browser. Export them to keep a copy or move them to another device.</p>
        <div class="quizlist">${list.map((q, i) => `
          <div class="card item">
            <div class="grow" style="min-width:0"><h3>${esc(q.title)}</h3><p class="muted">${q.questions.length} questions</p></div>
            <button class="small ghost" data-edit="${i}">Edit</button>
            <button class="small ghost" data-exp="${i}">Export</button>
            <button class="small danger" data-del="${i}">Delete</button>
          </div>`).join("")}</div>
      </section>`;
    $("#back").onclick = () => go(home);
    $("#new").onclick = () => go(() => editor({ id: uid(), title: "", questions: [{ text: "", options: ["", "", "", ""], correct: 0, time: 20 }] }));
    app.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => go(() => editor(JSON.parse(JSON.stringify(list[+b.dataset.edit])))));
    app.querySelectorAll("[data-exp]").forEach((b) => b.onclick = () => {
      const q = list[+b.dataset.exp];
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([JSON.stringify(q, null, 2)], { type: "application/json" }));
      a.download = (q.title || "quiz").replace(/[^\w-]+/g, "_") + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
    const armed = new Set();
    app.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
      const i = +b.dataset.del;
      if (!armed.has(i)) { armed.add(i); b.textContent = "Tap again to delete"; return; }
      const next = list.filter((_, j) => j !== i);
      setQuizzes(next.length ? next : []);
      if (!next.length) save(STORE_QUIZZES, [SAMPLE_QUIZ]);
      go(quizList);
    });
    $("#imp").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const q = JSON.parse(await f.text());
        if (!validQuiz(q)) throw new Error();
        q.id = uid();
        q.questions.forEach((x) => { x.time = [5, 10, 20, 30, 60].includes(x.time) ? x.time : 20; });
        setQuizzes([...getQuizzes(), q]);
        toast("Imported " + q.title);
        go(quizList);
      } catch { toast("That file isn't a PinQuiz quiz."); }
    };
  }

  function editor(quiz) {
    function draw() {
      app.innerHTML = `
        <section class="stack narrow" style="max-width:760px">
          <div class="row"><button class="ghost small" id="cancel">← Cancel</button><div class="spacer"></div><button class="small" id="saveBtn">Save quiz</button></div>
          <label class="label" for="title">Quiz title</label>
          <input id="title" maxlength="80" placeholder="e.g. Friday Trivia" value="${esc(quiz.title)}">
          ${quiz.questions.map((q, qi) => `
            <div class="card qedit" data-q="${qi}">
              <div class="row"><h3>Question ${qi + 1}</h3><div class="spacer"></div>
                <label class="label" for="time${qi}">Time</label>
                <select id="time${qi}" data-time="${qi}" style="width:auto">${[5, 10, 20, 30, 60].map((t) => `<option value="${t}" ${q.time === t ? "selected" : ""}>${t}s</option>`).join("")}</select>
                <button class="small danger" data-rmq="${qi}" ${quiz.questions.length < 2 ? "disabled" : ""}>Remove</button></div>
              <input id="qt${qi}" data-text="${qi}" maxlength="160" placeholder="Type your question" value="${esc(q.text)}">
              ${q.options.map((o, oi) => `
                <div class="optrow">
                  <span class="swatch" style="background:var(--a${oi})"></span>
                  <input type="radio" id="c${qi}_${oi}" name="c${qi}" data-correct="${qi}" value="${oi}" ${q.correct === oi ? "checked" : ""} aria-label="Mark answer ${oi + 1} correct">
                  <input id="o${qi}_${oi}" data-opt="${qi}" data-oi="${oi}" maxlength="80" placeholder="Answer ${oi + 1}${oi > 1 ? " (optional)" : ""}" value="${esc(o)}">
                </div>`).join("")}
              <p class="muted" style="font-size:.9rem">Select the circle next to the correct answer.</p>
            </div>`).join("")}
          <button class="ghost" id="addQ">+ Add question</button>
        </section>`;
      $("#cancel").onclick = () => go(quizList);
      $("#title").oninput = (e) => { quiz.title = e.target.value; };
      app.querySelectorAll("[data-text]").forEach((el) => el.oninput = () => { quiz.questions[+el.dataset.text].text = el.value; });
      app.querySelectorAll("[data-opt]").forEach((el) => el.oninput = () => { quiz.questions[+el.dataset.opt].options[+el.dataset.oi] = el.value; });
      app.querySelectorAll("[data-correct]").forEach((el) => el.onchange = () => { quiz.questions[+el.dataset.correct].correct = +el.value; });
      app.querySelectorAll("[data-time]").forEach((el) => el.onchange = () => { quiz.questions[+el.dataset.time].time = +el.value; });
      app.querySelectorAll("[data-rmq]").forEach((el) => el.onclick = () => { quiz.questions.splice(+el.dataset.rmq, 1); draw(); });
      $("#addQ").onclick = () => { quiz.questions.push({ text: "", options: ["", "", "", ""], correct: 0, time: 20 }); draw(); app.querySelector(`#qt${quiz.questions.length - 1}`).focus(); };
      $("#saveBtn").onclick = saveQuiz;
    }
    function saveQuiz() {
      const out = { id: quiz.id, title: quiz.title.trim(), questions: [] };
      if (!out.title) return toast("Give the quiz a title.");
      for (let i = 0; i < quiz.questions.length; i++) {
        const q = quiz.questions[i];
        const opts = q.options.map((o) => o.trim());
        if (!q.text.trim()) return toast(`Question ${i + 1} needs text.`);
        if (!opts[q.correct]) return toast(`Question ${i + 1}: the correct answer is empty.`);
        // Keep slot order (colours stay put) but drop empty trailing slots.
        const kept = [];
        let correct = 0;
        opts.forEach((o, oi) => { if (o) { if (oi === q.correct) correct = kept.length; kept.push(o); } });
        if (kept.length < 2) return toast(`Question ${i + 1} needs at least 2 answers.`);
        out.questions.push({ text: q.text.trim(), options: kept, correct, time: q.time });
      }
      const list = getQuizzes().filter((q) => q.id !== out.id);
      const at = getQuizzes().findIndex((q) => q.id === out.id);
      list.splice(at < 0 ? list.length : at, 0, out);
      setQuizzes(list);
      toast("Saved " + out.title);
      go(quizList);
    }
    // Pad options to four editable slots.
    quiz.questions.forEach((q) => { while (q.options.length < 4) q.options.push(""); });
    draw();
  }

  function pickQuiz() {
    const list = getQuizzes();
    app.innerHTML = `
      <section class="stack narrow" style="max-width:760px">
        <div class="row"><button class="ghost small" id="back">← Back</button></div>
        <h2>Pick a quiz to host</h2>
        <div class="quizlist">${list.map((q, i) => `
          <div class="card item">
            <div class="grow" style="min-width:0"><h3>${esc(q.title)}</h3><p class="muted">${q.questions.length} questions</p></div>
            <button class="small" data-host="${i}">Host this</button>
          </div>`).join("")}</div>
        <button class="ghost" id="edit">Create and edit quizzes</button>
      </section>`;
    $("#back").onclick = () => go(home);
    $("#edit").onclick = () => go(quizList);
    app.querySelectorAll("[data-host]").forEach((b) => b.onclick = () => go(() => hostScreen(list[+b.dataset.host])));
  }

  // ---------- Firebase ----------
  // Every device follows one game record in the Realtime Database. Times come
  // from Firebase's server clock, so countdowns and answer speed don't depend
  // on each phone's own clock.
  let fb = null;
  function firebaseReady() {
    const c = window.PINQUIZ_FIREBASE;
    return !!(c && c.apiKey && c.databaseURL);
  }
  function initFirebase() {
    if (fb) return fb;
    const app = firebase.initializeApp(window.PINQUIZ_FIREBASE);
    const auth = app.auth(), db = app.database();
    const emu = load("pinquiz.emulator", null); // local testing only
    if (emu) { auth.useEmulator(emu.auth); db.useEmulator(emu.dbHost, emu.dbPort); }
    let offset = 0;
    db.ref(".info/serverTimeOffset").on("value", (s) => { offset = s.val() || 0; });
    const signedIn = new Promise((resolve, reject) => {
      const stop = auth.onAuthStateChanged((u) => { if (u) { stop(); resolve(u); } });
      if (!auth.currentUser) auth.signInAnonymously().catch(reject);
    });
    fb = { auth, db, signedIn, now: () => Date.now() + offset, TS: firebase.database.ServerValue.TIMESTAMP };
    return fb;
  }
  function fbError(err) {
    const code = (err && err.code) || "";
    if (code.includes("admin-restricted-operation") || code.includes("operation-not-allowed")) return "Anonymous sign-in is turned off for this Firebase project. Turn it on under Authentication → Sign-in method.";
    if (code.includes("network")) return "Couldn't reach Firebase. Check your internet connection.";
    return (err && err.message) || "Something went wrong talking to Firebase.";
  }
  const nickKey = (n) => n.toLowerCase();

  function scorePoints(elapsedMs, timeS) {
    // Faster correct answers earn more: full marks instantly, half at the buzzer.
    const frac = Math.min(1, Math.max(0, elapsedMs) / (timeS * 1000));
    return Math.round(MAX_POINTS * (1 - frac / 2));
  }
  function rankOf(players, scores) {
    return Object.keys(players || {})
      .map((uid) => ({ uid, nick: players[uid].nick, score: (scores && scores[uid] && scores[uid].score) || 0, streak: (scores && scores[uid] && scores[uid].streak) || 0 }))
      .sort((a, b) => b.score - a.score || a.nick.localeCompare(b.nick));
  }

  function setupNeeded() {
    errorScreen("Firebase isn't set up yet", "Paste your Firebase web app config into firebase-config.js, then reload this page. The README walks through it.");
  }

  function errorScreen(title, msg, retry) {
    app.innerHTML = `<section class="stack narrow center home"><h2>${esc(title)}</h2><p class="muted">${esc(msg)}</p>
      ${retry ? '<button id="retry">Try again</button>' : ""}<button class="ghost" id="back">Back</button></section>`;
    if (retry) $("#retry").onclick = () => go(retry);
    $("#back").onclick = () => go(home);
  }

  // ---------- host ----------
  // resume: a PIN this browser was already hosting (after a refresh).
  async function hostScreen(quiz, resume) {
    if (!firebaseReady()) return setupNeeded();
    const { db, signedIn, now, TS } = initFirebase();
    let dead = false, tick = null, pin = resume || null, uid = null;
    let game = null, secret = null, lastBoard = [], revealing = false;
    const subs = [];
    cleanup = () => { dead = true; clearInterval(tick); subs.forEach((f) => f()); };
    app.innerHTML = `<section class="stack center home"><h2>Setting up your game…</h2></section>`;

    try {
      uid = (await signedIn).uid;
      if (resume) {
        const [g, s] = await Promise.all([db.ref("games/" + pin).get(), db.ref("secrets/" + pin).get()]);
        if (!g.exists() || g.val().hostUid !== uid || !s.exists()) { save(STORE_HOSTING, null); return errorScreen("That game has ended", "Start a new one from the home screen."); }
        quiz = { title: g.val().quiz.title, questions: g.val().quiz.questions.map((q, i) => Object.assign({}, q, { correct: s.val().correct[i] })) };
      } else {
        const pub = { title: quiz.title, questions: quiz.questions.map((q) => ({ text: q.text, options: q.options, time: q.time })) };
        for (let tries = 0; ; tries++) {
          pin = String(Math.floor(100000 + Math.random() * 900000));
          try {
            await db.ref("games/" + pin).set({ hostUid: uid, createdAt: TS, quiz: pub, state: { phase: "lobby" } });
            break;
          } catch (e) { if (tries > 5 || !String(e.code || e.message).toLowerCase().includes("permission")) throw e; }
        }
        await db.ref("secrets/" + pin).set({ correct: quiz.questions.map((q) => q.correct) });
      }
    } catch (e) {
      return errorScreen("Couldn't start the game", fbError(e), () => hostScreen(quiz, resume));
    }
    if (dead) return;
    save(STORE_HOSTING, { pin });

    const gref = db.ref("games/" + pin);
    const onVal = (ref, fn) => { const cb = ref.on("value", (s) => { if (!dead) fn(s.val()); }); subs.push(() => ref.off("value", cb)); };
    game = { state: { phase: "lobby" }, players: {}, presence: {}, scores: {}, answers: {} };
    onVal(gref.child("state"), (v) => { game.state = v || { phase: "lobby" }; render(); });
    onVal(gref.child("players"), (v) => { game.players = v || {}; render(); });
    onVal(gref.child("presence"), (v) => { game.presence = v || {}; render(); });
    onVal(gref.child("scores"), (v) => { game.scores = v || {}; });
    onVal(gref.child("answers"), (v) => { game.answers = v || {}; maybeReveal(); render(); });

    const st = () => game.state;
    const q = () => quiz.questions[st().q];
    const endsAt = () => st().startAt + st().time * 1000;
    const online = () => Object.keys(game.players).filter((id) => game.presence[id]);
    const answersNow = () => (st().qk && game.answers[st().qk]) || {};

    function startQuestion(i) {
      gref.child("state").set({ phase: "question", q: i, qk: "q" + i, startAt: TS, time: quiz.questions[i].time });
    }

    function maybeReveal() {
      if (st().phase !== "question" || typeof st().startAt !== "number" || revealing) return;
      const ans = answersNow();
      const everyone = online().length > 0 && online().every((id) => ans[id]);
      // 1.5 s grace after the buzzer so answers already in flight still land.
      if (everyone || now() > endsAt() + 1500) reveal();
    }

    async function reveal() {
      if (st().phase !== "question" || revealing) return;
      revealing = true;
      try { await scoreQuestion(); } catch (e) { toast(fbError(e)); } finally { revealing = false; }
    }

    async function scoreQuestion() {
      const s = st(), qq = q(), correct = qq.correct;
      const ans = (await gref.child("answers/" + s.qk).get()).val() || {};
      lastBoard = rankOf(game.players, game.scores).map((p) => p.uid);
      const counts = qq.options.map((_, i) => Object.values(ans).filter((a) => a.c === i).length);
      const upd = {};
      Object.keys(game.players).forEach((id) => {
        const prev = game.scores[id] || { score: 0, streak: 0 };
        const a = ans[id];
        const ok = !!a && a.c === correct;
        let gained = 0, streak = 0;
        if (ok) {
          streak = (prev.streak || 0) + 1;
          gained = scorePoints(a.at - s.startAt, s.time);
          if (streak >= 2) gained += Math.min(500, (streak - 1) * 100);
        }
        upd["scores/" + id] = { score: (prev.score || 0) + gained, streak, last: { q: s.q, correct: ok, gained, answered: !!a } };
      });
      upd.state = Object.assign({}, s, { phase: "reveal", correct, counts });
      await gref.update(upd);
    }

    function next() {
      const s = st();
      if (s.phase === "reveal") return gref.child("state/phase").set("board");
      if (s.q + 1 < quiz.questions.length) startQuestion(s.q + 1);
      else gref.child("state").set(Object.assign({}, s, { phase: "end" }));
    }

    async function endGame() {
      save(STORE_HOSTING, null);
      try { await db.ref("secrets/" + pin).remove(); await gref.remove(); } catch {}
      go(home);
    }

    function drawTimer() {
      const el = $("#timer");
      if (!el || st().phase !== "question" || typeof st().startAt !== "number") return;
      const left = Math.max(0, endsAt() - now());
      el.style.setProperty("--p", (100 * left / (st().time * 1000)) + "%");
      el.firstElementChild.textContent = Math.ceil(left / 1000);
    }

    let drawn = "";
    function render() {
      if (dead) return;
      const s = st(), list = rankOf(game.players, game.scores);
      clearInterval(tick);
      if (s.phase === "lobby") {
        const url = joinUrl(pin);
        const key = "lobby" + list.map((p) => p.uid + (game.presence[p.uid] ? 1 : 0)).join();
        if (drawn === key) return;
        drawn = key;
        app.innerHTML = `
          <section class="stack" style="flex:1">
            <div class="row"><button class="ghost small" id="quit">End game</button><div class="spacer"></div><span class="label">${esc(quiz.title)}</span></div>
            <div class="pinbar">
              <div class="stack" style="gap:4px"><span class="label">Join at</span><span class="joinurl">${esc(location.host + location.pathname)}</span></div>
              <div class="stack" style="gap:4px"><span class="label">Game PIN</span><span class="pinval">${pin.slice(0, 3)} ${pin.slice(3)}</span></div>
              <div class="qr" id="qr" title="${esc(url)}"></div>
            </div>
            <div class="row"><h3>${list.length} ${list.length === 1 ? "player" : "players"}</h3><div class="spacer"></div>
              <button class="ghost small" id="copy">Copy join link</button>
              <button id="start" ${list.length ? "" : "disabled"}>Start game</button></div>
            <div class="players">${list.length ? list.map((p) => `<span class="chip" style="${game.presence[p.uid] ? "" : "opacity:.45"}">${esc(p.nick)}</span>`).join("") : '<p class="muted">Waiting for players to join…</p>'}</div>
          </section>`;
        try {
          const qr = qrcode(0, "M");
          qr.addData(url);
          qr.make();
          $("#qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
        } catch { $("#qr").remove(); }
        $("#start").onclick = () => startQuestion(0);
        $("#copy").onclick = () => navigator.clipboard.writeText(url).then(() => toast("Join link copied"), () => toast(url));
        $("#quit").onclick = endGame;
        return;
      }
      drawn = "";
      const qq = q();
      if (s.phase === "question") {
        const n = Object.keys(answersNow()).length;
        app.innerHTML = `
          <section class="stack" style="flex:1">
            <div class="qhead">
              <div class="timer" id="timer"><span>${qq.time}</span></div>
              <div class="stack grow" style="gap:2px"><span class="label">Question ${s.q + 1} of ${quiz.questions.length}</span></div>
              <div class="stack center stats" style="gap:0"><span class="big" style="font-size:2.4rem">${n}<span class="muted" style="font-size:1.2rem">/${online().length}</span></span><span class="label">answered</span></div>
              <button class="ghost small" id="skip">Skip timer</button>
            </div>
            <div class="qtext">${esc(qq.text)}</div>
            <div class="answers">${qq.options.map((o, i) => `<div class="ans c${i}">${SHAPES[i]}<span class="txt">${esc(o)}</span></div>`).join("")}</div>
          </section>`;
        drawTimer();
        tick = setInterval(() => { drawTimer(); maybeReveal(); }, 200);
        $("#skip").onclick = reveal;
      } else if (s.phase === "reveal") {
        const counts = s.counts || qq.options.map(() => 0);
        const max = Math.max(1, ...counts);
        app.innerHTML = `
          <section class="stack" style="flex:1">
            <div class="row"><span class="label">Question ${s.q + 1} of ${quiz.questions.length}</span><div class="spacer"></div><button id="next">Next</button></div>
            <div class="qtext">${esc(qq.text)}</div>
            <div class="bars" style="grid-template-columns:repeat(${qq.options.length},1fr)">${counts.map((n, i) => `
              <div class="bar"><span class="n">${n}</span><div class="fill" style="height:${(n / max) * 80}%;background:var(--a${i});opacity:${i === s.correct ? 1 : .35}"></div></div>`).join("")}</div>
            <div class="answers">${qq.options.map((o, i) => `<div class="ans c${i} ${i === s.correct ? "" : "dim"}">${SHAPES[i]}<span class="txt">${esc(o)}</span>${i === s.correct ? '<span class="count">✓</span>' : ""}</div>`).join("")}</div>
          </section>`;
        $("#next").onclick = next;
      } else if (s.phase === "board") {
        const last = s.q + 1 >= quiz.questions.length;
        app.innerHTML = `
          <section class="stack narrow" style="max-width:720px;flex:1">
            <div class="row"><h2>Scoreboard</h2><div class="spacer"></div><button id="next">${last ? "Show winners" : "Next question"}</button></div>
            <div class="board">${list.slice(0, 5).map((p, i) => {
              const was = lastBoard.indexOf(p.uid);
              const moved = was > i ? ' <span style="color:var(--good)">▲</span>' : "";
              return `<div class="r"><span class="pos">${i + 1}</span><span>${esc(p.nick)}${moved}</span>${p.streak >= 2 ? `<span class="muted" style="font-size:.9rem">streak ${p.streak}</span>` : ""}<span class="pts">${p.score}</span></div>`;
            }).join("")}</div>
          </section>`;
        $("#next").onclick = next;
      } else if (s.phase === "end") {
        save(STORE_HOSTING, null);
        const [a, b, c] = list;
        const step = (p, cls, place) => `<div class="step ${cls}"><span class="label" style="${cls === "p1" ? "color:var(--ink)" : ""}">${place}</span><b>${p ? esc(p.nick) : "—"}</b><span>${p ? p.score : ""}</span></div>`;
        app.innerHTML = `
          <section class="stack center" style="flex:1;justify-content:center">
            <h1>Winners</h1>
            <div class="podium">${step(b, "p2", "2nd")}${step(a, "p1", "1st")}${step(c, "p3", "3rd")}</div>
            <div class="row center"><button id="again">Play again</button><button class="ghost" id="home">Home</button></div>
          </section>`;
        $("#again").onclick = () => go(() => hostScreen(quiz));
        $("#home").onclick = () => go(home);
      }
    }
    render();
  }

  // ---------- player ----------
  async function playerScreen(pin, nick) {
    if (!firebaseReady()) return setupNeeded();
    const { db, signedIn, now, TS } = initFirebase();
    let dead = false, tick = null, uid = null;
    const subs = [];
    cleanup = () => { dead = true; clearInterval(tick); subs.forEach((f) => f()); };
    app.innerHTML = `<section class="stack center home"><h2>Joining game ${esc(pin)}…</h2><button class="ghost" id="back">Cancel</button></section>`;
    $("#back").onclick = () => go(home);

    const gref = db.ref("games/" + pin);
    try {
      uid = (await signedIn).uid;
      const g = await gref.get();
      if (!g.exists()) return errorScreen("Can't join", `No game found with PIN ${pin}. Check the number on the host's screen.`);
      const me = g.child("players/" + uid).val();
      if (me) {
        nick = me.nick; // rejoining after a refresh or lost connection
      } else {
        if (g.child("state/phase").val() !== "lobby") return errorScreen("Can't join", "This game has already started.");
        if (Object.keys(g.child("players").val() || {}).length >= 100) return errorScreen("Can't join", "This game is full.");
        if (g.child("nicks/" + nickKey(nick)).exists()) return errorScreen("Nickname taken", "Someone in this game already uses that nickname. Go back and pick another.");
        await gref.update({ ["nicks/" + nickKey(nick)]: uid, ["players/" + uid]: { nick, key: nickKey(nick), joinedAt: TS } });
      }
    } catch (e) {
      const denied = String((e && (e.code || e.message)) || "").toLowerCase().includes("permission");
      return errorScreen("Can't join", denied ? "That nickname was just taken, or the game started. Try another nickname." : fbError(e), denied ? null : () => playerScreen(pin, nick));
    }
    if (dead) return;
    save(STORE_PLAYER, Object.assign(load(STORE_PLAYER, {}), { nick, pin }));

    // Presence: Firebase removes this flag by itself if the phone drops off.
    const conRef = db.ref(".info/connected");
    const conCb = conRef.on("value", (s) => {
      if (s.val() !== true || dead) return;
      const p = gref.child("presence/" + uid);
      p.onDisconnect().remove().then(() => p.set(true)).catch(() => {});
    });
    subs.push(() => { conRef.off("value", conCb); gref.child("presence/" + uid).remove().catch(() => {}); });

    const game = { quiz: null, state: null, players: {}, scores: {}, answers: {}, gone: false };
    let picked = null, tooLate = false;
    const onVal = (ref, fn) => { const cb = ref.on("value", (s) => { if (!dead) fn(s.val()); }); subs.push(() => ref.off("value", cb)); };
    onVal(gref.child("quiz"), (v) => { if (v) game.quiz = v; render(); });
    onVal(gref.child("state"), (v) => {
      if (!v) { game.gone = true; return render(); }
      if (!game.state || v.qk !== game.state.qk) { picked = null; tooLate = false; }
      game.state = v;
      render();
    });
    onVal(gref.child("players"), (v) => { game.players = v || {}; render(); });
    onVal(gref.child("scores"), (v) => { game.scores = v || {}; render(); });
    onVal(gref.child("answers"), (v) => { game.answers = v || {}; render(); });

    function answer(c) {
      const s = game.state;
      if (!s || s.phase !== "question" || picked !== null) return;
      picked = c;
      render();
      gref.child("answers/" + s.qk + "/" + uid).set({ c, at: TS }).catch(() => { tooLate = true; render(); });
    }

    function header(s, you) {
      const total = game.quiz ? game.quiz.questions.length : 0;
      return `<div class="row"><b>${esc(nick)}</b><div class="spacer"></div>${s.phase !== "lobby" && total ? `<span class="label">Q ${s.q + 1}/${total}</span>` : ""}<span class="label" style="color:var(--fg)">${you ? you.score : 0} pts</span></div>`;
    }

    function render() {
      if (dead) return;
      clearInterval(tick);
      if (game.gone) return errorScreen("Game over", "The host ended this game.");
      const s = game.state;
      if (!s || !game.quiz) return;
      const order = rankOf(game.players, game.scores);
      const rank = order.findIndex((p) => p.uid === uid) + 1;
      const you = order[rank - 1];
      const mine = game.scores[uid] || {};
      if (s.phase === "lobby") {
        app.innerHTML = `<section class="stack center home"><span class="label">You're in</span><h1>${esc(nick)}</h1><p class="muted">${esc(game.quiz.title)}</p>
          <p>${order.length} ${order.length === 1 ? "player" : "players"} here. The game starts soon.</p>
          <div class="players">${order.map((p) => `<span class="chip" style="${p.uid === uid ? "background:var(--spot);color:var(--ink)" : ""}">${esc(p.nick)}</span>`).join("")}</div></section>`;
      } else if (s.phase === "question") {
        const q = game.quiz.questions[s.q];
        const answeredByMe = picked !== null || !!(game.answers[s.qk] && game.answers[s.qk][uid]);
        const n = Object.keys(game.answers[s.qk] || {}).length;
        const left = () => typeof s.startAt === "number" ? Math.max(0, Math.ceil((s.startAt + s.time * 1000 - now()) / 1000)) : s.time;
        if (tooLate) {
          app.innerHTML = `${header(s, you)}<section class="stack center home"><h2>Too late</h2><p class="muted">That answer arrived after time ran out.</p></section>`;
        } else if (answeredByMe) {
          app.innerHTML = `${header(s, you)}<section class="stack center home"><h2>Answer locked in</h2><p class="muted">${n} of ${order.length} have answered…</p></section>`;
        } else {
          app.innerHTML = `${header(s, you)}
            <p class="stack" style="font-weight:700;font-size:1.15rem;margin-block:12px">${esc(q.text)} <span class="muted" id="left" style="font-size:.9rem">${left()}s left · ${n} answered</span></p>
            <div class="pad" style="${q.options.length === 2 ? "grid-template-columns:1fr" : ""}">${q.options.map((o, i) => `<button class="c${i}" data-c="${i}" aria-label="${esc(o)}">${SHAPES[i]}<span>${esc(o)}</span></button>`).join("")}</div>`;
          app.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => answer(+b.dataset.c));
          tick = setInterval(() => { const el = $("#left"); if (el) el.textContent = `${left()}s left · ${n} answered`; }, 250);
        }
      } else if (s.phase === "reveal" || s.phase === "board") {
        const q = game.quiz.questions[s.q];
        const l = mine.last && mine.last.q === s.q ? mine.last : { correct: false, gained: 0, answered: false };
        const ahead = rank > 1 ? order[rank - 2] : null;
        app.innerHTML = `${header(s, you)}
          <section class="stack center feedback ${l.correct ? "ok" : "no"}" style="margin-top:12px">
            <h2>${l.correct ? "Correct" : l.answered ? "Not quite" : "Time's up"}</h2>
            <span class="big">${l.correct ? "+" + l.gained : "+0"}</span>
            ${l.correct && mine.streak >= 2 ? `<p>Answer streak: ${mine.streak}</p>` : ""}
            ${l.correct ? "" : `<p>The answer was <b>${esc(q.options[s.correct])}</b></p>`}
            <p class="muted">You're ${ordinal(rank)} of ${order.length}${ahead ? `, ${ahead.score - you.score} points behind ${esc(ahead.nick)}` : ""}</p>
          </section>`;
      } else if (s.phase === "end") {
        app.innerHTML = `<section class="stack center home">
            <span class="label">Final result</span>
            <h1>${ordinal(rank)} place</h1>
            <p class="big" style="font-size:2rem">${you ? you.score : 0} points</p>
            <div class="board narrow">${order.slice(0, 3).map((p, i) => `<div class="r"><span class="pos">${i + 1}</span><span>${esc(p.nick)}</span><span class="pts">${p.score}</span></div>`).join("")}</div>
            <button id="home">Done</button>
          </section>`;
        $("#home").onclick = () => { save(STORE_PLAYER, Object.assign(load(STORE_PLAYER, {}), { pin: null })); go(home); };
      }
    }
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  home();
})();
