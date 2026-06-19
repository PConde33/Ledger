# Ledger — a paper task manager

> **⚠️ Disclaimer: this program is completely vibe-coded, created for my personal use.**

A small, clean task manager styled like a paper notebook (bone white, ink black,
graphite grey, one red margin rule). Tasks live in a plain **Markdown file**, just
like Obsidian — so your data is yours, readable and editable anywhere.

Ledger is a **native Linux desktop app**: a real GTK/WebKit window (via
[pywebview]) that reads and writes your Markdown file **directly on disk**. No
browser, no localhost, no download dialogs — every change auto-saves to the file.

## Install & run

```bash
# one-time dependencies (Debian/Ubuntu/Pop!_OS)
sudo apt install python3-gi gir1.2-webkit2-4.1     # system WebKit + GObject bindings
                                                   # (use gir1.2-webkit2-4.0 on older releases)
pip install --user pywebview

# run it
python3 ledger.py                # opens ./tasks.md
python3 ledger.py ~/notes.md     # …or any file you point it at
```

[pywebview]: https://pywebview.flowdev.io/

## Add it to your Linux apps

A launcher embeds an absolute path to wherever you cloned Ledger, so it's
**not committed** to the repo. Generate one for your machine (the `$PWD` below
fills in the current folder — no hard-coded paths), then install it with the icon.
Run this from the repo folder:

```bash
# 1. generate a launcher pointing at THIS folder
cat > Ledger.desktop <<EOF
[Desktop Entry]
Type=Application
Name=Ledger
GenericName=Task Manager
Comment=A paper task manager backed by a Markdown file
Exec=python3 $PWD/ledger.py
Path=$PWD
Icon=ledger
Terminal=false
Categories=Office;ProjectManagement;
Keywords=tasks;todo;calendar;markdown;
StartupNotify=true
StartupWMClass=Ledger
EOF

# 2. install the launcher + icon, then refresh caches (optional)
install -Dm644 Ledger.desktop ~/.local/share/applications/Ledger.desktop
install -Dm644 icon.png       ~/.local/share/icons/hicolor/256x256/apps/ledger.png
update-desktop-database ~/.local/share/applications 2>/dev/null || true
gtk-update-icon-cache  ~/.local/share/icons/hicolor 2>/dev/null || true
```

Now search **“Ledger”** in your activities and pin it to the dock if you like.
Moved the folder? Just re-run the block above. To **remove** it from your apps:
`rm ~/.local/share/applications/Ledger.desktop`.

## What it does

- **Linear calendar** — every day of the month as a left-to-right strip of blocks,
  one tab per month, year arrows to travel. Resize the blocks with the slider in
  the calendar header, or **Ctrl + scroll** over the calendar — then click **save**
  to keep that width for next time.
- **Morning / afternoon** — each day card is split into a **Morning** and an
  **Afternoon** zone. Drop a task on either to set its time of day; drag between
  them to move it. Tasks with no time set sit in Morning.
- **Project blocks** ("the dock") pinned at the bottom — one card per *Project*,
  each with a **progress bar** that advances as its tasks get checked off. Resize
  the cards with the dock slider or **Ctrl + scroll**, and **save** to keep it.
- **Drag & drop** a task from the dock onto a calendar day to schedule it; it then
  appears in *both* places. Drag the chip to another day to reschedule, or drop it
  back on the dock (or hit ×) to unschedule.
- **Two-way checkboxes** — tick a task on the calendar or in the list and it ticks
  in the other instantly, nudging the project's progress bar.

## Markdown format

Everything serializes to/from a `.md` file:

```markdown
# Project A
- [x] A.1 — Research & outline @2026-06-03/am
- [ ] A.2 — First draft @2026-06-09/pm
- [ ] A.3 — Review & ship
```

- `- [x]` = done, `- [ ]` = open
- `@YYYY-MM-DD` = scheduled on that day
- `/am` or `/pm` after the date = morning or afternoon (optional)
- Block widths are remembered via an invisible comment near the top:
  `<!-- ledger:settings dayw=210 projw=300 -->`

## Saving & editing

- **Auto-save** — every change is written straight to the open `.md` file. The
  header shows the file name and `saved` / `saving…`.
- **Open .md** switches to a different file; **Save .md** forces an immediate write.
- **save** (next to each width slider) records the current block widths into the
  file so they persist across launches.
- Click a project or task title to rename it inline (Enter or click away to save).
  **+ Project** adds a project; **+ task** adds a task; **✕** deletes.

## Files

| file | purpose |
|------|---------|
| `ledger.py`      | the app — GTK/WebKit window + direct file read/write bridge |
| `Ledger.desktop` | Linux menu launcher — **generated locally, git-ignored** (machine-specific paths) |
| `icon.png` / `icon.svg` | app icon |
| `index.html`     | markup |
| `style.css`      | the paper aesthetic |
| `app.js`         | calendar, list, drag/drop, Markdown read/write, native bridge |
| `README.md` / `FEATURES.md` | docs (FEATURES = the v0.1 feature list) |
| `tasks.md`       | your task data — created on first save, **git-ignored** |
