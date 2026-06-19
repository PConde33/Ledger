/* ===========================================================
   Ledger — paper task manager
   A linear-calendar + hierarchical task list backed by a plain
   Markdown file (Obsidian-style). Single source of truth in
   memory; rendered to both the calendar and the dock so a tick
   anywhere syncs everywhere.
   =========================================================== */

(() => {
  "use strict";

  // ---------------------------------------------------------- State
  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  const now = new Date();
  const state = {
    projects: [],                 // [{id,title,tasks:[{id,title,done,date,slot}]}]  slot: "am"|"pm"|null
    settings: {},                 // persisted UI prefs (block widths), travels in the .md file
    year: now.getFullYear(),
    month: now.getMonth(),        // 0-11
  };

  const sizers = {};              // width controls, keyed by name (filled in setupUI)

  let nativeApi = null;           // pywebview bridge (window.pywebview.api)
  let nativeFilePath = null;      // path of the .md the desktop app is editing
  let dirty = false;
  let saveTimer = null;
  let firstCalRender = true;      // scroll today into view on initial paint

  const uid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : "id-" + Math.random().toString(36).slice(2));

  const isoDate = (y, m, d) =>
    `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  // ---------------------------------------------------------- Block size
  // Reusable width control for a strip of blocks: a CSS variable driven by a
  // slider and Ctrl+scroll. The chosen width is made permanent by the adjacent
  // "save" button, which writes it into the .md (see saveWidths / settings).
  function makeSizer(opts) {
    const { cssVar, def, min, max, sliderId, scrollEl } = opts;
    const root = document.documentElement;
    const cur = () => parseFloat(getComputedStyle(root).getPropertyValue(cssVar)) || def;
    const set = (px) => {
      px = Math.max(min, Math.min(max, Math.round(px)));
      root.style.setProperty(cssVar, px + "px");
      const s = document.getElementById(sliderId);
      if (s) { s.min = min; s.max = max; if (+s.value !== px) s.value = px; }
      return px;
    };
    set(def);
    const s = document.getElementById(sliderId);
    if (s) s.addEventListener("input", (e) => set(+e.target.value));
    if (scrollEl) scrollEl.addEventListener("wheel", (e) => {
      if (!e.ctrlKey) return;            // Ctrl + scroll = resize blocks
      e.preventDefault();
      set(cur() - Math.sign(e.deltaY) * 14);
    }, { passive: false });
    return { set, cur };
  }

  // Capture the current block widths into settings and persist them to the .md.
  function saveWidths(btn) {
    if (sizers.day)  state.settings.dayw  = sizers.day.cur();
    if (sizers.proj) state.settings.projw = sizers.proj.cur();
    markDirty();
    if (btn) {
      const was = btn.textContent;
      btn.textContent = "saved ✓";
      btn.classList.add("is-saved");
      setTimeout(() => { btn.textContent = was; btn.classList.remove("is-saved"); }, 1200);
    }
  }

  // Apply persisted width prefs (from the .md) to the live CSS vars + sliders.
  function applySettings() {
    if (sizers.day  && Number.isFinite(+state.settings.dayw))  sizers.day.set(+state.settings.dayw);
    if (sizers.proj && Number.isFinite(+state.settings.projw)) sizers.proj.set(+state.settings.projw);
  }

  // ---------------------------------------------------------- Markdown <-> state
  // Format (one project per heading, one task per checkbox line):
  //   # Project A
  //   - [ ] A.1 @2026-06-10
  //   - [x] A.2
  function toMarkdown() {
    const out = ["# Ledger", "", "<!-- Tasks for the Ledger app. Edit freely; @YYYY-MM-DD schedules a task (add /am or /pm for time of day). -->"];
    const cfg = settingsLine();
    if (cfg) out.push(cfg);
    out.push("");
    for (const p of state.projects) {
      out.push(`# ${p.title || "Untitled"}`);
      for (const t of p.tasks) {
        const box = t.done ? "x" : " ";
        const slot = t.date && t.slot ? `/${t.slot}` : "";
        const when = t.date ? ` @${t.date}${slot}` : "";
        out.push(`- [${box}] ${t.title}${when}`);
      }
      out.push("");
    }
    return out.join("\n");
  }

  // UI prefs ride along in the .md as an HTML comment (invisible when rendered).
  const SETTINGS_RE = /<!--\s*ledger:settings\s+([^>]*?)\s*-->/i;
  function settingsLine() {
    const pairs = Object.entries(state.settings)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${v}`);
    return pairs.length ? `<!-- ledger:settings ${pairs.join(" ")} -->` : "";
  }
  function parseSettings(text) {
    const m = text.match(SETTINGS_RE);
    const out = {};
    if (m) m[1].trim().split(/\s+/).forEach((pair) => {
      const i = pair.indexOf("=");
      if (i > 0) out[pair.slice(0, i)] = pair.slice(i + 1);
    });
    return out;
  }

  // Load a Markdown document into state: tasks + persisted settings, then apply them.
  function ingest(text) {
    state.projects = fromMarkdown(text || "");
    state.settings = parseSettings(text || "");
    applySettings();
  }

  function fromMarkdown(text) {
    const projects = [];
    let current = null;
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trimEnd();
      const head = line.match(/^#\s+(.*)$/);
      const task = line.match(/^\s*[-*]\s*\[( |x|X)\]\s*(.*)$/);
      if (task) {
        if (!current) { current = { id: uid(), title: "Tasks", tasks: [] }; projects.push(current); }
        let title = task[2].trim();
        let date = null, slot = null;
        const dm = title.match(/@(\d{4}-\d{2}-\d{2})(?:\/(am|pm))?/i);
        if (dm) { date = dm[1]; slot = dm[2] ? dm[2].toLowerCase() : null; title = title.replace(dm[0], "").trim(); }
        current.tasks.push({ id: uid(), title, done: task[1].toLowerCase() === "x", date, slot });
      } else if (head) {
        const title = head[1].trim();
        if (/^ledger$/i.test(title) && projects.length === 0 && !current) continue; // skip app title banner
        current = { id: uid(), title, tasks: [] };
        projects.push(current);
      }
    }
    return projects.filter((p) => p.title || p.tasks.length);
  }

  // ---------------------------------------------------------- Persistence
  // Ledger is a native desktop app (ledger.py / pywebview): every change is
  // written straight to the .md on disk through the Python file bridge.
  function markDirty() {
    dirty = true;
    updateFileState();
    clearTimeout(saveTimer);
    if (nativeApi) saveTimer = setTimeout(saveNative, 400);   // debounce disk writes
  }

  async function saveNative() {
    if (!nativeApi) return;
    try {
      const res = await nativeApi.save(toMarkdown());
      if (res && res.ok) { dirty = false; nativeFilePath = res.path; }
      updateFileState();
    } catch (err) {
      console.warn("Save failed:", err);
    }
  }

  // Open .md — pick a different Markdown file to edit (native file dialog).
  async function openFile() {
    if (!nativeApi) return;
    try {
      const res = await nativeApi.open_dialog();
      if (res && res.ok) {
        ingest(res.text || "");
        nativeFilePath = res.path;
        dirty = false;
        render();
      }
    } catch (err) { console.warn(err); }
  }

  // Save .md — flush the current file to disk now (changes also auto-save).
  async function saveFile() {
    if (!nativeApi) return;
    clearTimeout(saveTimer);
    await saveNative();
  }

  function updateFileState() {
    const el = $("#fileState");
    if (!nativeApi) {
      el.textContent = "run with: python3 ledger.py";
      el.className = "file-state is-dirty";
      return;
    }
    const name = nativeFilePath ? nativeFilePath.split("/").pop() : "tasks.md";
    el.textContent = (dirty ? "saving…" : "saved") + " · " + name;
    el.className = "file-state is-linked";
  }

  // ---------------------------------------------------------- Helpers
  const $ = (sel, root = document) => root.querySelector(sel);

  function findTask(id) {
    for (const p of state.projects) {
      const t = p.tasks.find((t) => t.id === id);
      if (t) return { project: p, task: t };
    }
    return null;
  }

  // ---------------------------------------------------------- Render: months
  function renderMonths() {
    const nav = $("#months");
    nav.innerHTML = "";
    MONTHS.forEach((name, i) => {
      const b = document.createElement("button");
      b.className = "month-tab" + (i === state.month ? " is-active" : "");
      b.textContent = name.slice(0, 3);
      // dot if any task is scheduled in this month
      const tag = `${state.year}-${String(i + 1).padStart(2, "0")}`;
      const has = state.projects.some((p) => p.tasks.some((t) => t.date && t.date.startsWith(tag)));
      if (has) { const d = document.createElement("span"); d.className = "dot"; b.appendChild(d); }
      b.onclick = () => { state.month = i; render(); };
      nav.appendChild(b);
    });
  }

  // ---------------------------------------------------------- Render: calendar
  function renderCalendar() {
    $("#calTitle").textContent = MONTHS[state.month];
    $("#yearLabel").textContent = state.year;

    const wrap = $("#days");
    const prevLeft = wrap.scrollLeft;
    const prevTop = wrap.scrollTop;
    wrap.innerHTML = "";

    const daysInMonth = new Date(state.year, state.month + 1, 0).getDate();
    const today = new Date();
    const todayIso = isoDate(today.getFullYear(), today.getMonth(), today.getDate());

    for (let d = 1; d <= daysInMonth; d++) {
      const dateIso = isoDate(state.year, state.month, d);
      const dow = new Date(state.year, state.month, d).getDay();

      const row = document.createElement("div");
      row.className = "day" + (dow === 0 || dow === 6 ? " is-weekend" : "") +
                      (dateIso === todayIso ? " is-today" : "");
      row.dataset.date = dateIso;
      row.setAttribute("role", "listitem");

      const date = document.createElement("div");
      date.className = "day__date";
      date.innerHTML = `<span class="day__num">${d}</span><span class="day__weekday">${WEEKDAYS[dow]}</span>`;

      // Morning / afternoon split. Morning holds am + unslotted tasks; afternoon holds pm.
      const halves = document.createElement("div");
      halves.className = "day__halves";
      const am = makeHalf(dateIso, "am", "Morning");
      const pm = makeHalf(dateIso, "pm", "Afternoon");

      state.projects.forEach((p) => {
        p.tasks.forEach((t) => {
          if (t.date !== dateIso) return;
          (t.slot === "pm" ? pm : am).slots.appendChild(makeChip(p, t));
        });
      });

      halves.append(am.el, pm.el);
      row.appendChild(date);
      row.appendChild(halves);

      // Coarse fallback: a drop anywhere else on the card still schedules the day,
      // keeping whatever slot the task already had.
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain");
        const found = findTask(id);
        if (found) { found.task.date = dateIso; markDirty(); render(); }
      });

      wrap.appendChild(row);
    }
    wrap.scrollLeft = prevLeft;
    wrap.scrollTop = prevTop;

    if (firstCalRender) {
      firstCalRender = false;
      const todayCard = wrap.querySelector(".day.is-today");
      if (todayCard) {
        const target = todayCard.offsetLeft - wrap.clientWidth / 2 + todayCard.offsetWidth / 2;
        wrap.scrollLeft = Math.max(0, target);
      }
    }
  }

  // One half of a day card (Morning / Afternoon): a labelled, drop-aware slot column.
  function makeHalf(dateIso, slot, label) {
    const el = document.createElement("div");
    el.className = "day__half";
    el.dataset.slot = slot;

    const cap = document.createElement("div");
    cap.className = "day__halflabel";
    cap.textContent = label;

    const slots = document.createElement("div");
    slots.className = "day__slots";

    el.append(cap, slots);

    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("drop-hover"); });
    el.addEventListener("dragleave", () => el.classList.remove("drop-hover"));
    el.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();                 // take precedence over the card-level fallback
      el.classList.remove("drop-hover");
      const id = e.dataTransfer.getData("text/plain");
      const found = findTask(id);
      if (found) { found.task.date = dateIso; found.task.slot = slot; markDirty(); render(); }
    });
    return { el, slots };
  }

  function makeChip(project, task) {
    const chip = document.createElement("div");
    chip.className = "chip" + (task.done ? " is-done" : "");
    chip.draggable = true;

    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "check";
    box.checked = task.done;
    box.title = "Mark complete";
    box.onchange = () => { task.done = box.checked; markDirty(); render(); };

    const tag = document.createElement("span");
    tag.className = "chip__tag";
    tag.textContent = project.title.split(/\s+/)[0].slice(0, 6) || "·";

    const label = document.createElement("span");
    label.className = "chip__label";
    label.textContent = task.title || "Untitled task";
    label.title = task.title;

    const x = document.createElement("button");
    x.className = "chip__x";
    x.textContent = "×";
    x.title = "Remove from this day";
    x.onclick = () => { task.date = null; task.slot = null; markDirty(); render(); };

    chip.append(box, tag, label, x);
    chip.addEventListener("dragstart", (e) => e.dataTransfer.setData("text/plain", task.id));
    return chip;
  }

  // ---------------------------------------------------------- Render: dock (projects)
  function renderDock() {
    const list = $("#projects");
    const prevLeft = list.scrollLeft;
    list.innerHTML = "";

    if (state.projects.length === 0) {
      const e = document.createElement("p");
      e.className = "empty";
      e.textContent = "No projects yet. Add one to begin — your tasks will be saved to a Markdown file.";
      list.appendChild(e);
    }

    state.projects.forEach((p) => list.appendChild(makeProject(p)));
    list.scrollLeft = prevLeft;
  }

  function makeProject(project) {
    const block = document.createElement("div");
    block.className = "project";

    const done = project.tasks.filter((t) => t.done).length;
    const total = project.tasks.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    // --- card header: title + delete
    const head = document.createElement("div");
    head.className = "project__head";

    const titleRow = document.createElement("div");
    titleRow.className = "project__titlerow";

    const title = document.createElement("span");
    title.className = "project__title";
    title.contentEditable = "true";
    title.spellcheck = false;
    title.textContent = project.title;
    title.onblur = () => { project.title = title.textContent.trim() || "Untitled"; markDirty(); renderMonths(); };
    title.onkeydown = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        project.title = title.textContent.trim() || "Untitled";
        addTask(project);
      } else if (e.key === "Enter") {
        e.preventDefault(); title.blur();
      }
    };

    const del = document.createElement("button");
    del.className = "project__del";
    del.textContent = "✕";
    del.title = "Delete project";
    del.onclick = () => {
      if (confirm(`Delete project “${project.title}” and its ${total} task(s)?`)) {
        state.projects = state.projects.filter((p) => p.id !== project.id);
        markDirty(); render();
      }
    };
    titleRow.append(title, del);

    // --- progress meter
    const meter = document.createElement("div");
    meter.className = "project__meter";

    const progress = document.createElement("div");
    progress.className = "progress" + (pct === 100 && total ? " is-full" : "");
    const fill = document.createElement("div");
    fill.className = "progress__fill";
    fill.style.width = pct + "%";
    progress.appendChild(fill);

    const pctEl = document.createElement("span");
    pctEl.className = "progress__pct";
    pctEl.textContent = pct + "%";

    const count = document.createElement("span");
    count.className = "project__count";
    count.textContent = `${done}/${total}`;

    meter.append(progress, pctEl, count);
    head.append(titleRow, meter);
    block.appendChild(head);

    // --- task list (scrolls inside the card)
    const ul = document.createElement("ul");
    ul.className = "tasks";
    ul.dataset.project = project.id;
    project.tasks.forEach((t) => ul.appendChild(makeTask(project, t)));
    block.appendChild(ul);

    // --- add-task footer
    const add = document.createElement("button");
    add.className = "project__add";
    add.textContent = "+ task";
    add.title = "Add a task (Ctrl+Enter)";
    add.onclick = () => addTask(project);
    block.appendChild(add);

    return block;
  }

  function makeTask(project, task) {
    const li = document.createElement("li");
    li.className = "task" + (task.done ? " is-done" : "");
    li.draggable = true;
    li.dataset.task = task.id;

    const handle = document.createElement("span");
    handle.className = "task__handle";
    handle.textContent = "⠿";
    handle.title = "Drag onto a calendar day to schedule";

    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "check";
    box.checked = task.done;
    box.onchange = () => { task.done = box.checked; markDirty(); render(); };

    const label = document.createElement("span");
    label.className = "task__label";
    label.contentEditable = "true";
    label.spellcheck = false;
    label.textContent = task.title;
    label.dataset.task = task.id;
    label.onblur = () => { task.title = label.textContent.trim() || "Untitled task"; markDirty(); renderCalendar(); };
    label.onkeydown = (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        task.title = label.textContent.trim() || "Untitled task";
        addTask(project);
      } else if (e.key === "Enter") {
        e.preventDefault(); label.blur();
      }
    };

    li.append(handle, box, label);

    if (task.date) {
      const when = document.createElement("span");
      when.className = "task__when";
      const [yy, mm, dd] = task.date.split("-");
      when.textContent = `${MONTHS[+mm - 1].slice(0, 3)} ${+dd}` + (task.slot ? ` · ${task.slot}` : "");
      when.title = "Scheduled — drag to another day, or click × on the calendar chip to unschedule";
      li.appendChild(when);
    }

    const del = document.createElement("button");
    del.className = "task__del";
    del.textContent = "✕";
    del.title = "Delete task";
    del.onclick = () => {
      project.tasks = project.tasks.filter((t) => t.id !== task.id);
      markDirty(); render();
    };
    li.appendChild(del);

    li.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", task.id);
      li.classList.add("is-dragging");
    });
    li.addEventListener("dragend", () => li.classList.remove("is-dragging"));

    return li;
  }

  // Add a task to a project and drop the cursor into it for rapid entry
  function addTask(project) {
    project.tasks.push({ id: uid(), title: "New task", done: false, date: null, slot: null });
    markDirty();
    render();
    requestAnimationFrame(() => {
      const labels = list_taskLabels(project.id);
      if (labels.length) focusEditable(labels[labels.length - 1]);
    });
  }

  function list_taskLabels(projectId) {
    return Array.from(document.querySelectorAll(`.tasks[data-project="${projectId}"] .task__label`));
  }
  function focusEditable(el) {
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // ---------------------------------------------------------- Master render
  function render() {
    renderMonths();
    renderCalendar();
    renderDock();
    updateFileState();
  }

  // ---------------------------------------------------------- Dock as unschedule drop-zone
  function wireDockDrop() {
    const dock = $("#dock");
    dock.addEventListener("dragover", (e) => {
      // only react to task drags (they carry text/plain on drop)
      e.preventDefault();
      dock.classList.add("drop-hover");
    });
    dock.addEventListener("dragleave", (e) => {
      if (!dock.contains(e.relatedTarget)) dock.classList.remove("drop-hover");
    });
    dock.addEventListener("drop", (e) => {
      dock.classList.remove("drop-hover");
      const id = e.dataTransfer.getData("text/plain");
      const found = findTask(id);
      if (found && found.task.date) { e.preventDefault(); found.task.date = null; found.task.slot = null; markDirty(); render(); }
    });
  }

  // ---------------------------------------------------------- Seed / boot
  function seed() {
    const y = state.year, m = state.month;
    state.projects = [
      { id: uid(), title: "Project A", tasks: [
        { id: uid(), title: "A.1 — Research & outline", done: true,  date: isoDate(y, m, 3), slot: "am" },
        { id: uid(), title: "A.2 — First draft",        done: false, date: isoDate(y, m, 9), slot: "pm" },
        { id: uid(), title: "A.3 — Review & ship",      done: false, date: null,             slot: null },
      ]},
      { id: uid(), title: "Project B", tasks: [
        { id: uid(), title: "B.1 — Sketch layout",      done: false, date: isoDate(y, m, 5), slot: "am" },
        { id: uid(), title: "B.2 — Build prototype",    done: false, date: null,             slot: null },
      ]},
    ];
  }

  // Wire up everything that doesn't depend on where the data comes from
  function setupUI() {
    $("#openBtn").onclick = openFile;
    $("#saveBtn").onclick = saveFile;
    $("#prevYear").onclick = () => { state.year--; render(); };
    $("#nextYear").onclick = () => { state.year++; render(); };
    $("#addProject").onclick = () => {
      state.projects.push({ id: uid(), title: "New Project", tasks: [] });
      markDirty(); render();
      requestAnimationFrame(() => {
        const list = $("#projects");
        list.scrollLeft = list.scrollWidth;                 // reveal the new card on the right
        const titles = list.querySelectorAll(".project__title");
        if (titles.length) focusEditable(titles[titles.length - 1]);
      });
    };

    // Block-size controls (slider + Ctrl-scroll); the "save" buttons make a
    // width permanent by writing it into the .md (see saveWidths).
    sizers.day  = makeSizer({ cssVar: "--day-w",  def: 160, min: 110, max: 360, sliderId: "blockSize", scrollEl: $("#days") });
    sizers.proj = makeSizer({ cssVar: "--proj-w", def: 256, min: 180, max: 460, sliderId: "projSize",  scrollEl: $("#projects") });

    const daySave = $("#daySizeSave"), projSave = $("#projSizeSave");
    if (daySave)  daySave.onclick  = () => saveWidths(daySave);
    if (projSave) projSave.onclick = () => saveWidths(projSave);

    wireDockDrop();
  }

  // Load straight from the .md file on disk via the pywebview bridge.
  async function startNative() {
    nativeApi = window.pywebview.api;
    try {
      const res = await nativeApi.load();
      if (res && res.ok) { ingest(res.text || ""); nativeFilePath = res.path; }
    } catch (err) { console.warn(err); }
    if (state.projects.length === 0) seed();
    render();
  }

  // Opened without the desktop shell (e.g. index.html straight in a browser).
  // Ledger is a native app — show the seed read-only and point at ledger.py.
  function startStandalone() {
    seed();
    render();   // updateFileState() shows "run with: python3 ledger.py"
  }

  function boot() {
    setupUI();

    // Ledger runs inside ledger.py (pywebview). The bridge can land a little after
    // load and "pywebviewready" may fire before we listen — so poll for it.
    let started = false;
    const bridgeReady = () =>
      !!(window.pywebview && window.pywebview.api && typeof window.pywebview.api.load === "function");
    const start = () => { if (!started) { started = true; startNative(); } };

    window.addEventListener("pywebviewready", () => { if (bridgeReady()) start(); }, { once: true });

    let waited = 0;
    (function poll() {
      if (started) return;
      if (bridgeReady()) return start();
      waited += 50;
      if (waited >= 3000) { started = true; return startStandalone(); }
      setTimeout(poll, 50);
    })();
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
