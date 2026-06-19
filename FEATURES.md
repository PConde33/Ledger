# Ledger v0.1 — Features

The first tagged release of **Ledger**, a paper-styled task manager backed by a
plain Markdown file and running as a native Linux desktop app.

## Calendar

- **Linear month view** — every day of the month as a left-to-right strip of
  cards, one tab per month, with year arrows to travel between years.
- **Today** is highlighted and scrolled into view on launch.
- **Morning / afternoon split** — each day card is divided into a **Morning** and
  an **Afternoon** zone. Drop a task on either to set its time of day, or drag it
  between them to move it. Tasks with no time set live in Morning.
- **Adjustable width** — resize day cards with the header slider or **Ctrl + scroll**
  over the calendar.

## Projects (the dock)

- **Project cards** pinned at the bottom, one per project, each with a **progress
  bar** that advances as its tasks get checked off.
- **Adjustable width** — resize cards with the dock slider or **Ctrl + scroll**.
- New projects appear on the right and focus for immediate naming.

## Scheduling & sync

- **Drag & drop** a task from the dock onto a calendar day (and a specific half) to
  schedule it; it then appears in both places.
- **Reschedule** by dragging the calendar chip to another day or half.
- **Unschedule** by dropping a chip back on the dock, or clicking ×.
- **Two-way checkboxes** — ticking a task on the calendar or in the list updates the
  other instantly and nudges the project's progress bar.

## Persistence

- **Native auto-save** — every change writes straight to the open `.md` file on disk
  through the pywebview bridge. No browser, no localhost, no download dialogs.
- **Open .md** switches files; **Save .md** forces an immediate write.
- **Save widths** — a **save** button beside each width slider records the current
  block widths into the file, so your layout persists across launches.

## Markdown format

```markdown
# Project A
- [x] A.1 — Research & outline @2026-06-03/am
- [ ] A.2 — First draft @2026-06-09/pm
- [ ] A.3 — Review & ship
```

- `- [x]` / `- [ ]` — done / open
- `@YYYY-MM-DD` — scheduled on that day
- `/am` or `/pm` — morning or afternoon (optional)
- `<!-- ledger:settings dayw=210 projw=300 -->` — remembered block widths

## Editing

- Click a project or task title to rename it inline (Enter or click away to save).
- **+ Project**, **+ task**, and **✕** to add and delete.

## Platform

- Native **Linux desktop app** (GTK/WebKit via pywebview).
- Ships with a **`Ledger.desktop`** launcher and icon for the GNOME app grid /
  dock — see [README.md](README.md) for install steps.
