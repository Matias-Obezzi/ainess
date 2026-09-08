# Changelog

What changed in each release, for the people who use it. The app shows this same file in
Settings → About.

## 0.5.0 — 2026-09-08

### Added

- **The diff, next to the conversation.** A third section in the right dock, alongside Comunicación
  and Terminales: the project's git changes, file by file, with the hunks coloured and every file
  collapsible. It reads the uncommitted work, what is staged, or the last commit, lists the
  untracked files that `git diff` leaves out, and refreshes itself when a run ends — which is
  exactly when the working tree has just changed under the agents' hands. Read-only: nothing in it
  writes to your repository. The dock now takes any two or three of its sections at once, each pair
  split by a divider you can drag.
- **Each agent gets a say over approvals.** The switch on an agent is now three ways: follow the
  general setting, always ask, never ask. Before it could only add a gate, never lift one — with
  "Approve every delegation" on, turning it off on an agent did nothing at all, and the dialog gave
  no hint that something else was forcing it. It now says, right under the field, what the general
  setting is doing today.
- **The reviewer actually reviews.** A delegated task that finished well moved to *in review*
  whenever the project had a reviewer, and stayed there forever: nobody ever told the reviewer. It
  is handed over now — the reviewer gets the original task and what was delivered, and the card
  moves on its own to *ready* when it approves, or back to *needs you*, findings in the detail, when
  it asks for changes. The planner waits for that review and reads it before carrying on.
- **Variables that complete themselves.** Typing `{{` in a hook's message, title or arguments opens
  the list of variables the event carries: arrows to pick one, Enter to insert it.

- **The side panes are dragged to the width you want.** The menu on the left and the dock on the
  right were fixed at 260 and 380 pixels. Both have a divider now, and the width you leave is
  remembered per machine.
- **Pull, push and switch branch without leaving the app.** The repo popover of the project header
  had only numbers in it; it now has the branch — local ones, remote ones you do not have yet, and
  a first entry that asks for a name and creates one — plus a pull and a push. All of it is off
  while an agent is working in that project: git moving files under a run is how one ends up half
  applied to the wrong branch. The pull only fast-forwards, so it stops and says why instead of
  leaving a merge behind, and the first push of a new branch sets its upstream.

### Fixed

- Emptying the conversation asks first. The bin in the communication panel used to wipe the whole
  history on one click.
- The hook dialog was the only one with its colours hardcoded, so the line explaining which
  variables you can use was grey on grey. It follows the theme now, and lists every variable as a
  chip you can read.

## 0.4.0 — 2026-09-07

### Added

- **A `.ainess/` folder in every project.** The app writes what it knows where the agents can read
  it: `BOARD.md` with the open cards and the id each one answers to, `AGENTS.md` with the team and
  who reports to whom, and a `README.md` saying what the folder is. The app owns those three — a
  card moves when a delegation names it, not when somebody edits the markdown — and the rest of
  the folder is the agents': plans, notes and handoffs go there now instead of into each CLI's own
  configuration folder.
- **Dragging a card on the phone.** Hold one, carry it to another column's chip to move it, or
  onto another card to take that card's place. The board follows it to the column it lands in.
- **A browser for the agents.** The Playwright MCP server was already one click away in
  Configuración → MCP (⋯ → suggested); what was missing is that the servers reached more than one
  CLI. GitHub Copilot now gets them on every run too, through the file Claude Code already got
  (`--additional-mcp-config`), so an agent on either can open the app, click around, read the DOM
  and take screenshots. The section says which CLIs receive them and which have to be configured
  in the CLI itself — before, enabling a server for an agent that could not receive it did nothing
  and said nothing.
- **The phone tells you when something needs you.** A bell in its header asks for permission, and
  from then on a delegation waiting for a yes, a question, or a task that came back reaches you
  while the page is in the background or the screen is locked. It is the browser's own
  notifications over the stream that is already open — no push service, no keys, nothing that
  leaves your machine — so it needs the tunnel's HTTPS address (over plain HTTP on the LAN the
  browser refuses) and, on iOS, the page installed to the home screen. The page now ships a
  manifest, an icon and a service worker, which is also what makes an installed copy behave like an
  app rather than a bookmark.
- **Writing while an agent is thinking.** The box no longer goes grey mid-answer: what you write
  is queued and sent the moment the turn ends, in the orchestrator and in a chat alike. Enter
  sends, Shift+Enter is a line break and Ctrl+Enter queues on purpose, whether or not anything is
  running.
- **An unsent message stays put.** What is typed is kept per conversation and survives changing
  view — and closing the app.
- A planner with nobody under it used to answer as if it were alone in the project. It is told who
  else is on the team and that they have to be placed under it in Hierarchy before it can delegate,
  and it is pointed at `.ainess/AGENTS.md`, where the whole team is written down.
- **The orchestrator can see the board.** Its open tasks are part of what a planner is told, each
  with a short id, so "look at the tasks and get to work" is answered from the board instead of
  "there are no tasks and no saved plan". To pick one up it delegates with that id in a `taskId`
  field, and the card moves — with the agent on it and its status — rather than a second card
  being opened for the same work.

### Fixed

- Saving the ngrok authtoken or API key did nothing when the paste carried the whole line from the
  dashboard (`ngrok config add-authtoken 2abc…`) or a trailing newline: the credential is taken out
  of what was pasted now. With ngrok missing the button was silent; it says so. And what the CLI
  answered when it refused is written to the log, masked, instead of only flashing in a toast.
- A run cut off by Claude Code's own ceiling — "background tasks still running after 600s" — said
  only that it took too long. It now says what was holding it: something the agent left running in
  the background, and what to ask it to do about that.
- **Moving a card reloaded the whole window.** The `.ainess/` folder is written into the project
  whenever the board is saved, and a dev server watching that project reloads the page when a file
  under it changes — including the app's own, whose project is its own repository. Two halves: a
  file that would come out the same is not written at all, so the board being saved does not wake
  up anything watching the repo, and the folder is out of what the app's own dev server watches.
  The `README.md` in the folder says it too, for a project with a dev server of its own.
- A card let go anywhere but on a column is now let go: an unhandled drop belongs to the browser,
  which does what it likes with it, and in a window that reads as the screen reloading.
- **Drag and drop on the board did nothing in the app.** The webview keeps the drag events for
  itself on Windows unless it is told not to — "disabling it is required to use HTML5 drag and
  drop on the frontend", says Tauri's own config schema — so a card could be picked up and never
  dropped. Nothing here wants files dropped from Explorer, so it is off.
- An option of a question that was a whole sentence ran off the side of the screen. The options
  wrap now, and stack on a narrow one. The `ask` block that describes the question was also being
  printed above it as raw JSON: the question is drawn from it, so it is no longer written out.
- On the phone, the board's columns run past the edge of the screen and nothing said so. The strip
  fades on whichever side still has columns on it.
- The communication panel opened at the oldest line of the project instead of at what just
  happened. It lands on the newest, like the conversation does.
- Tasks that seemed to duplicate themselves: every prompt opened a card and every delegation
  opened another, so a planner that handed the request straight down left the same title twice.
  A delegation that repeats the card it came from moves that card now.
- The update button in a development build offered an update it could not install, and failed on
  the plugin it loads to relaunch as soon as the dev server was gone. A dev build says what it
  always said about the CLI and the browser: updates are for the installed app.

## 0.3.2 — 2026-09-07

### Added

- An agent added under a planner arrives with a description of itself — its role and the CLI
  behind it, in the app's language — instead of the empty field the planner used to read. It
  follows the role and the provider while you are choosing them, and stops the moment you write
  your own. `ais agents add` fills it in the same way.

### Fixed

- **A run that would not start on Windows**: `No se pudo iniciar …\claude.cmd: batch file
  arguments are invalid`. Windows refuses to hand a batch shim an argument with a line break, and
  the system prompt every agent is started with has several. npm installs its CLIs as a shim
  around a script, so that script is what the app runs now — the CLI in the terminal already did
  this, the app did not. It covers the CLI shipped as a script and the one shipped as a binary
  (opencode's shim points at an `.exe`), which is 13 of the 15 shims on this machine — the two it
  passes over are npm's own. A shim it cannot read says what is going on instead of that sentence.
- An agent row with a model and a parent made the new-project dialog scroll sideways, taking the
  Browse button and the row's own buttons off the edge with it. The list can shrink now, and a
  long line is trimmed instead of setting the dialog's width.
- The two notices above the composer — the project with no team, and the agent whose CLI is not
  installed — came out one word per line. The box they use is a two-column grid whose first column
  is zero wide, and a bare string was landing in it.

## 0.3.1 — 2026-09-07

### Fixed

- The quota was written in Spanish whatever language the app was in: the windows Claude Code
  reports, Antigravity's pools, what each opencode account spent, and every "sign in first" that
  goes with them. All seven languages now.
- A delegation of a single line said "1 lines" while it waited for approval.
- The instructions every agent is started with were Spanish whatever language the app was in, so
  an English window got a team that answered in Spanish. What each role is, how to delegate and
  how to ask you something are written in the seven languages now.
- The path of a project opened above its name, under the window bar, where it was cut off. It
  opens below it.
- The actions of the agent panel in the hierarchy ran past its edge; they wrap now, and a long
  label is trimmed instead of pushing the button out.
- Toasts came out in the light palette of the library that draws them: a white card thrown at a
  dark window every time something finished. They are mixed from the theme's own colours now.
- The quota was asked for from four places at once — the rings, the agent dialog, the timer and
  the sweep after every run — and each one was a request of its own, until Claude Code answered
  429 and "HTTP 429" is what the rings showed. There is one shared answer now, reused for a
  minute; a provider that answers 429 is left alone for five, showing what it said last time it
  worked. The refresh buttons still ask on the spot.
- In a narrow window the buttons of the project bar ended up under the right dock, out of reach.
  The bar reads its own width: the labels drop to their icons, the branch and the spend give way
  before the tabs do, and the floating dock starts below the bar instead of over it.

## 0.3.0 — 2026-09-07

### Added

- Install an agent's CLI from the app. A provider that is missing now carries an install button
  running what that CLI documents — a global npm install, winget, or Antigravity's own installer —
  with the whole command written next to it.
- A changelog, in the app: what a version brought, and it opens itself once after an update.
- **An agent can ask you to decide.** Instead of guessing, it ends its answer with the options it
  sees; the conversation shows them, you pick one (or write your own) and it carries on in the same
  session. Answerable from the phone too.

### Changed

- Errors in the conversation are read and said in a sentence: what happened, what to do about it,
  and how long the wait is when the provider said so. The original is one click away.
- A delegation waiting for a yes is answered under the delegation itself, in the thread. The bar
  that used to span the top of the project is gone; what is off screen is counted next to the
  composer.
- A fresh install starts empty. It used to come with a team of three agents wired to CLIs the
  machine may not have.
- Building a team only offers the CLIs that are actually installed, and says where to get one when
  there are none.
- Opening the app while it is already open brings that window forward instead of starting a second
  copy of it.

### Fixed

- Antigravity's CLI is found where its own installer puts it (`%LOCALAPPDATA%\agy\bin`), not only
  where the app leaves it.
- Deleting a project emptied its history and its board but left the files there, one pair per
  project ever deleted. They are removed now.
- An answer to a question whose agent no longer exists says so, instead of leaving the thread
  looking like something is working on it.

## 0.2.0 — 2026-09-07

### Added

- **The interface speaks seven languages**: Spanish, English, Portuguese, Chinese, Japanese, French
  and German, following the system unless you pick one.
- **A task board and a dependency graph per project**, which is what a project opens on. Cards move
  by hand or by themselves as runs finish, can be searched, filtered, prioritised, auto-archived,
  exported as markdown, and written from any message in the conversation.
- **A team per project**, plus formations: a team you save once and apply to the next project,
  carrying its skills and MCP servers with it.
- **An agent can work in its own git worktree**, on its own branch, and you decide what to do with
  it when it is done.
- **Branch and pull request status** in the sidebar and the project header, live off filesystem
  events rather than a timer.
- **What every run cost**: tokens, dollars or premium requests, as each CLI reported them, per run,
  per agent and per project.
- **A notification centre** behind the bell, which also tells you what happened while the app was
  closed.
- **opencode as a full provider**, with its sessions, its models and what each account linked to it
  has spent — a way to put a Gemini API key behind an agent.
- **The phone page** gained the task board, the quota, diagnostics, and a form to type the token
  into, which is what an installed app needs.
- A shortcuts dialog (Ctrl+/), a diagnostics panel, and `ais doctor` printing the same checks.
- `ais usage`, and the CLI speaking the configured language.

### Changed

- The phone page is sent compressed: a third of the bytes over the tunnel.
- Confirmations are a dialog in the app and the island on the phone, one shape per build.
- The project path moved out of the header and onto its name, as a tooltip.

### Fixed

- Every event was handled once per hot reload, which asked for the same approval five times and
  wrote each streamed line as many.
- Deleting a project left its approvals, notifications, chats and history behind.
- Reopening the app announced its whole history at once: a wall of "task finished" toasts.
- A tunnel outlived an app that was killed rather than closed, and ngrok refused the next one.
- The board kept cards "in progress" whose run had ended while nobody was listening.
- The phone page hid its tab bar behind the browser's own UI, and could not be reached at all
  without a token in the link.
- A planner closed its round before every delegated run had finished.

## 0.1.0 — 2026-09-05

First release: the orchestrator itself. Projects, a team of agents over the CLIs installed on the
machine, delegation with approvals, the conversation and the hierarchy, integrated terminals, LAN
remote access with a public tunnel, and updates from GitHub.
