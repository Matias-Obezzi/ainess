# ainess

A desktop app that runs the AI coding CLIs already installed on your machine — Claude Code,
Antigravity, GitHub Copilot CLI and others — as a team. You give one agent the task, it plans and
delegates to the others, and you watch the whole thing happen in one place.

Built with Tauri 2, React 19 and TypeScript. Windows is the platform it is developed and tested on.
The interface is in Spanish; the code and this document are in English.

> `PLAN.md` is the source of truth for the architecture, the type contracts and the protocol between
> the app and each CLI. When something here and there disagree, `PLAN.md` wins.

## How it works

Agents are **one-shot CLI processes**. Every invocation is a *run*, and the conversation survives
across runs because each provider is resumed by its own session id (`--resume` for Claude Code,
`--conversation` for Antigravity, `--resume` for Copilot). The planner never loses context between
your prompts.

Agents form a **hierarchy** with a role each:

- **Planner** — reasons, splits the work and delegates. It can read the repo, search the web, run
  `git` and write inside `.claude/`, but it does not implement.
- **Implementer** — does the work in the workspace.
- **Reviewer** — checks what the implementers did.

A planner delegates by emitting a fenced block in its answer:

````
```delegate
{"tasks":[{"agent":"Implementer","task":"Add tests for the auth module and fix what fails"}]}
```
````

Each task has to stand on its own: the child never sees the planner's conversation. When the app is
set to let the orchestrator pick models, each task can carry a `"model"` too.

The orchestrator parses it, starts a run for that agent, and feeds the child's final answer back
into the planner's session as a result. That cycle is a **round**; the maximum per task is
configurable.

## Requirements

- **Node.js 18+** and **Rust** with Cargo
- **WebView2** (already present on current Windows)
- At least one agent CLI. The app detects what you have and tells you what is missing:
  - Claude Code — `npm install -g @anthropic-ai/claude-code`
  - GitHub Copilot CLI — `winget install GitHub.Copilot`
  - Antigravity — ships the `agy` binary with its own installer
  - Gemini CLI, Codex CLI, Ollama, Aider, OpenCode — detected if they are on your PATH
  - Anything else — a **custom** agent runs any command, with `{prompt}` replaced in its arguments

Detection is deliberately stubborn on Windows: it looks at the process PATH, at the *registry* PATH
(which is what installers update), at the winget package folders, at `WindowsApps` aliases and at
the usual `Program Files` locations. A CLI installed after the app started is still found.

## Running it

```bash
npm install
npm run tauri dev      # the app, with hot reload
npm run tauri build    # NSIS installer in src-tauri/target/release/bundle
```

Other useful scripts:

```bash
npm run build          # web bundle + the phone page
npm run build:remote   # only the phone page (dist-remote/index.html)
npm run build:cli      # the CLI bundle, which embeds the phone page
npm test               # unit tests (vitest)
npx tsc --noEmit       # typecheck
cd src-tauri && cargo check && cargo test
```

## Inside the app

**Projects.** Each project points at a workspace folder and keeps its own agents' state, history and
chats. The sidebar lists them with their chats; the home screen shows them as cards.

**The thread.** The main view is a conversation with the orchestrator: its text as it arrives, the
tools it uses, the tasks it delegates (collapsible, rendered as markdown) and its final answer.
Saved **orders** — prompts you reuse — sit as chips above the input, filtered to the agent that will
run them.

**Hierarchy.** The same team as a graph: who delegates to whom, who is working right now, what each
agent is doing and how much quota it has left.

**Communication and terminals.** A right dock with the raw event feed and real terminals (PTY, tabs,
your shells). Closing the panel does not kill anything: a terminal only dies from its tab's close
button, from `exit`, or with the app.

**Approvals.** You can require your go-ahead before an agent receives a delegated task, per agent or
globally. Pending ones show up in the app, on your phone and in the CLI, and survive a restart.

**Chats.** Besides task delegation you can talk to one agent directly, or set up a shared
conversation where several answer in turn, each with a role for that chat.

**Right click.** Contextual menus everywhere they mean something: projects, chats, agent nodes,
messages, terminal tabs, approvals. Where there is nothing to do, nothing opens.

**Quota.** The app reads what each provider has left — Claude Code from its credentials, Copilot from
the GitHub API, Antigravity inferred from its own "quota reached" errors — and shows it as a ring
next to each agent and under the input.

**Tray and notifications.** The app can keep running in the background when you close the window and
notify you when an agent needs permission or finishes a task.

## Shared resources

- **Skills** — reusable instructions injected into the system prompt, for all agents or some.
- **MCP servers** — extra tools. Claude gets them per session with `--mcp-config`; Antigravity is
  synced machine-wide with `ais mcp sync`.
- **Shared context** — a block of text every agent receives about the project or the team.
- **Profile** — who you are and how you like to work, also injected into the system prompt.

## Hooks

Automatic reactions to orchestrator events, configured in Configuración → Hooks or from the CLI.
The app fires them itself: nothing is delegated to the agent.

Events: `task.started`, `task.finished`, `task.failed`, `delegation`, `approval.requested`,
`run.finished`, `run.failed`, `agent.stopped`, `result`.

Actions: Slack or Discord webhook, generic webhook, local command, system notification, or an
instruction chained into another agent.

Template variables: `{{event}}`, `{{project}}`, `{{workspace}}`, `{{agent}}`, `{{agentRole}}`,
`{{runId}}`, `{{round}}`, `{{prompt}}`, `{{output}}`, `{{error}}`, `{{taskPrompt}}`, `{{time}}`, plus
`{{toAgent}}`, `{{task}}` and `{{model}}` on `delegation`. Truncate any of them with `{{output|300}}`.

```bash
ais hooks add SlackNotify --event task.finished --action slack \
  --url https://hooks.slack.com/services/T000... \
  --template "{{agent}} finished in {{project}}: {{output|300}}"

ais hooks add Review --event run.finished --filter-agent Implementer --action instruct \
  --agent Reviewer --template "Review these changes: {{output}}"
```

## Remote access

With your phone on the same WiFi you get the same interface in one column: agent status, the live
feed, sending prompts and instructions, stopping runs and approving delegations. The phone page is
the same React app, built to a single self-contained `dist-remote/index.html` that both servers
embed.

Turn it on from the window bar button or Configuración → Remoto, then scan the QR. From the
terminal, `ais serve` does the same with the CLI's orchestrator.

The URL carries a token; without it the server answers 401. It listens on the local network only,
over plain HTTP. If the phone cannot reach it, allow the port through the Windows firewall.

**HTTP API**, if you want to drive it from something else — `Authorization: Bearer <token>` or
`?token=`:

| Endpoint | What it does |
| --- | --- |
| `GET /api/state` | Full snapshot |
| `GET /api/events` | SSE stream of `state` events |
| `POST /api/prompt` | `{projectId, agentId?, text, model?}` |
| `POST /api/instruct` | `{projectId, agentId, text, model?}` |
| `POST /api/stop` | `{projectId, agentId?}` or `{chatId}` |
| `POST /api/approve` | `{approvalId, decision: "approve" \| "reject", note?}` |
| `POST /api/chat` | `{chatId, text}` |

### From outside your network

On top of the LAN server the app can publish a public URL through
[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
or [ngrok](https://ngrok.com/). The tunnel only forwards `127.0.0.1:<port>`, so the local server has
to be on first.

- **cloudflared, no account** — `winget install Cloudflare.cloudflared`. A new URL every time.
- **ngrok** — `winget install ngrok -s msstore`, or the button in Configuración → Remoto, which runs
  it for you. Needs an authtoken; the app can save it and tells you whether it is there.
- **A URL that never changes** — pick *Estático* as the domain type. With ngrok that is the static
  domain the free plan includes (paste your API key and the app lists your domains to choose from).
  With cloudflared it is a named tunnel plus a hostname of your own:

  ```bash
  cloudflared tunnel login
  cloudflared tunnel create ainess
  cloudflared tunnel route dns ainess ainess.yourdomain.com
  ```

The ngrok agent is kept current on its own, because ngrok refuses connections from an agent older
than the minimum its account requires.

```bash
ais serve --tunnel                       # the provider saved in the config
ais serve --tunnel ngrok --tunnel-domain something.ngrok-free.app
ais remote url --tunnel                  # public URL of this process's tunnel
```

Anyone with the public URL and the token can operate the app. If it leaked, regenerate the token.

## CLI

The same orchestrator without the window. `npm run build:cli` produces it; run it with
`node bin/ais.js` or the `ais` binary.

```bash
ais "Add tests for the auth module" -w C:\repo    # run a task
ais -a Claude -p MyProject --max-rounds 4 "..."   # pick agent, project, rounds
ais projects add MyProject --dir C:\repo
ais agents add --name QA --provider antigravity --role reviewer --parent Claude
ais detect                                        # what is installed, and where
ais quota [provider] [--json]                     # what is left
ais history -w C:\repo --limit 20                 # recent runs
ais history show 3f2a                             # one run in full
ais status                                        # saved state per project
ais approvals list | approve <id> | reject <id>
ais chat -a Antigravity -w C:\repo                # interactive chat
ais chat --shared "Claude:architect,Antigravity:critic" -w C:\repo
ais serve --port 4710                             # phone server
```

`ais run` exits with code 3 when a delegation is left waiting for approval.

## Where your data lives

| What | Where |
| --- | --- |
| Config | `%APPDATA%\com.matias.ais\config.json` |
| History per project | `%APPDATA%\com.matias.ais\history\<projectId>.json` |
| Chats | `%APPDATA%\com.matias.ais\chats\<id>.json` |
| Antigravity quota marks | `%APPDATA%\com.matias.ais\quota\antigravity.json` |
| Logs | `%LOCALAPPDATA%\com.matias.ais\logs\ainess-<date>.log` |

History keeps the last 300 runs and 3000 messages per project, and the last 300 raw lines of each
run. A run cut short by closing the app comes back marked as interrupted, with a retry button.

Logs hold everything from `console.*`, uncaught frontend errors and backend events, one line each.
They rotate daily and are deleted after 14 days. Tokens are masked before anything is written.
Configuración → General changes the level; Configuración → Acerca de opens the folder and copies a
diagnostic.

Credentials are never stored by ainess. Provider tokens live where each CLI keeps them, and the
ngrok authtoken and API key stay in ngrok's own config file.

## Releases

GitHub Actions publishes them when a PR is merged into `main`:

1. In the PR, bump the version in `package.json`, `src-tauri/tauri.conf.json` and
   `src-tauri/Cargo.toml`. `npm run release:check` verifies the three agree, and CI runs it.
2. On merge, the workflow tags `v<version>`, builds and signs the NSIS installer and publishes
   `latest.json` in the release. If the tag exists already it does nothing.
3. Installed apps pick it up on their next check — at startup if enabled, or from
   Configuración → Acerca de — and update themselves.

The repo needs one secret, `TAURI_SIGNING_PRIVATE_KEY`, with the contents of the signing key. The
public half is already in `src-tauri/tauri.conf.json`.

## Reporting a bug

The bug icon in the sidebar opens the issue templates in your browser, or go straight to
[the issues page](https://github.com/Matias-Obezzi/ainess/issues/new/choose). When you paste logs,
check them for tokens first.

## Layout

```
src/
  components/         UI (ui/ holds the shadcn-style primitives)
  lib/                orchestrator, providers, transports, quota, remote, tunnel, hooks…
  remote/             the phone app
  cli/                the CLI entry point
src-tauri/src/        runner, config, detect, remote server, tunnel, pty, tray, logging
```

The frontend talks to the backend through a **transport**, and there are four: Tauri (the app), Node
(the CLI), HTTP (the phone) and a null one (the browser preview). Anything that touches the system
goes through it, which is why the same code runs in all four.
