# a-bot design: "Ink & Signal"

Mode: **Operate**. People come to get work done with their bots; the interface should disappear into the task.

- **Shell:** an ink-blue rail (devices, bots, account) in both themes. Work happens on warm paper (light) or deep ink (dark).
- **Type:** IBM Plex Sans for everything; IBM Plex Mono only for commands, output and code. Fixed rem scale, ratio ~1.15.
- **Colour:** accent ink-blue for primary actions, selection and focus only. Amber **signal** is reserved for "a bot is
  working": the breathing dot in the rail and conversation list, the running node in the trace, the streaming caret.
  Green/grey/amber dots for device and bot state; red only for errors.
- **Signature move: the trace.** A bot's work (commands, file edits, tool calls, thinking) renders as a vertical trace
  that is open while the bot runs and folds into a one-line summary ("2 polecenia, 1 operacja na pliku") when done.
- **Layout:** rail 248px · conversations 288px · chat (max 780px). Below 900px the rail collapses to icons and the list hides.
- **Motion:** 150–250ms state transitions with an exponential ease-out; nothing decorative. Reduced motion respected.
- **Copy:** Polish, plain, controls name their action, errors say what to do next.

Tokens live in `apps/desktop/src/renderer/src/styles.css` (`:root` and the dark-mode block).
