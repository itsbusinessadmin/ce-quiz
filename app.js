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

  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const TYPES = { quiz: "Quiz", tf: "True or false" };
  const TYPE_HINT = { quiz: "Up to 4 answers", tf: "Two answers" };
  const TYPE_ICON = {
    quiz: '<svg class="ticon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="9" height="9" rx="2" style="fill:var(--a0)"/><rect x="13" y="2" width="9" height="9" rx="2" style="fill:var(--a1)"/><rect x="2" y="13" width="9" height="9" rx="2" style="fill:var(--a2)"/><rect x="13" y="13" width="9" height="9" rx="2" style="fill:var(--a3)"/></svg>',
    tf: '<svg class="ticon" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="9" height="20" rx="2" style="fill:var(--a0)"/><rect x="13" y="2" width="9" height="20" rx="2" style="fill:var(--a1)"/></svg>',
  };
  const TIMES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240];
  const POINTS = [
    { v: 1, name: "Standard", hint: "Normal points for correct answers." },
    { v: 2, name: "Double points", hint: "Twice the points for correct answers." },
    { v: 0, name: "No points", hint: "A warm-up question that doesn't count." },
  ];
  function timeLabel(t) {
    const m = Math.floor(t / 60), s = t % 60;
    if (!m) return t + " seconds";
    return m + (m === 1 ? " minute" : " minutes") + (s ? " " + s + " seconds" : "");
  }
  // Quizzes saved before multi-select store `correct` as one index.
  const corrects = (q) => [].concat(q.correct);
  const validImage = (s) => typeof s === "string" && /^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(s);

  function newQuestion(type) {
    return { type, text: "", options: type === "tf" ? ["True", "False"] : ["", "", "", ""], correct: [0], time: 20, points: 1, multi: false, image: "", media: null };
  }
  function editable(q) {
    const type = q.type === "tf" ? "tf" : "quiz";
    const options = q.options.slice();
    while (type === "quiz" && options.length < 4) options.push("");
    return {
      type, text: q.text || "", options, correct: corrects(q).slice(),
      time: TIMES.includes(q.time) ? q.time : 20,
      points: [0, 1, 2].includes(q.points) ? q.points : 1,
      multi: type === "quiz" && !!q.multi,
      image: validImage(q.image) ? q.image : "",
      media: validMedia(q.media) ? { id: q.media.id, kind: q.media.kind, name: String(q.media.name || "").slice(0, 80) } : null,
    };
  }
  // The cover is what the big screen shows while players join.
  function editableCover(c) {
    c = c || {};
    return {
      media: validMedia(c.media) && c.media.kind === "image" ? { id: c.media.id, kind: "image", name: String(c.media.name || "").slice(0, 80) } : null,
    };
  }
  function problem(x) {
    if (!x.text.trim()) return "Add the question text.";
    if (x.options.filter((o) => o.trim()).length < 2) return "Add at least 2 answers.";
    if (!x.correct.some((c) => (x.options[c] || "").trim())) return "Mark a correct answer.";
    return "";
  }
  // Pictures, GIFs, video and audio live in IndexedDB (localStorage is far too
  // small for them); a question keeps only { id, kind, name }. Quizzes saved
  // before this kept a picture inline as a data URL in `image`.
  const MEDIA_KINDS = ["image", "video", "audio"];
  const MAX_MEDIA_MB = 50;
  const validMedia = (m) => !!m && typeof m.id === "string" && MEDIA_KINDS.includes(m.kind);
  function mediaKind(file) {
    const kind = (file.type || "").split("/")[0];
    if (MEDIA_KINDS.includes(kind)) return kind;
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    return { mp3: "audio", m4a: "audio", wav: "audio", ogg: "audio", mp4: "video", webm: "video", mov: "video", gif: "image" }[ext] || "";
  }
  const mediaDb = (() => {
    let opened = null;
    const open = () => opened || (opened = new Promise((resolve, reject) => {
      const r = indexedDB.open("pinquiz", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("media");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => { opened = null; reject(r.error); };
    }));
    const run = (mode, fn) => open().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction("media", mode), req = fn(tx.objectStore("media"));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = tx.onabort = () => reject(tx.error);
    }));
    return {
      get: (id) => run("readonly", (st) => st.get(id)),
      put: (id, blob) => run("readwrite", (st) => st.put(blob, id)),
      del: (id) => run("readwrite", (st) => st.delete(id)),
      keys: () => run("readonly", (st) => st.getAllKeys()),
    };
  })();
  // Object URLs for stored media, made once per screen and revoked on leaving it.
  const mediaUrls = new Map();
  function loadMedia(id) {
    let e = mediaUrls.get(id);
    if (!e) {
      e = { url: undefined };
      e.ready = mediaDb.get(id).catch(() => null).then((blob) => (e.url = blob ? URL.createObjectURL(blob) : null));
      mediaUrls.set(id, e);
    }
    return e;
  }
  function dropMediaUrls() {
    mediaUrls.forEach((e) => { if (e.url) URL.revokeObjectURL(e.url); });
    mediaUrls.clear();
  }
  // Where a question's media plays from, or null: { kind, url, name }.
  async function mediaSource(q) {
    if (validMedia(q.media)) {
      const url = await loadMedia(q.media.id).ready;
      return url ? { kind: q.media.kind, url, name: q.media.name || "" } : null;
    }
    return validImage(q.image) ? { kind: "image", url: q.image, name: "" } : null;
  }
  function mediaTag(m, extra) {
    if (m.kind === "video") return `<video src="${esc(m.url)}" controls playsinline ${extra || 'preload="metadata"'}></video>`;
    if (m.kind === "audio") return `<div class="audio"><span class="note" aria-hidden="true">♪</span><b>${esc(m.name || "Audio")}</b><audio src="${esc(m.url)}" controls ${extra || 'preload="metadata"'}></audio></div>`;
    return `<img src="${esc(m.url)}" alt="">`;
  }
  // Deletes stored files no saved quiz uses any more.
  async function pruneMedia() {
    try {
      const used = new Set(getQuizzes().flatMap((q) => [q.cover, ...q.questions].map((x) => x && x.media && x.media.id)));
      await Promise.all((await mediaDb.keys()).filter((k) => !used.has(k)).map(mediaDb.del));
    } catch { /* nothing to tidy, or storage blocked */ }
  }
  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

  // Shrinks a picked picture so stored quizzes stay small.
  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error("not an image"));
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const k = Math.min(1, 960 / img.width, 540 / img.height);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * k));
        c.height = Math.max(1, Math.round(img.height * k));
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("unreadable image"))), "image/jpeg", 0.75);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable image")); };
      img.src = url;
    });
  }

  // ---------- small helpers ----------
  const app = document.getElementById("app");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (sel) => app.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; /* storage blocked or full */ }
  }
  function toast(msg) {
    document.querySelectorAll(".toast").forEach((old) => old.remove());
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  // admin.html hosts games and edits quizzes; the main page is for players only
  const ADMIN = document.body.dataset.mode === "admin";
  const playerPath = location.pathname.replace(/admin(\.html)?$/, "");
  function joinUrl(pin) {
    return location.origin + playerPath + "?pin=" + pin;
  }

  function getQuizzes() {
    const list = load(STORE_QUIZZES, []);
    // drop the old built-in example that earlier versions saved to the browser
    return Array.isArray(list) ? list.filter((q) => q && q.id !== "sample-space") : [];
  }
  function setQuizzes(list) { return save(STORE_QUIZZES, list); }

  function validQuiz(q) {
    return q && typeof q.title === "string" && Array.isArray(q.questions) && q.questions.length > 0 &&
      q.questions.every((x) => typeof x.text === "string" && Array.isArray(x.options) &&
        x.options.length >= 2 && x.options.length <= 4 && x.options.every((o) => typeof o === "string") &&
        corrects(x).length > 0 && corrects(x).every((c) => Number.isInteger(c) && c >= 0 && c < x.options.length));
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
          <p class="muted">${ADMIN ? "Admin: host games and manage your quizzes." : "Live quiz games for a room full of phones. Free, no accounts."}</p>
        </div>
        <div class="row center" id="resume"></div>
        <div class="narrow">
${ADMIN ? `          <div class="card stack">
            <h2>Host a game</h2>
            <button id="hostBtn">Host a game</button>
            <button class="ghost" id="editBtn">Create and edit quizzes</button>
          </div>` : `          <form class="card stack" id="joinForm">
            <h2>Join a game</h2>
            <label class="label" for="pinIn">Game PIN</label>
            <input id="pinIn" class="pin" inputmode="numeric" autocomplete="off" maxlength="6" placeholder="000000" required>
            <label class="label" for="nickIn">Nickname</label>
            <input id="nickIn" maxlength="16" autocomplete="nickname" placeholder="Your name" pattern="[A-Za-z0-9 _\\-]{1,16}" title="Letters, numbers, spaces, - and _" required>
            <button type="submit">Join</button>
          </form>`}
        </div>
      </section>`;
    if (ADMIN) {
      const hosting = load(STORE_HOSTING, null);
      if (hosting && hosting.pin) {
        $("#resume").innerHTML = `<button class="ghost small" id="resumeHost">Resume hosting game ${esc(hosting.pin)}</button>`;
        $("#resumeHost").onclick = () => go(() => hostScreen(null, hosting.pin));
      }
      $("#hostBtn").addEventListener("click", () => go(pickQuiz));
      $("#editBtn").addEventListener("click", () => go(quizList));
      return;
    }
    const params = new URLSearchParams(location.search);
    const me = load(STORE_PLAYER, {});
    if (params.get("pin")) $("#pinIn").value = params.get("pin").replace(/\D/g, "").slice(0, 6);
    if (me.nick) $("#nickIn").value = me.nick;
    ($("#pinIn").value ? $("#nickIn") : $("#pinIn")).focus();
    if (me.pin && me.nick && !params.get("pin")) {
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
        ${list.length ? "" : `<p class="muted">No quizzes yet. Create one or import a JSON file.</p>`}
        <div class="quizlist">${list.map((q, i) => `
          <div class="card item">
            <div class="grow" style="min-width:0"><h3>${esc(q.title)}</h3><p class="muted">${q.questions.length} questions</p></div>
            <button class="small ghost" data-edit="${i}">Edit</button>
            <button class="small ghost" data-exp="${i}">Export</button>
            <button class="small danger" data-del="${i}">Delete</button>
          </div>`).join("")}</div>
      </section>`;
    $("#back").onclick = () => go(home);
    $("#new").onclick = () => go(() => editor({ id: uid(), title: "", questions: [newQuestion("quiz")] }));
    app.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => go(() => editor(JSON.parse(JSON.stringify(list[+b.dataset.edit])))));
    app.querySelectorAll("[data-exp]").forEach((b) => b.onclick = async () => {
      // Stored media goes into the file as data URLs so the export stands alone.
      const q = JSON.parse(JSON.stringify(list[+b.dataset.exp]));
      for (const x of [q.cover, ...q.questions]) {
        if (!x) continue;
        if (!x.media) continue;
        const blob = await mediaDb.get(x.media.id).catch(() => null);
        if (blob) x.media = { kind: x.media.kind, name: x.media.name, data: await blobToDataUrl(blob) };
        else delete x.media;
      }
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
      setQuizzes(next);
      pruneMedia();
      go(quizList);
    });
    $("#imp").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const q = JSON.parse(await f.text());
        if (!validQuiz(q)) throw new Error();
        q.id = uid();
        for (const x of [q.cover, ...q.questions]) {
          if (!x) continue;
          const m = x.media, kind = m && typeof m.data === "string" && (m.data.match(/^data:(image|video|audio)\/[\w.+-]+;base64,/) || [])[1];
          if (!kind) { delete x.media; continue; }
          const id = uid();
          await mediaDb.put(id, await (await fetch(m.data)).blob());
          x.media = { id, kind, name: m.name };
        }
        q.cover = editableCover(q.cover);
        if (!q.cover.media) delete q.cover.media;
        q.questions = q.questions.map((x) => {
          const y = editable(x);
          return Object.assign(y, { options: x.options.slice(), correct: y.multi ? y.correct : y.correct[0], image: y.image || undefined, media: y.media || undefined });
        });
        setQuizzes([...getQuizzes(), q]);
        toast("Imported " + q.title);
        go(quizList);
      } catch { toast("That file isn't a PinQuiz quiz."); }
    };
  }

  // Three panes: the question list on the left, the question being edited in
  // the middle, and its settings on the right. Correct answers are kept as an
  // index array while editing and saved back as a number for single select.
  function editor(quiz) {
    quiz.questions = quiz.questions.map(editable);
    quiz.cover = editableCover(quiz.cover);
    // cur is the question being edited; -1 is the cover page.
    let cur = -1, dirty = false, adding = false, dragFrom = null, showProblems = false, pasteFile = null;
    const q = () => quiz.questions[cur];
    const touch = () => { dirty = true; };
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    const keys = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveQuiz(); } };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("keydown", keys);
    // Pasting a copied picture, GIF or file anywhere in the editor puts it on the
    // page being edited; pasted text still goes into whatever box has focus.
    const paste = (e) => {
      const item = [...((e.clipboardData && e.clipboardData.items) || [])].find((i) => i.kind === "file");
      const f = item && item.getAsFile();
      if (!f || !pasteFile) return;
      e.preventDefault();
      pasteFile(f);
    };
    document.addEventListener("paste", paste);
    app.classList.add("wide");
    cleanup = () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("keydown", keys); document.removeEventListener("paste", paste); app.classList.remove("wide"); dropMediaUrls(); };

    app.innerHTML = `
      <section class="ed">
        <header class="ed-top">
          <button class="ghost small" id="exit">← Exit</button>
          <input id="title" class="ed-title" maxlength="80" placeholder="Quiz title" aria-label="Quiz title" value="${esc(quiz.title)}">
          <div class="spacer"></div>
          <button class="small" id="saveBtn">Save quiz</button>
        </header>
        <aside class="ed-rail" aria-label="Questions">
          <ol class="slides" id="slides"></ol>
          <div class="adder" id="adder"></div>
        </aside>
        <div class="ed-canvas" id="canvas"></div>
        <aside class="ed-props" id="props" aria-label="Question settings"></aside>
      </section>`;

    function drawSlides() {
      const cm = quiz.cover.media && loadMedia(quiz.cover.media.id);
      if (cm && cm.url === undefined) cm.ready.then(drawSlides);
      $("#slides").innerHTML = `
        <li class="slide cover${cur === -1 ? " on" : ""}">
          <span class="num"></span>
          <button class="thumb" data-pick="-1" ${cur === -1 ? 'aria-current="true"' : ""}>
            <span class="t-type"><span>Cover</span></span>
            ${cm && cm.url ? `<img class="t-img" src="${esc(cm.url)}" alt="">` : ""}
            <span class="t-text">${quiz.title.trim() ? esc(quiz.title) : '<span class="muted">Untitled quiz</span>'}</span>
          </button>
        </li>` + quiz.questions.map((x, i) => `
        <li class="slide${i === cur ? " on" : ""}${showProblems && problem(x) ? " bad" : ""}" draggable="true" data-i="${i}">
          <span class="num">${i + 1}</span>
          <button class="thumb" data-pick="${i}" ${i === cur ? 'aria-current="true"' : ""} title="${esc(showProblems ? problem(x) : "")}">
            <span class="t-type"><span>${TYPES[x.type]}</span><span>${x.time}s</span></span>
            <span class="t-text">${x.text.trim() ? esc(x.text) : '<span class="muted">No question yet</span>'}</span>
            <span class="t-opts">${x.options.map((o, oi) => `<i class="c${oi}${x.correct.includes(oi) ? " ok" : ""}${o.trim() ? "" : " empty"}"></i>`).join("")}</span>
          </button>
        </li>`).join("");
      app.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => select(+b.dataset.pick));
      app.querySelectorAll(".slide[data-i]").forEach((li) => {
        li.ondragstart = (e) => { dragFrom = +li.dataset.i; e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", ""); };
        li.ondragover = (e) => { if (dragFrom === null) return; e.preventDefault(); li.classList.add("over"); };
        li.ondragleave = () => li.classList.remove("over");
        li.ondrop = (e) => { e.preventDefault(); const from = dragFrom; dragFrom = null; move(from, +li.dataset.i); };
        li.ondragend = () => { dragFrom = null; };
      });
    }

    function drawAdder() {
      $("#adder").innerHTML = adding ? `
        <span class="label">Add a question</span>
        ${Object.keys(TYPES).map((t) => `<button class="typebtn" data-add="${t}">${TYPE_ICON[t]}<span><b>${TYPES[t]}</b><small>${TYPE_HINT[t]}</small></span></button>`).join("")}
        <button class="ghost small" id="addCancel">Cancel</button>` : `<button class="small" id="addBtn">+ Add question</button>`;
      if (adding) {
        app.querySelectorAll("[data-add]").forEach((b) => b.onclick = () => {
          quiz.questions.splice(cur + 1, 0, newQuestion(b.dataset.add));
          adding = false;
          touch();
          select(cur + 1);
          $("#qtext").focus();
        });
        $("#addCancel").onclick = () => { adding = false; drawAdder(); };
      } else {
        $("#addBtn").onclick = () => { adding = true; drawAdder(); };
      }
    }

    // The upload box for a question's media or the cover picture.
    // holder is the question (or cover) whose media / image it edits.
    function mediaBox(holder) {
      const pictureOnly = holder === quiz.cover;
      let shown = null;
      if (holder.media) {
        const e = loadMedia(holder.media.id);
        shown = { kind: holder.media.kind, url: e.url, name: holder.media.name };
        if (e.url === undefined) e.ready.then(() => { if (current() === holder) drawCanvas(); });
      } else if (holder.image) shown = { kind: "image", url: holder.image };
      return `
        <div class="media${shown ? " has " + shown.kind : ""}" id="media">${shown ? `
          ${shown.url === undefined ? '<span class="muted">Loading…</span>' : shown.url === null ? '<span class="muted">This file is missing from this browser. Replace it or remove it.</span>' : mediaTag(shown)}
          <div class="media-actions"><button class="small ghost" id="imgChange">Replace</button><button class="small danger" id="imgDel">Remove</button></div>` : `
          <button class="drop" id="imgAdd"><span class="plus" aria-hidden="true">+</span><b>${pictureOnly ? "Add a cover picture" : "Add media"}</b><span class="muted">Click to upload, drop a file here, or paste it (Ctrl+V / ⌘V)</span><span class="muted formats">${pictureOnly ? "Picture or GIF" : "Picture, GIF, MP3 or MP4"} · up to ${MAX_MEDIA_MB} MB</span></button>`}
          <input type="file" id="imgFile" accept="${pictureOnly ? "image/*,.gif" : "image/*,video/*,audio/*,.mp3,.mp4,.gif"}" hidden>
        </div>`;
    }
    function wireMedia(holder) {
      const pictureOnly = holder === quiz.cover;
      const file = $("#imgFile"), media = $("#media");
      const useFile = async (f) => {
        if (!f) return;
        const kind = mediaKind(f);
        if (!kind || (pictureOnly && kind !== "image")) return toast(pictureOnly ? "Use a picture or GIF for the cover." : "Use a picture, GIF, MP3 or MP4 file.");
        if (f.size > MAX_MEDIA_MB * 1024 * 1024) return toast(`That file is over ${MAX_MEDIA_MB} MB. Try a shorter or smaller one.`);
        let blob = f;
        // GIFs keep their animation; other pictures are shrunk.
        if (kind === "image" && f.type !== "image/gif" && !/\.gif$/i.test(f.name)) {
          try { blob = await shrinkImage(f); } catch { return toast("That picture couldn't be opened."); }
        }
        const id = uid();
        try { await mediaDb.put(id, blob); } catch { return toast("This browser is out of storage space for media."); }
        mediaUrls.set(id, { url: URL.createObjectURL(blob), ready: Promise.resolve() });
        holder.media = { id, kind, name: f.name.slice(0, 80) };
        holder.image = "";
        touch();
        if (current() === holder) drawCanvas();
        if (pictureOnly) drawSlides();
      };
      ["#imgAdd", "#imgChange"].forEach((id) => { if ($(id)) $(id).onclick = () => file.click(); });
      if ($("#imgDel")) $("#imgDel").onclick = () => { holder.image = ""; holder.media = null; touch(); drawCanvas(); if (pictureOnly) drawSlides(); };
      file.onchange = () => useFile(file.files[0]);
      pasteFile = useFile;
      media.ondragover = (e) => { if (dragFrom !== null) return; e.preventDefault(); media.classList.add("drag"); };
      media.ondragleave = () => media.classList.remove("drag");
      media.ondrop = (e) => { e.preventDefault(); media.classList.remove("drag"); useFile(e.dataTransfer.files[0]); };
    }
    function fitText(ta, onText) {
      const fit = () => { ta.style.height = "auto"; ta.style.height = ta.scrollHeight + "px"; };
      ta.oninput = () => { onText(ta.value); fit(); touch(); drawSlides(); };
      ta.onkeydown = (e) => { if (e.key === "Enter") e.preventDefault(); }; // one paragraph only
      fit();
    }

    function drawCover() {
      const c = quiz.cover;
      $("#canvas").innerHTML = `
        <p class="label center" style="display:block">Cover · shown on the big screen while players join</p>
        <textarea id="ctitle" class="ed-q" rows="1" maxlength="80" placeholder="Quiz title" aria-label="Quiz title">${esc(quiz.title)}</textarea>
        ${mediaBox(c)}`;
      fitText($("#ctitle"), (v) => { quiz.title = v; $("#title").value = v; });
      wireMedia(c);
    }

    function drawCanvas() {
      if (cur < 0) return drawCover();
      const x = q(), tf = x.type === "tf";
      $("#canvas").innerHTML = `
        <textarea id="qtext" class="ed-q" rows="1" maxlength="160" placeholder="Start typing your question" aria-label="Question text">${esc(x.text)}</textarea>
        ${mediaBox(x)}
        <div class="ed-answers">${x.options.map((o, oi) => {
          const ok = x.correct.includes(oi);
          return `<div class="tile c${oi}${ok ? " ok" : ""}${tf || o.trim() ? " filled" : ""}">
            <span class="tile-shape">${SHAPES[oi]}</span>
            ${tf ? `<span class="tile-fixed">${esc(o)}</span>` : `<input data-opt="${oi}" maxlength="80" placeholder="Add answer ${oi + 1}${oi > 1 ? " (optional)" : ""}" value="${esc(o)}" aria-label="Answer ${oi + 1}">`}
            <button class="mark${x.multi ? " multi" : ""}" data-mark="${oi}" aria-pressed="${ok}" aria-label="Answer ${oi + 1} is correct" title="${ok ? "Correct answer" : "Mark as correct"}">${CHECK}</button>
          </div>`;
        }).join("")}</div>
        <p class="muted hint">${x.multi ? "Tick every correct answer. Players score only if they pick all of them and nothing else." : "Click the circle on the correct answer."}</p>`;

      fitText($("#qtext"), (v) => { x.text = v; });
      app.querySelectorAll("[data-opt]").forEach((el) => el.oninput = () => {
        x.options[+el.dataset.opt] = el.value;
        el.closest(".tile").classList.toggle("filled", !!el.value.trim());
        touch();
        drawSlides();
      });
      app.querySelectorAll("[data-mark]").forEach((b) => b.onclick = () => {
        const oi = +b.dataset.mark;
        if (!x.multi) x.correct = [oi];
        else x.correct = x.correct.includes(oi) ? x.correct.filter((c) => c !== oi) : [...x.correct, oi].sort();
        touch();
        drawCanvas();
        drawSlides();
      });

      wireMedia(x);
    }

    function drawProps() {
      if (cur < 0) {
        $("#props").innerHTML = `
          <h3>Cover</h3>
          <p class="muted">The big screen shows this while players join, next to the game PIN and QR code.</p>
          <ul class="tips muted">
            <li>The quiz title is the heading.</li>
            <li>Add a picture or GIF, like a logo or a theme image.</li>
          </ul>
          <button class="ghost small" id="toFirst">Edit question 1 →</button>`;
        $("#toFirst").onclick = () => select(0);
        return;
      }
      const x = q(), tf = x.type === "tf", n = quiz.questions.length;
      const opt = (name, val, on, title, hint, off) => `
        <label class="opt${off ? " off" : ""}"><input type="radio" name="${name}" value="${val}" ${on ? "checked" : ""} ${off ? "disabled" : ""}>
          <span><b>${title}</b><small>${hint}</small></span></label>`;
      $("#props").innerHTML = `
        <div class="row"><h3>Question ${cur + 1}</h3><div class="spacer"></div><span class="muted">of ${n}</span></div>
        <fieldset class="field"><legend class="label">Question type</legend>
          <div class="typegrid">${Object.keys(TYPES).map((t) => `
            <label class="opt typeopt"><input type="radio" name="ptype" value="${t}" ${x.type === t ? "checked" : ""}>${TYPE_ICON[t]}<b>${TYPES[t]}</b></label>`).join("")}</div>
        </fieldset>
        <div class="field"><label class="label" for="ptime">Time limit</label>
          <select id="ptime">${TIMES.map((t) => `<option value="${t}" ${x.time === t ? "selected" : ""}>${timeLabel(t)}</option>`).join("")}</select>
          <button class="linkbtn" id="timeAll">Use this time for every question</button>
        </div>
        <fieldset class="field"><legend class="label">Points</legend>
          ${POINTS.map((p) => opt("ppts", p.v, x.points === p.v, p.name, p.hint)).join("")}
        </fieldset>
        <fieldset class="field"><legend class="label">Answer options</legend>
          ${opt("pmulti", 0, !x.multi, "Single select", "Players pick one answer.", tf)}
          ${opt("pmulti", 1, x.multi, "Multi-select", "Players can pick several answers, then submit.", tf)}
        </fieldset>
        <div class="props-foot">
          <button class="ghost small" id="up" ${cur === 0 ? "disabled" : ""} aria-label="Move question up" title="Move up">↑</button>
          <button class="ghost small" id="down" ${cur === n - 1 ? "disabled" : ""} aria-label="Move question down" title="Move down">↓</button>
          <button class="ghost small grow" id="dup">Duplicate</button>
          <button class="danger small grow" id="del" ${n < 2 ? "disabled" : ""}>Delete</button>
        </div>`;

      app.querySelectorAll("[name=ptype]").forEach((el) => el.onchange = () => {
        if (el.value === "tf") { x.keep = x.options; x.options = ["True", "False"]; x.multi = false; }
        else { x.options = x.keep || ["", "", "", ""]; }
        x.type = el.value;
        x.correct = [0];
        touch();
        drawAll();
      });
      $("#ptime").onchange = (e) => { x.time = +e.target.value; touch(); drawSlides(); };
      $("#timeAll").onclick = () => {
        quiz.questions.forEach((y) => { y.time = x.time; });
        touch();
        drawSlides();
        toast("Every question now has " + timeLabel(x.time));
      };
      app.querySelectorAll("[name=ppts]").forEach((el) => el.onchange = () => { x.points = +el.value; touch(); });
      app.querySelectorAll("[name=pmulti]").forEach((el) => el.onchange = () => {
        x.multi = el.value === "1";
        if (!x.multi) x.correct = x.correct.slice(0, 1);
        if (!x.correct.length) x.correct = [0];
        touch();
        drawCanvas();
        drawSlides();
      });
      $("#up").onclick = () => move(cur, cur - 1);
      $("#down").onclick = () => move(cur, cur + 1);
      $("#dup").onclick = () => {
        quiz.questions.splice(cur + 1, 0, JSON.parse(JSON.stringify(x)));
        touch();
        select(cur + 1);
      };
      $("#del").onclick = (e) => {
        const b = e.currentTarget;
        if (!b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Tap again"; return; }
        quiz.questions.splice(cur, 1);
        touch();
        select(Math.min(cur, quiz.questions.length - 1));
      };
    }

    function drawAll() { drawSlides(); drawAdder(); drawCanvas(); drawProps(); }
    const current = () => (cur < 0 ? quiz.cover : q());
    function select(i) { cur = i; drawAll(); }
    function move(from, to) {
      if (from === null || from === to || to < 0 || to >= quiz.questions.length) return drawSlides();
      const x = q();
      quiz.questions.splice(to, 0, quiz.questions.splice(from, 1)[0]);
      cur = quiz.questions.indexOf(x);
      touch();
      drawSlides();
      drawProps();
    }

    function saveQuiz() {
      const title = quiz.title.trim();
      if (!title) { select(-1); $("#ctitle").focus(); return toast("Give the quiz a title."); }
      const bad = quiz.questions.findIndex(problem);
      if (bad >= 0) {
        showProblems = true;
        select(bad);
        return toast(`Question ${bad + 1}: ${problem(quiz.questions[bad])}`);
      }
      const cover = {};
      if (quiz.cover.media) cover.media = quiz.cover.media;
      const out = { id: quiz.id, title, cover, questions: quiz.questions.map((x) => {
        // Keep slot order (colours stay put) but drop empty slots.
        const opts = x.options.map((o) => o.trim()), kept = [], at = [];
        opts.forEach((o, oi) => { if (o) { at[oi] = kept.length; kept.push(o); } });
        const correct = x.correct.filter((c) => opts[c]).map((c) => at[c]);
        const y = { type: x.type, text: x.text.trim(), options: kept, correct: x.multi ? correct : correct[0], time: x.time, points: x.points, multi: x.multi };
        if (x.media) y.media = x.media;
        else if (x.image) y.image = x.image;
        return y;
      }) };
      const list = getQuizzes();
      const at = list.findIndex((y) => y.id === out.id);
      if (at < 0) list.push(out); else list[at] = out;
      if (!setQuizzes(list)) return toast("This browser is out of storage space. Remove some images and try again.");
      dirty = false;
      pruneMedia();
      toast("Saved " + title);
      go(quizList);
    }

    $("#title").oninput = (e) => {
      quiz.title = e.target.value;
      touch();
      drawSlides();
      if (cur < 0) $("#ctitle").value = quiz.title;
    };
    $("#saveBtn").onclick = saveQuiz;
    $("#exit").onclick = (e) => {
      const b = e.currentTarget;
      if (dirty && !b.dataset.armed) { b.dataset.armed = "1"; b.textContent = "Discard changes?"; return; }
      dirty = false;
      go(quizList);
    };
    drawAll();
    if (!quiz.title) $("#ctitle").focus();
  }

  function pickQuiz() {
    const list = getQuizzes();
    app.innerHTML = `
      <section class="stack narrow" style="max-width:760px">
        <div class="row"><button class="ghost small" id="back">← Back</button></div>
        <h2>Pick a quiz to host</h2>
        ${list.length ? "" : `<p class="muted">No quizzes yet. Create one first.</p>`}
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
    let srcs = [], shown = null, coverSrc = null, peopleKey = null;
    cleanup = () => { dead = true; clearInterval(tick); subs.forEach((f) => f()); dropMediaUrls(); app.classList.remove("full"); };
    app.innerHTML = `<section class="stack center home"><h2>Setting up your game…</h2></section>`;

    try {
      uid = (await signedIn).uid;
      if (resume) {
        const [g, s] = await Promise.all([db.ref("games/" + pin).get(), db.ref("secrets/" + pin).get()]);
        if (!g.exists() || g.val().hostUid !== uid || !s.exists()) { save(STORE_HOSTING, null); return errorScreen("That game has ended", "Start a new one from the home screen."); }
        const media = s.val().media || [];
        quiz = { title: g.val().quiz.title, cover: { media: s.val().coverMedia || null }, questions: g.val().quiz.questions.map((q, i) => Object.assign({}, q, { correct: s.val().correct[i] },
          typeof media[i] === "string" ? { image: media[i] } : { media: media[i] || null })) };
      } else {
        const pub = { title: quiz.title, questions: quiz.questions.map((q) => ({ text: q.text, options: q.options, time: q.time, points: q.points ?? 1, multi: !!q.multi })) };
        for (let tries = 0; ; tries++) {
          pin = String(Math.floor(100000 + Math.random() * 900000));
          try {
            await db.ref("games/" + pin).set({ hostUid: uid, createdAt: TS, quiz: pub, state: { phase: "lobby" } });
            break;
          } catch (e) { if (tries > 5 || !String(e.code || e.message).toLowerCase().includes("permission")) throw e; }
        }
        // Only a reference to this browser's stored media, so a refresh can resume.
        const cm = quiz.cover && validMedia(quiz.cover.media) ? { id: quiz.cover.media.id, kind: "image", name: quiz.cover.media.name || "" } : null;
        await db.ref("secrets/" + pin).set({ correct: quiz.questions.map(corrects), coverMedia: cm, media: quiz.questions.map((q) => (validMedia(q.media) ? { id: q.media.id, kind: q.media.kind, name: q.media.name || "" } : q.image || "")) });
      }
    } catch (e) {
      return errorScreen("Couldn't start the game", fbError(e), () => hostScreen(quiz, resume));
    }
    [coverSrc, ...srcs] = await Promise.all([quiz.cover || {}, ...quiz.questions].map(mediaSource));
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
      const s = st(), qq = q(), correct = corrects(qq), pts = qq.points ?? 1;
      const ans = (await gref.child("answers/" + s.qk).get()).val() || {};
      lastBoard = rankOf(game.players, game.scores).map((p) => p.uid);
      // Multi-select answers arrive as a bitmask of the picked options.
      const want = qq.multi ? correct.reduce((m, i) => m | (1 << i), 0) : correct[0];
      const picked = (a, i) => (qq.multi ? (a.c >> i) & 1 : a.c === i);
      const counts = qq.options.map((_, i) => Object.values(ans).filter((a) => picked(a, i)).length);
      const upd = {};
      Object.keys(game.players).forEach((id) => {
        const prev = game.scores[id] || { score: 0, streak: 0 };
        const a = ans[id];
        const ok = !!a && a.c === want;
        let gained = 0, streak = 0;
        if (ok && !pts) {
          streak = prev.streak || 0; // a no-points question neither scores nor breaks a streak
        } else if (ok) {
          streak = (prev.streak || 0) + 1;
          gained = scorePoints(a.at - s.startAt, s.time) * pts;
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
        // Draw the lobby once; joins only refresh the participants list, so a GIF keeps playing.
        if (drawn !== "lobby") {
          drawn = "lobby";
          peopleKey = null;
          app.classList.add("full");
          app.innerHTML = `
            <section class="lobby">
              <div class="row"><div class="brand small"><b>PinQuiz</b><span class="dot"></span></div><div class="spacer"></div>
                <button class="ghost small" id="quit">End game</button><button id="start" disabled>Start game</button></div>
              <div class="lobby-grid">
                <aside class="lob-card lob-join">
                  <h3>Join</h3>
                  <div class="qr" id="qr" title="${esc(url)}"></div>
                  <div class="stack" style="gap:0"><span>Game PIN</span><span class="pinval">${pin.slice(0, 3)} ${pin.slice(3)}</span></div>
                  <p>Join at <b class="joinurl">${esc(location.host + playerPath)}</b></p>
                  <button class="ghost small" id="copy">Copy join link</button>
                </aside>
                <div class="lob-main">
                  <div class="lob-title">${esc(quiz.title)}</div>
                  ${coverSrc ? `<div class="lob-media">${mediaTag(coverSrc)}</div>` : ""}
                </div>
                <aside class="lob-card lob-people">
                  <div class="row" style="gap:10px"><h3>Participants</h3><span class="count" id="pcount">0</span></div>
                  <div class="plist" id="plist"></div>
                </aside>
              </div>
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
        }
        const key = list.map((p) => p.uid + (game.presence[p.uid] ? 1 : 0)).join();
        if (key === peopleKey) return;
        peopleKey = key;
        $("#pcount").textContent = list.length;
        $("#start").disabled = !list.length;
        $("#plist").innerHTML = list.length
          ? list.map((p) => `<span class="chip" style="${game.presence[p.uid] ? "" : "opacity:.45"}">${esc(p.nick)}</span>`).join("")
          : '<p class="muted">Waiting for participants…</p>';
        return;
      }
      drawn = "";
      app.classList.remove("full");
      const qq = q();
      if (s.phase === "question") {
        const n = Object.keys(answersNow()).length;
        app.innerHTML = `
          <section class="stack" style="flex:1">
            <div class="qhead">
              <div class="timer" id="timer"><span>${qq.time}</span></div>
              <div class="stack grow" style="gap:6px"><span class="label">Question ${s.q + 1} of ${quiz.questions.length}</span>${badges(qq)}</div>
              <div class="stack center stats" style="gap:0"><span class="big" style="font-size:2.4rem">${n}<span class="muted" style="font-size:1.2rem">/${online().length}</span></span><span class="label">answered</span></div>
              <button class="ghost small" id="skip">Skip timer</button>
            </div>
            <div class="qtext">${esc(qq.text)}</div>
            ${srcs[s.q] ? '<div class="qmedia" id="qmedia"></div>' : ""}
            <div class="answers">${qq.options.map((o, i) => `<div class="ans c${i}">${SHAPES[i]}<span class="txt">${esc(o)}</span></div>`).join("")}</div>
          </section>`;
        // The same element is moved into each redraw so video and audio keep playing.
        if (srcs[s.q]) {
          if (!shown || shown.q !== s.q) {
            const box = document.createElement("div");
            box.innerHTML = mediaTag(srcs[s.q], "autoplay");
            shown = { q: s.q, el: box.firstElementChild };
          }
          $("#qmedia").appendChild(shown.el);
        }
        drawTimer();
        tick = setInterval(() => { drawTimer(); maybeReveal(); }, 200);
        $("#skip").onclick = reveal;
      } else if (s.phase === "reveal") {
        const counts = s.counts || qq.options.map(() => 0);
        const max = Math.max(1, ...counts), right = corrects(s);
        app.innerHTML = `
          <section class="stack" style="flex:1">
            <div class="row"><span class="label">Question ${s.q + 1} of ${quiz.questions.length}</span><div class="spacer"></div><button id="next">Next</button></div>
            <div class="qtext">${esc(qq.text)}</div>
            <div class="bars" style="grid-template-columns:repeat(${qq.options.length},1fr)">${counts.map((n, i) => `
              <div class="bar"><span class="n">${n}</span><div class="fill" style="height:${(n / max) * 80}%;background:var(--a${i});opacity:${right.includes(i) ? 1 : .35}"></div></div>`).join("")}</div>
            <div class="answers">${qq.options.map((o, i) => `<div class="ans c${i} ${right.includes(i) ? "" : "dim"}">${SHAPES[i]}<span class="txt">${esc(o)}</span>${right.includes(i) ? '<span class="count">✓</span>' : ""}</div>`).join("")}</div>
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
    let picked = null, tooLate = false, sel = [];
    const onVal = (ref, fn) => { const cb = ref.on("value", (s) => { if (!dead) fn(s.val()); }); subs.push(() => ref.off("value", cb)); };
    onVal(gref.child("quiz"), (v) => { if (v) game.quiz = v; render(); });
    onVal(gref.child("state"), (v) => {
      if (!v) { game.gone = true; return render(); }
      if (!game.state || v.qk !== game.state.qk) { picked = null; tooLate = false; sel = []; }
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
            <div class="stack" style="gap:6px;margin-block:12px"><p style="font-weight:700;font-size:1.15rem">${esc(q.text)}</p>
              <div class="row" style="gap:8px">${badges(q)}<span class="muted" id="left" style="font-size:.9rem">${left()}s left · ${n} answered</span></div></div>
            <div class="pad" style="${q.options.length === 2 ? "grid-template-columns:1fr" : ""}">${q.options.map((o, i) => `<button class="c${i}${sel.includes(i) ? " on" : ""}" data-c="${i}" aria-label="${esc(o)}"${q.multi ? ` aria-pressed="${sel.includes(i)}"` : ""}>${SHAPES[i]}<span>${esc(o)}</span></button>`).join("")}</div>
            ${q.multi ? `<button id="submit" style="margin-top:12px" ${sel.length ? "" : "disabled"}>Submit ${sel.length ? sel.length + (sel.length === 1 ? " answer" : " answers") : ""}</button>` : ""}`;
          app.querySelectorAll("[data-c]").forEach((b) => b.onclick = () => {
            const c = +b.dataset.c;
            if (!q.multi) return answer(c);
            sel = sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c];
            render();
          });
          if (q.multi) $("#submit").onclick = () => answer(sel.reduce((m, i) => m | (1 << i), 0));
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
            ${l.correct ? "" : `<p>${corrects(s).length > 1 ? "The answers were" : "The answer was"} <b>${corrects(s).map((i) => esc(q.options[i])).join(", ")}</b></p>`}
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

  // Small tags under a live question for settings players should know about.
  function badges(q) {
    const tags = [];
    if (q.points === 2) tags.push("Double points");
    if (q.points === 0) tags.push("No points");
    if (q.multi) tags.push("Pick all that apply");
    return tags.map((t) => `<span class="badge">${t}</span>`).join("");
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  home();
})();
