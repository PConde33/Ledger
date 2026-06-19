#!/usr/bin/env python3
"""Ledger — native Linux desktop app.

Wraps the Ledger UI (the same index.html / style.css / app.js) in a real GTK
window via pywebview, and exposes a tiny file bridge so the app reads and writes
your Markdown file *directly on disk* — no browser, no localhost, no downloads.

Run:
    python3 ledger.py            # opens ./tasks.md (created on first save if missing)
    python3 ledger.py notes.md   # opens a specific file
"""
import os
import sys

import webview

APP_DIR = os.path.dirname(os.path.abspath(__file__))


class Api:
    """Methods here are callable from JS as window.pywebview.api.<name>()."""

    def __init__(self, path):
        self.path = os.path.abspath(path)

    # ---- internal helpers -------------------------------------------------
    def _read(self):
        try:
            with open(self.path, "r", encoding="utf-8") as f:
                return {"ok": True, "path": self.path, "text": f.read()}
        except FileNotFoundError:
            return {"ok": True, "path": self.path, "text": ""}
        except OSError as e:
            return {"ok": False, "error": str(e), "path": self.path}

    def _write(self, text):
        try:
            os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
            with open(self.path, "w", encoding="utf-8") as f:
                f.write(text)
            return {"ok": True, "path": self.path}
        except OSError as e:
            return {"ok": False, "error": str(e), "path": self.path}

    # ---- exposed to JS ----------------------------------------------------
    def load(self):
        return self._read()

    def save(self, text):
        return self._write(text)

    def current_path(self):
        return self.path

    def open_dialog(self):
        win = webview.active_window()
        sel = win.create_file_dialog(
            webview.OPEN_DIALOG,
            allow_multiple=False,
            file_types=("Markdown (*.md;*.markdown;*.txt)", "All files (*.*)"),
        )
        if not sel:
            return {"ok": False, "cancelled": True}
        self.path = sel[0] if isinstance(sel, (list, tuple)) else sel
        return self._read()

    def save_as_dialog(self, text):
        win = webview.active_window()
        sel = win.create_file_dialog(
            webview.SAVE_DIALOG,
            save_filename=os.path.basename(self.path) or "tasks.md",
            file_types=("Markdown (*.md)", "All files (*.*)"),
        )
        if not sel:
            return {"ok": False, "cancelled": True}
        self.path = sel[0] if isinstance(sel, (list, tuple)) else sel
        return self._write(text)


def _apply_branding():
    """Give the GTK window our icon and an app id that matches Ledger.desktop,
    so GNOME's dash/taskbar shows the Ledger icon instead of a generic one."""
    try:
        import gi
        gi.require_version("Gtk", "3.0")
        from gi.repository import Gtk, GLib

        # app_id on Wayland comes from the program name → match the .desktop basename
        GLib.set_prgname("Ledger")
        GLib.set_application_name("Ledger")

        icon_png = os.path.join(APP_DIR, "icon.png")
        if os.path.exists(icon_png):
            Gtk.Window.set_default_icon_from_file(icon_png)
        else:
            Gtk.Window.set_default_icon_name("ledger")
    except Exception as e:   # branding is cosmetic — never block startup
        print("icon setup skipped:", e)


def main():
    _apply_branding()
    target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(APP_DIR, "tasks.md")
    api = Api(target)
    webview.create_window(
        "Ledger",
        os.path.join(APP_DIR, "index.html"),
        js_api=api,
        width=1180,
        height=820,
        min_size=(820, 600),
        background_color="#f3efe4",
    )
    webview.start()


if __name__ == "__main__":
    main()
