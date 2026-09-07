# Changelog

What changed in each release, for the people who use it. The app shows this same file in
Configuración → Acerca de.

## Unreleased

### Fixed

- The quota was written in Spanish whatever language the app was in: the windows Claude Code
  reports, Antigravity's pools, what each opencode account spent, and every "sign in first" that
  goes with them. All seven languages now.
- A delegation of a single line said "1 lines" while it waited for approval.

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
