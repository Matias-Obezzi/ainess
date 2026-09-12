# Changelog

What changed in each release, for the people who use it. This is the English one and the app shows
it to English readers; the other languages are in `docs/changelog/`, and the release check will not
let one of them fall behind.

## Unreleased

### Added

- **The window comes back the way you left it.** Size, position, maximized or full screen: the
  next launch opens where the last one ended, on the same monitor if it is still there, instead of
  at 1400×900 in the middle of the screen every time. Written down when the window goes to the tray
  and when the app quits.

### Changed

- **Clicking the project you are already in takes you to its orchestrator.** The first click still
  opens a project where you left it — the board, the hierarchy, a chat. A second click on the same
  project, which used to do nothing, now goes to the orchestrator thread: the one place there was
  no shortcut back to.

### Fixed

- **Two processes for one agent.** The team is a hierarchy with one of each agent in it, and
  nothing enforced that. When an implementer finished while the reviewer was still working on the
  task the planner had given it, the review was started anyway — a second `agy.exe` on the same
  reviewer, writing the same conversation, for as long as both ran. Now an agent is one process:
  work that reaches an agent in the middle of a turn — a delegation, a review, an answer to its
  question, a retry — is written down as a queued run and starts when that turn ends, in the order
  it arrived. The planner keeps waiting for it, the board card knows about it, and the feed says
  who it is waiting for. Stopping the agent drops what was queued for it as well.

- **The Telegram bot token was being written to the log.** Whenever a poll to Telegram failed —
  every forty-five seconds, for as long as the network was down — the failed URL was logged whole,
  and Telegram keeps the token in that URL's path: `api.telegram.org/bot<id>:<token>/getUpdates`.
  The masker knew about `token=`, `Bearer` and `api_key` and not about that shape. It does now, on
  both sides of the app, and nothing that reaches the log file carries it any more. **If your log
  files have ever left your machine, revoke the token in BotFather and paste a new one** — the old
  one is in every `ainess-<date>.log` written before this build.


- **A red toast saying "idle" while a planner waited for its implementers.** The text was
  `root agent idle; waiting for 1 background task(s)` — Claude Code, on stderr, saying it is waiting
  on a subtask, which is exactly what it should be doing. Every line a CLI wrote to stderr was
  filed as an error, and every error is toasted. Now a stderr line is kept as what it is: it shows
  in the run's activity as a plain mono line, and an error the CLI actually names in its structured
  output is still an error, still red, still toasted.


- **No toasts for the project you are looking at.** A toast saying an agent delegated, or that a
  task finished, in the very thread where that just appeared is a box over the thing it repeats.
  They are held back while the window is in front and the project is on screen, and still shown
  when the window is in the background — which is when they are the only way to find out.
- **Dismissing a toast no longer closes the dialog behind it.** The toaster lives outside every
  dialog by construction, and the dialog took any pointer-down outside itself as a reason to close.
  A toast is not outside; it is on top.

## 0.16.0 — 2026-09-11

### Added

- **`--header` on `ainess mcp add|edit`.** The app has been able to give a hosted MCP server the
  headers it asks for since 0.14.0; the CLI could not. Now `--header "Name: value"`, repeatable,
  split on the first colon so a value with colons of its own — a URL, a base64 token — arrives
  whole. On `edit` new headers join the existing ones, and `--header "Name:"` removes one. A
  header is a credential, so it never reaches a log or an output: the CLI's own startup line masks
  the value, and `--json` prints `***` in its place.

### Fixed

- **The "Add command" button under Verification did nothing.** Since 0.15.0. It handed the row an
  empty command, the empty command was refused as invalid before the row was created, and the click
  ended there — the one-click suggestions worked, the button did not. Found by the first component
  test ever written for this app, on the first day it existed.


- **What an agent said while it worked no longer disappears when it stops.** Two people reported
  this from opposite ends — "my answer vanished when it delegated, only the delegation was left" and
  "the partial answers are lost when the activity ends, it only shows the last thing it said" — and
  it is one bug.

  Two different things carry an agent's words. The stream carries everything it says as it says it.
  `run.output` is the provider's *final* answer: for Claude, the `result` line, which is the last
  message and only the last message. The bubble showed `run.output`. So a turn that explained what
  it found, ran three tools and finished with a delegation or a one-line summary lost everything
  before that line the instant it stopped running — readable while it worked, gone when it ended.

  Nothing was ever actually lost: the stream is in the communication feed and inside the activity
  list. It had simply stopped being anywhere anyone was looking, and when a turn used no tools at
  all the activity section did not appear either. The bubble now shows the whole turn, and adds the
  final answer after it only when that answer says something the transcript does not already
  contain — otherwise a plain reply, which is streamed and then repeated as the result, would print
  twice. The one-on-one chat had the same loss from the other side — its bubble was overwritten
  with the final answer when the turn ended — and follows the same rule now.

- **Claude's model list had no Fable, and `fable-5.1` is not its name.** The list is written into
  the source, unlike antigravity's and opencode's, which are asked — so it goes stale in silence and
  nobody finds out until they look for a model that is missing. Typing the name by hand did not help
  either: Claude Code answers `unrecognized_model` to `fable-5.1`, because the id it takes is
  `claude-fable-5-1`. Both are fixed — the model is in the picker, and the list now says in one
  place that it is hardcoded and why that matters.


- **The app speaks seven languages everywhere, not only where somebody remembered.** A hundred and
  seven sentences were written into the source instead of into the dictionaries — every toast and
  dialog that a worktree operation produces, every message a tunnel or an install failure comes back
  with, the task cards, the whole CLI including its help screen. Six of the seven languages got them
  in a language nobody had picked, and nothing noticed, which is how there came to be a hundred of
  them: each was one line at the time.

  They were not all the same kind of thing. What a user reads moved to the dictionaries. What only a
  developer reads — every log line — is English now instead: a log is grepped, pasted into an issue
  and read by whoever is debugging, and translating one makes it useless to everyone except the
  person whose language it happens to be in.

  The CLI's help is a single entry per language rather than twenty-four, because its columns line up
  and keeping them lined up is a per-language decision — German needs more room than Japanese, and
  two dozen separate entries would let one drift out of alignment with nothing to show it.

  And there is now something that notices: a check that fails on a literal reading as Spanish prose
  outside `src/i18n`, run as part of the test suite. It looks for Spanish rather than for text, so
  the English the source is written in is not flagged. Two lines are allowed and each says why — the
  chat role values are stored on the chat and go into an agent's prompt, so they are data, not
  labels.

- **The chat going blank when you send a message.** Reported four times, never reproduced, never
  logged — because nothing was going wrong in the sense anyone was looking for. No error was thrown,
  the messages were still in the store, and switching project brought them back, which is the
  signature of something that is still there and is not being shown.

  The thread follows its own tail every 150 ms while an answer is being written, and it did that
  with `scrollIntoView`. That method does not scroll *a* container: it walks up from the element and
  scrolls **every scroll container on the way**, as far as each one needs. And `overflow: hidden`
  does not opt a box out of being a scroll container — it takes away the scrollbar and stops the
  wheel, while `scrollTop` keeps working. The app shell is `h-screen overflow-hidden` and so are
  several boxes under it, so a shell whose content came out a few pixels taller than its box could
  be scrolled by that call, and then stayed scrolled: no scrollbar, no wheel, nothing to put it
  back. The conversation slid up out of sight and stayed there until something forced a relayout —
  opening a sidebar, changing project.

  It only ever happened on sending a message because that loop only runs while an answer is coming.
  And the harness built to catch it never could: its transport cannot start a run, so the loop it
  needed to exercise never started once.

  The three feeds now set `scrollTop` on the container they already hold, which touches that element
  and nothing above it. They also check, on the same beat, whether anything above them has been
  scrolled — nothing up there is ever supposed to be — and put it back, with a line in the log
  saying which box and by how much. If this ever happens again there will be something to read.


- **Changing a project's team no longer leaves its planner delegating to agents that are gone.** A
  delegation is resolved by name against the planner's children, and the names the planner knows
  come from the system prompt it was handed. But a session is *resumed*: the CLI replays the whole
  earlier conversation, in which the old roster was listed and delegations to the old names were
  made and worked — and a transcript is louder than a system prompt appended on top of it. So
  renaming an agent, swapping the formation or adding an implementer left the planner talking to a
  team that no longer existed, and the work came back as "delegation failed".

  A session now carries a note of what it was told about the team — this agent's name and its
  children's, nothing else, because names are the whole of what a delegation resolves against. When
  that no longer matches, the next turn opens a fresh conversation instead of resuming into the
  wrong one, and says so. Sessions opened before this are adopted rather than thrown away: the cure
  should not be every agent in every project losing its context.

- **A delegation that names one agent that does not exist no longer loses that work in silence.**
  With every name wrong the turn was retried, which was right. With *some* names wrong the valid
  ones started, the invalid ones produced an error in the feed, and the piece of work behind them
  was never mentioned again — by anyone, to anyone. Those names now travel to the end of the round
  and are put in front of the planner when it picks the work back up, along with the list of who
  actually answers to it. And a name that matched nobody is treated as what it is — proof the
  session remembers an older team — so that session is dropped and the next turn starts from the
  team that exists.

## 0.15.0 — 2026-09-11

### Added

- **The lines in the hierarchy connect things now.** The agent cards have always drawn connection
  points — they are what the arrows hang off — but the canvas was not connectable, so they looked
  like something you could pull and were not. Dragging a line from one card to another moves that
  agent under a new planner. The rules are the ones the agent editor already applied — not itself,
  not under something already below it, and only one planner at the top — read from the same place
  rather than written a second time, so the two screens cannot come to disagree about what a valid
  team is.


- **A project can say what "done" means, and ainess checks it.** Until now a task moved forward
  because the agent's process exited zero. Nothing else was looked at, so "done" meant "the CLI came
  back" — and finding out otherwise was your job, in the morning, one card at a time. A project can
  now list its own commands (`npm test`, `npx tsc --noEmit`, `cargo check`), and when an agent
  finishes delegated work they are run in the folder it actually worked in — its worktree, when it
  has one, so the tests see the code that was just written. Pass and the card carries on as before,
  to the reviewer if there is one. Fail and the card comes back to you with the name of the command
  and what it printed, a message in the thread, and a `verify.failed` hook so the phone can tell you
  at three in the morning. Commands the project already declares — `test`, `lint`, `typecheck`,
  `check`, `build` from its package.json, Makefile or Cargo.toml — are offered as one click.

- **Undo what a run did.** A run has recorded where it happened and which commit it opened on since
  the diff panel needed them, so the material for this was already there; what was missing was
  knowing what the folder *already* had in flight. Without that, "undo the run" and "throw away
  everything uncommitted" are the same command, and they are not the same thing — the second one
  eats work you did yourself and never mentioned. So a run now also notes what was modified or
  untracked when it started, and the detail of a finished run has a button that puts the folder
  back.

- **A ceiling for one run, not just for the day.** The daily and monthly limits never stopped a
  single run from spending the whole day's allowance in one go: they are totals, and a total only
  notices afterwards. A project can now also set what one run may cost.

  What it can honestly do is worth saying plainly, because it is not what you would assume. Every
  CLI here reports its cost when it finishes, not while it works — so a run that goes over cannot be
  cut off halfway, because until it is over the app has not been told the price. What the ceiling
  does is stop the *next* one: the moment a run reports it went over, the message says so, and no
  further round of that same piece of work starts. The whole chain counts, not just the last run, so
  a delegation two rounds back that cost a fortune still stops it — otherwise a ceiling stops being
  one. A budget set to "only warn" still only warns.

  It is deliberately conservative and it says so out loud before it touches anything: the list of
  files that go back, the list of files that get deleted because they did not exist before, and the
  list it will not touch — files that were already modified when the run started, where the agent's
  edit and yours are in the same file and nothing here can tell them apart. Deleting is `git clean`
  given an explicit list of paths and never let loose on the folder. Runs recorded before this
  existed still offer it, treating the folder as having started clean, which is the only thing that
  can be assumed about them.

  Nothing is retried automatically. A failure the agent cannot fix would become a loop that runs all
  night, and deciding to send work back is a decision, not a reflex.

  What you type is split into a program and its arguments in front of you, and the pieces are shown
  under the field, because that is how it is spawned: nothing typed here is ever handed to a shell.
  A `&&`, a pipe or a redirection is refused with a reason rather than quietly escaped — the app
  runs on whichever shell the machine offers and they do not agree on quoting. Two commands is the
  answer to wanting two commands. A project with no commands listed behaves exactly as it did.


### Fixed

- **A planner that delegated can be talked to while its implementers work.** It was queueing your
  message until the whole round came back, which made the one agent whose job is to keep planning
  the only one you could not reach while work was in flight. The reason was a single word doing
  three jobs: "waiting" meant waiting for an answer, parked until quota returns, *and* waiting for
  implementers — and only the last describes an agent with no process of its own running. Now that
  last case takes the message and starts a turn; the other two still queue, because a new turn there
  would talk over the very thing being waited for.

  What made this more than a one-line change is what happens when the implementers come back while
  the planner is mid-answer to you. Two runs of one agent is two writers on one CLI session, so the
  results wait for that turn to end and are handed over immediately afterwards — the task's own
  thread first, before anything else queued. And a planner whose turn ends while work it handed out
  is still running now reads as waiting rather than idle, which is what it is.

- **An agent that asks the same thing forever now stops.** Answering a question resumes the agent in
  the round it was already in — a question does not advance the round — and the round is the only
  thing `maxRounds` counts. So an agent that answers every answer with another question had nothing
  bounding it at all: you answer, it asks again, and the only thing that ends it is you giving up.
  Autonomous mode had noticed and grown its own ceiling, but only for the questions it answers
  itself; when the person answering was you there was no ceiling anywhere.

  Two rules now. A question this task already answered is not asked again — the answer is on record,
  so it goes straight back, which is not a judgement call. And a task that has asked twelve times
  stops asking and says so, because twelve turns of circles is a bad afternoon and a night of them
  is worse. Asking many *different* questions is still allowed: only the count is capped, never the
  content.


- **The app stopped spending more than every second it had on writing a file to itself.** A project's
  history is rewritten in full whenever anything in it changes, and read and parsed back first so a
  decision taken in the CLI or on the phone is not lost. That is cheap for a feed of messages and
  ruinous for a feed of raw CLI output, which is what it had mostly become: on the machine this was
  found on, one project's file had grown to **47 MB, 83% of it raw lines**, and a save cost 283 ms of
  arithmetic on the interface's own thread — twice a second, for as long as an agent was working.
  That is 566 ms of every second spent thinking instead of drawing, which is why the app went slow
  exactly when there was something to watch, and why sending a message could leave the thread blank
  until anything at all — opening a sidebar, changing project — forced it to draw again. It was never
  the animations and it was never the agent's output arriving: the agent prints one or two lines a
  second. It was the app, talking to its own disk.

  The old limit counted lines and ignored their size, which was measuring the wrong thing: the median
  line is 313 characters and the largest one measured was 536 KB. Now a line is cut at 2 KB, a run
  keeps 64 KB of them, and only the last thirty runs keep any — older ones keep their prompt, their
  answer and what they cost, and lose only the transcript of how the CLI said it. The same file comes
  out at 7 MB and a save costs 44 ms. With the save also waiting three seconds instead of half a one
  while an agent works, the interface went from **566 ms of every second to 15**. Nothing has to be
  done to an existing history: the first save rewrites it at the new size.


- **A flag written with nothing after it is no longer read as its own value.** `ainess hook add
  --action slack --url --template "..."` — `--url` with nothing behind it — stored the flag's mere
  presence where the webhook's address goes, and the hook was saved pointing at something nobody
  typed: it posted nowhere and never said why. Now it stops and says `--url` is missing, which is
  what it was. The same for `--program`, `--args` and `--template`: a flag with nothing after it is
  one you forgot to fill in, not a value.
- **A Claude turn that starts without a session id begins a fresh conversation instead of resuming
  an empty one.** ainess remembers the id the provider announces so the next message continues the
  same thread. An opening line that arrived without one was remembered anyway, as nothing, and the
  turn after it asked Claude to resume a session with no name. That line is ignored now, so the next
  turn starts clean — which is where it was going to end up regardless, only without the failed
  resume on the way.

## 0.14.0 — 2026-09-11

### Added

- **A hosted MCP server can be given the headers it asks for.** ainess wrote an http server into the
  session config as a type and a URL and nothing else, so anything behind a bearer token simply
  could not be reached — the field to hold the token did not exist. It does now: one header per
  line, `Name: value`, on an http server. The value is split on the first colon only, because a
  value has colons of its own (a URL, a time, a base64 token) and cutting at the last one hands the
  server half a credential — a failure that surfaces much later as an authentication error nobody
  traces back to punctuation. Write `Bearer ${YOUR_VARIABLE}` and the client expands it from the
  environment at connection time, so the secret itself never goes into the config file. Antigravity
  gets them too, through `agy mcp add --header`, flag and value as separate arguments and never a
  command line built by pasting strings together. And when that command fails, its output is echoed
  back to you with the credential taken out of it first: the message still names the server that
  failed, which is the part that was ever useful.

### Fixed

- **Asking Antigravity what it has left stops opening a terminal.** The app takes one console at
  startup and hides it, so that everything an agent runs in turn inherits it and nothing pops a
  window at any depth. Short probes were inheriting it too — and hiding a console depends on
  `ShowWindow` reaching the window that shows it, which on Windows 11, where the default console
  host is Windows Terminal in a process of its own, it does not. A child that draws a spinner then
  brings that window up, and `agy models` draws one. Probes get no console at all now: the same
  flag the version detection and the housekeeping commands have always passed. The agents
  themselves are unchanged — they are the ones with a tree underneath that needs a console to
  inherit, which is what the shared one is for.

- **The environment box does something on an http server.** It was drawn there and went nowhere:
  the http branch of the session config never wrote `env`, so a key typed into it on an http server
  was saved to the config file and sent nowhere. An http MCP server has no process of its own, but
  the agent does — and the agent's environment is exactly where the MCP client looks when it expands
  `${VARIABLE}` inside a header. So that is where they go. Put the key in the box, write
  `X-Goog-Api-Key: ${YOUR_KEY}` in the headers, and it connects without touching the machine's own
  environment or restarting anything. The field says what that costs, because it is wider than it
  looks: a variable set here belongs to the agent's process, so every MCP server that expands
  variables sees it and so does anything the agent runs. It buys keeping the key in the app rather
  than in Windows; it does not buy secrecy, since the value lands in the config either way. A stdio
  server's variables are untouched — the client already gives them to that server's own process,
  scoped to it, and copying them out would widen them for nothing.
- **The box stops redrawing itself twice a second for a chat that is sitting still.** Whether a chat
  is answering lives in the chat module's own memory and not in the store, so nothing could react to
  it: the composer polled on a 500ms timer for as long as a conversation was open, whether or not
  anything was happening. It is subscribed now — the box redraws when a turn starts or ends and not
  otherwise.

- **Typing fast no longer makes the whole app work for every letter, and a panel that breaks says
  what broke.** What is typed belongs to the conversation, so it lived in the store — and it was
  written there on every keystroke. The store runs every subscriber's selector on every write, so
  each character re-ran the selectors of every mounted screen and re-rendered whatever they fed.
  The box is local now and the store is written behind it: debounced while typing, and at once when
  something must not be lost — an emptied box, a change of conversation, leaving the screen.
  Separately: the app had no error boundary anywhere, so a render error took the entire window down
  with no message and nothing in the log, because the thing that would have written it down died
  too. The thread and the box are now their own boundaries. A panel that throws keeps the failure
  inside itself, shows the error, and writes the stack to the log — which is the difference between
  a bug that can be reported and one that can only be described as a screen going black.

- **The empty box no longer draws two sentences in the same line of space.** The grey suggestion is
  painted on the layer behind the textarea, which carries the textarea's own padding so that it
  lines up with what you type — and an empty box starts at exactly that point, which is where the
  placeholder is. So when the agent's last message ended in a yes/no question and you had not
  written anything yet, "Sí, dale" and "Escribí mientras trabaja…" were printed on top of each
  other and neither could be read. The suggestion takes the space: it is the placeholder's own job,
  telling an empty box what to do with itself, done with the conversation in hand rather than in
  general. The rotating hint stands down for the same reason and in the same place.

## 0.13.0 — 2026-09-10

### Added

- **A new agent is born auto-approving its own tools, and the CLI can still say otherwise.** ainess
  launches these CLIs headless: nobody is sitting in front of the process to answer it. An agent
  created with the permission held was launched with `--permission-mode acceptEdits`, so it asked
  before anything that was not an edit and then waited there until somebody noticed — which reads
  exactly like the delegation approval it has nothing to do with. New agents now start with it on,
  in the dialog and in `ainess agents add`, and the switch says in one line what that means.
  Nothing already saved is touched: turning a permission on in an agent somebody else configured is
  not a default, it is a change they did not ask for, and editing an agent still leaves every
  setting the edit did not name exactly where it was. The CLI gained `--no-auto-approve` in the
  same move, because a boolean flag has no off switch — `--auto-approve=false` is refused outright
  — and the day the default flipped was the day a script could no longer set up a team whose tools
  are held. Passed both at once, off wins: between two readings of a contradictory command, the one
  that grants less.

- **Approve and answer from Telegram, Discord and Slack by pressing a button.** Everything the
  bridge could do had to be typed, and the two things that actually wait on you had to be typed
  with an id copied out of the message above them: `/approve 3f2a1b2c`. On a phone that is the
  difference between answering and not answering. A delegation held for approval now arrives with
  a yes and a no under it, and a question arrives with one button per option. All three platforms
  deliver the press over the connection they already hold open — Telegram alongside its updates,
  Discord over the Gateway, Slack over Socket Mode — so nothing is exposed and no address of yours
  goes anywhere. The press goes through the same door as a typed message, which is the point: the
  allowlist is checked in one place and a button is not a way past it. Nothing in the press is
  believed either — the id has to still be pending and the option has to be one the question
  actually has, so a button left over in an old message decides nothing a second time. A question
  that takes several answers gets no buttons, because one press is one option and that is a
  different answer from the one being asked for; those stay typed, and the message says so.

- **The home screen starts the work instead of listing it.** It was a dashboard: every project as a
  row, what was waiting on you, what was running. All of that already lives somewhere that belongs
  to it — the sidebar holds the projects and the button that makes one, the panel above keeps
  showing what is held for approval, the bell and the taskbar say when something wants an answer —
  so what was here was a second copy of it, in the one place where the thing you cannot do anywhere
  else is start. Now it is a box, in the middle, and nothing above it: type what you want done, pick
  the folder and pick one of your teams, and the project is made and the prompt is on its way. Pick
  a folder that is already a project and it simply goes there, team and all — two projects on one
  workspace would be two sets of agents editing the same files, neither knowing the other exists,
  and one folder written three ways is still one folder. It will not invent a team: with none saved
  it points at where teams are made, and a team with no root agent is said out loud rather than
  given the prompt to whichever agent came first. Under the box, the one number no other screen adds
  up across projects: what the last fortnight cost, in tasks, tokens and dollars. Nothing there is
  estimated — a CLI that reports no usage is counted as a run and no tokens, and a fortnight where
  none of them reported says so instead of drawing a flat line.

### Fixed

- **`ainess agents edit` no longer quietly undoes a permission you set.** Every editor hands the
  store a whole agent and the store puts it in place of the old one, so a field the editor did not
  build into that object is not left alone — it is gone. The CLI builds that object out of its own
  flags, and it has no flag for the delegation approval override, for the worktree or for the quota
  retry. `ainess agents edit Impl --model x` therefore put an agent set to "never ask" back to
  following the global setting, and with that setting on it started asking for approval again on
  the next delegation it received. An edit now lands on top of the agent that was there: what it
  names wins, what it does not name is kept. Naming it still counts even when the value is "follow
  the global setting", which travels as nothing at all and has to be able to erase a "never".

- **A chat no longer goes blank when you send a message into it.** Loading a conversation is a file
  read, and a file read takes time. Three separate things went wrong inside that window and all
  three ended the same way: the history gone until you left the chat and came back, which retried
  the read. A message sent while the read was in flight was overwritten by a file written before it
  existed — memory wins now, and what arrived during the read is kept. A read that failed threw out
  of the loader instead of being caught, leaving the chat with nothing in memory; it can fail for a
  mundane reason, like landing on the moment the same file is being written. And a reload put three
  grey skeletons over a history that was sitting right there, which reads as the conversation
  having been lost.

## 0.12.0 — 2026-09-10

### Added

- **Messages queued while an agent works go over together, as one.** They used to go in single
  file: the first one when the turn ended, the second waiting for *that* turn to end. Three lines
  typed in one sitting became three turns — three runs, three cards on the board, and an agent
  acting on the first before it had read the correction in the third. They are handed over as a
  single prompt now, in the order they were written, with nothing added: a blank line between them,
  the way you would have typed it yourself. "Send now" does the same, so cutting a turn short to
  deliver one of three is no longer three turns; it is one button for the block rather than one per
  line, and each line can still be taken back on its own before it goes.

- **Only what the agent is doing now, on one line.** A working agent writes a line for every tool
  it uses, and a long run writes hundreds: the thread filled up with what it had already finished,
  and the one line worth reading — what it is doing *right now* — was buried somewhere above. The
  steps run through a ticker instead. It is one line tall with its overflow hidden, so the step
  that just finished leaves through the top while the new one arrives from below. The movement is
  the point: a line that swaps its text in place looks the same whether it changed once or forty
  times, and "is this thing still going" was the question people were asking of a wall of static
  text. Click the line and the history opens above it; click the same line again and it closes.
  Three things never fold — the agent's own text, an error, and the card of an agent it delegated
  to. That card carries the approval prompt somebody has to answer, and a tidy thread is not worth
  hiding it for.

- **The box finishes your sentence, and Tab takes it.** Two things, both worked out on your machine
  and neither of them sent anywhere. With the box empty and the agent's last message ending in a
  yes/no question, the answer appears in grey: press Tab to take it, Enter to send. With something
  typed, it completes from what you have written before in that same conversation — the last way you
  phrased it, offered again from its first few characters. A question that asks for a choice rather
  than a yes gets nothing, because a "yes" is the wrong answer to "which one?"; the word list that
  decides this errs towards saying nothing. Nothing from another project ever appears here, the same
  rule the shared context follows. Tab only acts once the `@`/`#`/`/` menu and a ``` fence have had
  their say, and Enter is left alone: accepting and sending stay two decisions.

- **The taskbar button flashes when something is waiting on your answer.** An approval or a question
  stops an agent until you come back, and until now the only way to find out was to be looking. It
  flashes only while the window is not the one in front, and the check for that is made where the
  window lives rather than asked for and then acted on — in between those two the user can click
  back in, and a taskbar flashing at somebody already looking at the window is worse than none.
  Only those two: a task that finished is news, not a stopped agent.

- **The sidebar marks a project that is running unattended.** A moon beside its name while
  autonomous mode is on. It was already a per-project thing — the switch sets it on that project
  alone — but the only place that said so was inside the project, which is no use for the one you
  are not looking at.

### Fixed

- **A turn that asks three things is answered once.** An agent can ask several questions in one go,
  and each answer resumed its run on its own: three runs off a single turn, three cards on the
  board, three agents in the same workspace, over questions you answered in one sitting. They come
  as a group now — a tab each, a tick on the ones you have settled, and one button that stays
  disabled until none are missing. What goes back is a single message carrying every question with
  its answer, because the second answer is no use to the agent without the question it belongs to.
  Questions from a different run wait their turn rather than joining the group.

- **A run waiting for quota stops relaunching itself forever.** Parked runs are picked up again when
  the quota comes back, and one of the moments that gets checked is "the last run just ended" — so a
  relaunch that ran out of quota again was parked again, checked again, and relaunched again, as
  fast as the CLI could fail, writing a message into the thread every time round. Two things were
  wrong. The count of how many goes a piece of work had already had lived on the parked entry, and
  the entry was thrown away in order to relaunch it, so every attempt read as the first. And a
  provider that reports being used up without saying how much there was — Antigravity, whose pools
  only ever say "agotado" and a reset time — came out of the summary as "no idea", which anything
  asking "is the quota back?" reads as a yes. Three goes now, and then it says so and waits for you.

- **The app stops going sluggish while an agent works.** Every line a CLI printed was appended to
  its run in the store, twelve times a second for the whole length of a run. Eight screens subscribe
  to the map of runs — the box you type into among them — so all of them re-rendered at that rate,
  for a buffer nothing on screen was reading: those raw lines are only ever shown in one dialog, and
  only when you open it. They are kept aside now and written into the run once, when it ends, so the
  runs stop moving while one is going. The dialog still follows them live, and a crash mid-run still
  leaves the log on disk. Two more along the way: a flush that carried no text stopped rewriting the
  feed to put it back unchanged, and the hierarchy's nodes stopped redrawing on every delta — each
  one now watches the last tool call of its own agent, which does not move between tool calls.

- **A project that was working when the app restarted says so.** Update the app mid-delegation,
  reopen it, go to the hierarchy, and it looked like a project where nothing had ever happened —
  every agent idle, with nothing to say. The runs were coming back from disk all along and the
  thread showed them; what the hierarchy reads is the per-agent runtime, and a restart builds that
  from the team alone. Each agent now comes back on the task it was cut off in the middle of,
  marked stopped — nothing failed, the app went away. An agent this process has already put to work
  is left alone: the restore is async, and a dead run's task on top of a live one would describe
  the wrong thing entirely.

- **The right dock belongs to the project you are in.** Open the terminals panel in one project and
  walk into another, and it stayed open there too — above an empty tab bar, since the terminals are
  the first project's. All three panels are remembered per project now: put away when you leave,
  taken out again when you come back, and closed for a project that never opened them.


## 0.11.0 — 2026-09-10

### Added

- **A project's three views are rows in the sidebar.** Orquestador, Tareas and Jerarquía were a
  segmented control in the top bar — the one strip that also has to hold the project name, the
  branch, the spend, the autonomous switch and every panel toggle. They are navigation, and the rail
  down the left is where navigation lives. Each row opens the view it names rather than leaving you
  wherever the project was last left.

- **Quick commands can be your own.** Beside the detected scripts there is now a place to add the
  ones no file declares: the docker compose line, the tunnel, the migration only this project needs.
  They live on the project and sit at the top of the menu.

- **The window bar says when a chat channel is connected.** Next to the phone, a light for Telegram,
  Discord or Slack once one is actually up — the question you would otherwise open Configuración to
  answer. It is not a switch: turning a channel on takes a token and a list of who may speak.

- **The terminals panel offers the project's own scripts as buttons.** Starting the dev server meant
  opening a terminal and typing what the project already has written down. The panel now reads that:
  the `scripts` of a package.json, the targets of a Makefile, and cargo's usual four. One button
  each, the ones people reach for first — dev, start, build, test — at the front. Each opens its own
  tab, named after the script rather than "PowerShell 3", so the tab holding the server is the one
  you can find again. Press a script that is already running and it takes you to it instead of
  starting a second one to lose the race for the port; a green dot marks the ones that are up. The
  package manager comes from the lockfile, because `npm run` in a pnpm workspace resolves a
  different tree. A script whose name is not a plain name is not offered at all: these strings are
  typed into a real shell, where `predev && curl x | sh` would run as written.

- **The dependency graph is asked for from a task, and shows only that task's family.** It used to
  be a second view of the whole board, drawing every chain in the project side by side: it grew
  wider than the window, and the answer to "what is this one tangled up with?" was somewhere in the
  middle of it. Now it opens from the task itself, and what is on screen is what that task waits
  for and what waits for it, transitively — nothing else. A task that merely shares a prerequisite
  is a sibling, not family, and stays out; siblings are what made the old one unreadable. Clicking
  a card moves the graph onto it, so a chain can be followed one step at a time. Archived tasks
  come along here: an archived prerequisite is still the reason something below it cannot start.

- **Take a conversation back, or rewrite what you asked.** Right-click any message in a chat and
  the conversation can end there; on your own messages you can also edit one and ask again from
  that point. What came after goes, and so does the agent's session — the visible thread is only
  half of a conversation, the agent's own memory is the other half, and leaving it holding what you
  just took back would make the thread a lie about what the next answer is built on. The dialog
  says that before the button rather than after it. Reverting to the last message is greyed out,
  since it would take nothing with it.

- **Autonomous mode, with a time it turns itself off.** A button in the project bar turns it on for
  1, 2, 4, 8 or 12 hours. While it is on the project stops waiting for you: delegations that would
  need your approval are approved, questions are answered on the most conservative reading, and the
  round cap stops closing the task. There is no "forever" — it turns itself off at the hour you
  set, and stopping by hand still stops. The project's spending cap applies exactly as before; that
  is the brake. And a task that does nothing but ask cannot eat the whole night: after ten answers
  of its own, the questions go back to waiting for you. When it ends, the report stays in the
  thread — what finished, what failed, what it approved and what it answered without you.

- **Retry when quota comes back.** A run that died because its model ran dry left the work half done
  until you came back and hit retry by hand. Each agent has its own checkbox now: out of quota, the
  run waits instead of failing, and relaunches on its own with the same prompt as soon as the
  provider has room again. In autonomous mode it happens with or without the checkbox. If by the
  time quota is back the checkbox is off, or the autonomous stretch has ended, nothing is
  relaunched — and it says so rather than going quiet.

- **Slack too, and that is all three.** Telegram, Discord and Slack, the same commands in whichever
  one you already have open, each with its own card in Settings and its own list of chats — a chat
  authorised on one is authorised on that one only. Slack asks for two tokens rather than one: an app-level
  one to open the connection and a bot one to write, which is Slack's design, not ours, and the
  screen says which is which. Socket Mode has to be on in your Slack app and the bot has to be
  invited to the channel; the screen says that too, because otherwise nothing arrives and there is
  no way from here to tell you why.

- **Discord, beside Telegram.** The same commands in whichever of the two you already have open:
  anything you write starts a task, `/status` says who is working, `/approve` and `/answer` settle
  what needs you. Settings has a card per channel now. Nothing is exposed by either — the app is
  the one that goes out, so there is still no tunnel, no port and no address to find. Each channel
  authorises its own chats and only its own: a Discord channel id is not allowed anywhere by being
  on Telegram's list. Your bot needs the message-content intent turned on in Discord's developer
  portal, and the screen says so, because without it the messages arrive empty and nothing here
  could tell you why.

- **Open the pull request from here.** An agent finishes on its branch and the last step was yours
  to do by hand. There is a button now beside pull and push, and on a finished card. It never opens
  one on a single click: a dialog shows which branch goes into which, with the title and body
  already written from the task and from what the agent reported — the files it touched, what it
  verified, and what it could not do, which goes in under its own heading rather than being left
  out. On the default branch it refuses, and on a branch you have not pushed it offers to push
  first instead of doing it behind your back.

- **Retry a task with another model, or another agent.** A run that failed, or one whose agent ran
  out of quota halfway, left you retyping the whole thing. Now the run's own menu — and the button
  on its card — offer to run it again from the same prompt with whoever you pick. It starts from
  zero rather than continuing the run that went wrong, since its context is usually the problem.
  Changing agent clears the model: the models of one provider are not the models of another, and
  carrying one over is how you send a run to a model that does not exist.

- **Drop files on the box.** The paperclip and Ctrl+V were the two ways in; dragging a file from
  the folder you were already looking at is the third, and the one that needs no detour. The box
  outlines itself when a drag carrying files comes over it, and what you had already written goes
  along with them. A task card crossing on its way between columns is left alone — it carries text,
  not files, and catching it would move it nowhere.

### Fixed

- **A long task detail no longer pushes everything else off the dialog.** An agent writes as much as
  it feels like, and the detail sits between the status fields and the dependencies and the run.
  It is folded to a few lines now, with a "Ver más" that opens it. Whether the button is needed is
  measured rather than guessed from the length: how many lines a paragraph takes depends on the
  width it is given.

- **The project's scripts are a menu instead of a scrolling row.** A row of buttons in a panel that
  is already narrow meant a horizontal scrollbar, and a project with twenty scripts hid nineteen of
  them behind it. They are a menu beside the "+" now, in the same shape as the shell picker.

- **The top bar stops saying how many agents are working.** The dot beside the project in the
  sidebar already breathes while they are, in the place you look to see what is happening.

- **The autonomous-mode button is shaped like the buttons around it.** It carried its own amber fill
  to be impossible to miss. It did not need to: the strip under the bar is the loud one, it runs the
  full width, and it only exists while the mode is on.

- **The communications panel is a speech bubble.** Its icon described where the panel opens, which
  is the least interesting thing about it. What it holds is what the agents said to each other.

- **The board's toolbar lines up.** A Button, an Input and a SelectTrigger do not agree on their
  corner radius by default, so a row built out of all three came out with two radii side by side.
  All of it is one height and one radius now, said on each control rather than left to the defaults.

- **Answering a question is a list you tick and a button you press.** The options were inline
  buttons, each as wide as its own text, so a set of them came out ragged and a one-word option was
  a target the size of the word. They are a list now, one per row, the full width of the box. A
  question that takes several answers says so instead of leaving you to find out by clicking twice.
  And a one-answer question no longer goes off the moment you touch an option: both kinds wait for
  "Responder", so what is about to be said to the agent is on screen before it is said — and a
  misclick is one more click to undo rather than something already sent. On a one-answer question
  the option and the box for writing your own take each other's place, because one answer cannot
  also be a different sentence.

- **The buttons at the foot of a task line up by what they do.** Three loose buttons under a
  "space them out" rule meant "archive" was marooned in the middle, equidistant from a link that
  takes you elsewhere and a delete that is not coming back. Going somewhere else is on the left now,
  and what changes the task is on the right, together.

- **The board lost its view switcher and got its "New task" back where it belongs.** With the graph
  no longer a second view of the board there was nothing to switch between, so the two toolbars are
  one: the search, the filter, the count, and then "Review", "Copy as markdown" and "New task"
  side by side at the end.

- **Antigravity's quota says why it is a guess.** Its ring shows a dash where every other provider
  shows a number, and a dash with no reason next to it reads as something broken. It is not:
  Antigravity does not report how much is left. The exact figure does exist — its CLI asks Google
  for it — but it is behind a paid Code Assist license, and an account without one is refused. So
  the app says that, next to the dash, in the composer's popover, in the agent's screen and in
  settings, instead of leaving you to wonder. What is shown is still inferred from the "quota
  reached, resets in 1h45m" the runs come back with, which is the only thing there is to read.

- **The quota ring and bar fill up as the quota goes.** They filled as it was *left*, so a fresh
  quota was a full ring and one you had spent was nearly empty — backwards for a meter of something
  being consumed, and the reason nobody could read them at a glance. They now start empty and fill
  as you spend, and every number beside them counts the same way: "83%" is what has gone, not what
  is left. The colour still follows what remains, so a ring that is nearly full is also red — both
  halves say "running out" at the same moment instead of one of them saying it late.

- **A step says what it did without waiting for the browser.** Every row of an agent's activity is
  cut short — a tool shows its summary, a delegation ninety characters of the task — and the only
  way to read the rest was the `title` the browser draws: a second of waiting, a bare box wherever
  the pointer happened to be, and line breaks folded into spaces, which is exactly what you did not
  want for a command or a stack trace. They have the app's own tooltip now, anchored to the row,
  monospace, with the line breaks kept. The step a run is on right now has one too, and it never
  had anything at all.

- **An agent no longer knows about a project it was never told about.** The shared context was one
  string on the settings screen, and it was appended to the prompt of every agent of every project.
  Say something in it about one repo and every agent everywhere had read it — which is how a
  message meant for one project got understood, acted on, and carried into another. It belongs to a
  project now: the settings screen picks which one, and `ainess context` takes `-p`/`-w` like the
  rest of the CLI. What you had written is copied into every project you already have, so nothing
  is lost; if that text was only ever about one of them, the others are now the places to clear it.

- **A hook opens with a message about the event you picked.** One preset sat behind all seventeen
  of them, written for "an agent finished" and hardcoded in Spanish. A hook on "internet lost"
  opened by announcing that an agent had finished, to everyone, in a language most of the app's
  readers had not chosen. Each event starts with its own line now, in your language, using the
  variables that event really carries — the question for a question asked, the model for a spent
  quota, both agents for a delegation. Change the event before you touch the message and it
  follows; touch it and it stops following, because from then on it is yours. The test button
  fills the variables in your language too, so the preview is the message you will actually get.

- **The app stops carrying six languages it is not showing you.** All seven dictionaries were built
  into the same bundle, so every start paid for the six nobody was reading: 575 kB of them, 179
  gzipped. Now only Spanish is built in — it is the base every other language falls back to — and
  yours is fetched before the first paint and remembered. That chunk went from 575 kB to 83 kB,
  and 179 gzipped to 27.

- **An agent answering a question in a chat can no longer hand out work.** The turn that carries
  your answer was started without being told it belonged to a chat, so it was read as a task: its
  `delegate` blocks were parsed and acted on. An agent could put other agents to work from inside a
  conversation where nobody had asked for it.

- **The board scrolls down as well as across while you drag.** A column taller than the screen had
  the same problem the board had sideways: the card you wanted to drop below was out of view. The
  column under the pointer now pulls too, with the same ramp.

- **The console windows an agent opened while it worked are gone for good.** The last attempt at
  this fixed the wrong half. Asking for a process with no console works for that process — and then
  every console program *it* runs asks Windows for one, is given a new one, and that one is
  visible. The windows were never ours: they belonged to the programs our agents were running. The
  app now takes a single console for itself at startup and hides it, and everything below inherits
  that one instead of asking for its own, however deep it goes.

- **A file link in an answer does something.** An agent writing
  `[the file](file:///C:/Users/you/notes.txt)` drew a dead grey span: `file:` sat in the same
  refused list as `javascript:` and `data:`, which run in the page, and it had been put there by
  association — it runs nothing at all. Clicking one now reveals the file in your file manager and
  stops there. It never becomes a real link and it is never handed to the system to open, because
  `[look at this](file:///C:/x.exe)` is a line any agent can write.

- **The board scrolls itself when you drag a card to its edge.** A board wider than the window could
  not be crossed: the column you wanted was off screen, and letting go to scroll dropped the card
  where you did not mean it. Holding a card near either edge now pulls the board along, gently at
  the edge of the zone and faster the closer you get — and it keeps pulling while you hold still,
  which the drag events on their own do not tell anybody about.

## 0.10.0 — 2026-09-09

### Added

- **The box completes what you are about to type.** `@` names an agent of the project, `#` a file
  of the workspace, `{{` one of the template variables, and `/` your commands and your saved orders
  together — because both are things you can launch. Arrows to move, Enter or Tab to pick, Escape to
  close the list without touching what you wrote. Five commands joined the two that were there:
  `/tasks`, `/chat`, `/diff`, `/stop` and `/clear`, which asks first. Nothing completes inside a
  code fence, where a `#` is a comment and a `/` is a path.

- **You can write code in the box.** Enter sent, so a code block meant remembering Shift+Enter on
  every line and hoping you had closed the fence — the box showed markdown as flat text and gave no
  sign either way. Now the keys know where the caret is: on a line that is only an opening fence,
  Enter writes the closing one and leaves you between them; inside a fence Enter is a line break
  that carries your indentation and Tab is two spaces; and the fenced part of what you are writing
  has a background so you can see where it starts and ends. Ctrl+Enter sends from inside a fence,
  since plain Enter no longer can.

### Fixed

- **A question is asked in one place.** It appeared as a bubble in the thread and took over the box
  at the same time, both of them live, both of them the same question. The box keeps it, since that
  is where you can answer with the whole composer. Once answered it goes back to the thread as a
  read-only line — which is the only record there that it was ever asked.

- **Answering a question from the box actually answers it.** An agent asks something, you choose to
  write your reply in the composer rather than in the question's own field, you send — and the
  question stayed open. It came back over the box every time you re-entered the conversation, it sat
  in the bell and on Home and in `/status`, and the run that asked went on waiting for an answer it
  had already been given, while your message started a separate run of its own. An agent that asked
  something is stopped waiting for you, so what you type next is the answer, wherever you typed it.

- **Home says each thing once.** It had become the screen for what needs you, but the old grid of
  project cards was still underneath it, so an agent at work appeared three times: in the working
  list, inside its project's card, and again in that card's counter. Every card also carried its own
  Open, Edit and Delete buttons — a red one on each — for actions the card's own click and its
  right-click menu already covered. Now the whole screen is one kind of row: what needs you, what is
  working, and the projects, in that order. A project row shows one line of state and, only when
  there is something, a small count of what is waiting and what is running. When nothing is waiting,
  it says so in a line rather than leaving you to work it out.

- **The suggested skills are written for the agent, and explained to you in your own language.**
  The catalogue behind "Suggested" was Spanish throughout: the names, the instructions an agent
  actually reads, and the one-line descriptions in the picker. The instructions are code — they go
  into an agent's prompt and into a file in the project folder — so they are English now, like the
  rest of the repository. What is written for you is translated instead, in all seven languages, and
  a test refuses to let a new suggestion in until every language has it.

## 0.9.0 — 2026-09-08

### Added

- **A spending limit per project, and the warning before you burn through it.** The usage screen
  could always tell you what a project had cost. It could not stop it. A project now takes a daily
  limit, a monthly one, or both, and says what to do when one is reached: warn, or refuse to start
  new runs. The warning arrives at 80% — once a day, not once per run — and the usage screen draws
  the bar against whichever limit is closest to breaking. The figures are still only what each CLI
  actually reported: a provider that reports nothing adds nothing, and the screen says so rather
  than estimating.

- **A hook can tell you on Telegram, and there are three more moments worth being told about.** The
  other two chat actions want a webhook you have to go and create on a server; this one reuses the
  bot you already set up in Messaging, so "when a task finishes, tell me" is one dropdown. Name a
  chat or leave it blank for every chat on the list — and only chats on the list, because a hook is
  not allowed to be the back door around it. Three new events came with it: an agent asked something
  and is waiting, a review asked for changes, and an agent ran out of quota.

- **The palette searches what was said, not just what things are called.** It found projects,
  tasks, chats and agents by name, which is what you need on the day — and two weeks later what you
  remember is a phrase, not a title. Type three characters and the messages of the project's feed
  and of every chat come back too, newest first, each one shown with the words you searched for in
  the middle of the line rather than whatever the message happened to start with. Accents and case
  do not matter, and neither does the line break the writer put between your two words.

- **The diff of one run, not of the whole project.** The diff panel shows the project's working
  tree, which answers "what is going on in this repo" and never "what did this task touch". Every
  run now remembers where it ran — the project workspace, or the agent's own worktree — and which
  commit it opened on, so a run's detail shows what moved in it since it started. Runs from before
  this remember neither, and say so instead of guessing.

- **An agent can move its own card, and open one for what it found on the way.** The board only
  went one way: the planner read it and handed work out, and whoever was doing the work could not
  see their own card, let alone say they were stuck. Now any agent can leave a `task` block while it
  works — one kind moves its card and adds a line of detail to it, the other opens an unassigned
  card in the backlog for something it ran into that is not its job. It lands on the board while the
  run is still going rather than when it ends, and the backlog card says who proposed it. Closing a
  card is still not the agent's call.

- **The app answers to a chat you already have open.** Settings has a Mensajería section: paste a
  bot token from Telegram's @BotFather, turn it on, and write to the bot — anything you say starts a
  task, `/status` says who is working and what is waiting, `/approve` and `/answer` settle what needs
  you, `/stop` stops. Nothing is exposed by this: the app is the one that goes out and asks, so
  there is no tunnel, no port and no address for anyone to find. Only the chat ids on the list may
  give orders, an empty list allows nobody, and a stranger gets no reply at all — their id shows up
  in the settings with a button to allow it, which is also how you find out your own. Whatever
  reaches the bell reaches the chat too, and the ones that are waiting for you say what to write
  back.

### Fixed

- **Two chats with the same agent are two conversations again.** An agent had one slot for its
  provider session, and that slot held whichever conversation had spoken last. Open a second chat
  with an agent you are already talking to, go back to the first, and it answered you with the
  other one's context — and a chat also overwrote the session its own tasks were using. A chat now
  hands over the session it owns instead of reading that slot, keeps what the provider reports with
  the chat it belongs to, and a chat that has none of its own starts fresh rather than borrowing.
  Answering a question asked inside a chat stays inside it too.

- **Turning off every kind in the communication filter now empties the view.** What you send to an
  agent was exempt: it was shown whatever the filter said, and it was not even on the list of kinds,
  so there was no way to turn it off. The button read "Kinds (0/8)" while the panel kept showing
  things. There are ten kinds now, your own two among them, and off means off. When the filter is
  what emptied the view, it says so instead of claiming there has been no activity.

- **The communication panel reads what an agent wrote the way it meant it.** Its rows showed raw
  markdown — the asterisks, the backticks, the hashes — while the same text rendered properly
  everywhere else in the app. Now prose renders: what an agent said, what it delegated, what it came
  back with, and its notes. Tool lines and stderr stay exactly as they came, because a path like
  `src/lib/__tests__/x.ts` is not an instruction to embolden half of it, and what you typed is shown
  back as you typed it, the way the chat already does.

- **The kinds filter stays open while you use it, and no longer breaks the panel.** Picking one
  kind closed the menu, so narrowing the feed to two of them meant opening it five times. And the
  button that opens it says "Kinds" until you deselect something and "Kinds (7/8)" after — a longer
  label that nothing in that row was allowed to shrink for, so the whole panel was pushed wider than
  the dock it lives in. The row gives now, and so does each message's own row, where two agent
  names, a time, a badge and a button had the same argument about the same narrow space.

- **Asking to see one message raw shows that message.** The button on a row of the communication
  panel opened the whole run — every line of stdout the session had produced — which is not what
  anybody clicking on one delegation is asking for. It now shows that message: who to whom, when,
  the text in full, and for a tool call the tool, its input and the error it failed with, with a
  button to copy the lot. The full run is still one click further in, where it belonged. The button
  also has a tooltip now, and shows up on every message rather than only the ones with a run
  behind them.

- **Dragging the window no longer freezes and jumps.** Running an external program — the `git
  status` that refreshes every minute, a `git diff`, a `--version` probe — held the thread that
  pumps window messages until the program was done. Windows drags a window with a modal loop on
  that same thread, so a drag that happened to land on one of those stopped dead and then jumped to
  wherever the pointer had got to. Those commands, and reading and writing config and logs, now run
  off that thread. Saving the config also writes beside the file and renames over it, so nobody
  ever reads half of one.

- **The app is called ainess everywhere now, executable included.** It used to be called `ais`, and
  the old name survived where nobody looks: the Rust crate, and therefore the binary — the installed
  app was `ainess\ais.exe`, which is what Task Manager, the firewall prompt and the startup list
  showed you. The command line moved with it: `ais run` and `ais serve` are now `ainess run` and
  `ainess serve`, and `ais` no longer exists. Nothing you had is lost — drafts, panel widths and the
  phone's token are stored under new names and still read the old ones.

- **No more console windows blinking over what you were looking at.** Stopping a run, closing the
  app, a run that timed out, stopping the tunnel and every check for a stale process all reached for
  `taskkill` or `tasklist`, and Windows hands a console window to a console program started from a
  GUI app unless it is told not to. The spawns that run an agent always said so; the housekeeping
  around them did not.

- **One button by the box, and it is whatever the moment calls for.** Send while nothing is running,
  stop while an agent is answering — the two no longer sit side by side over the text you are
  writing. Nothing changed underneath: Enter still sends, and while an agent works it still queues
  what you write for when the turn ends, which is now what the empty box tells you instead of a
  second button.

- **A question from an agent takes the place of the box.** It used to sit inside the run's bubble,
  which is fine while you are looking at it and useless once you have scrolled past — and worse,
  anything typed into the box while a question was open started a new run and left the agent waiting
  for an answer that was never coming. The question now stands where you would have written, with
  its options as buttons and room for an answer of your own; with more than one waiting it says so
  and they come one at a time. "Escribir otra cosa" gives the box back without answering.

- **The notifications panel closes when you click away from it.** It hangs from the title bar, which
  is the window's drag region: a click there is taken by the system to move the window and never
  reaches the layer that dismisses a popover.

- **Terminals belong to their project.** Open one in a project, walk to another, and you were still
  looking at the first project's tabs — which is also why a terminal seemed to open in the wrong
  folder: it was another project's shell, sitting in its own folder. Each project shows its own tabs
  now, and remembers which one it was on. Deleting a project still leaves its shells running, as it
  always did — one of them may be in the middle of something — and they turn up on the home screen,
  which is where a terminal with no project belongs.

## 0.8.0 — 2026-09-08

### Added

- **The empty box now says something, and it changes.** The composer's placeholder types one of five
  lines and swaps every few seconds — what the team is for, what to hand over, that `/` opens the
  commands, and the Enter shortcut, which stops being a permanent tail on the line and becomes
  something you read once. It holds still for anyone who asked the system for less motion, and on
  the phone it does not move at all.
- **Movement where it means something.** A run that is still going has the light sweeping across the
  step it is on, instead of a spinner; Home's "trabajando ahora" reads as alive; the approvals pill
  wears a thread of light around it while — and only while — something is waiting for your answer;
  and the money in the usage panel counts up to what it is, in the same currency format the tables
  use. Nothing else was decorated: the thread, the feed and the board stay still, because a tool you
  look at all day should only move when it is telling you something.
- **An agent can say something before it is done.** Until now the only thing a delegated agent could
  tell its planner was its final answer: get stuck two minutes in and nobody heard about it for
  twenty. It can leave a `note` block as it works — blocked, slower than expected, something you
  should know now — and the app hands it over while the run is still going, into the feed and to
  whoever delegated the work.
- **And it closes with what it actually did.** A `result` block naming the files it touched, what it
  ran to check them and what it could not do. The prose stays; this is the part the planner reads
  without having to interpret it, and it shows up in the run's detail as three short lists.
- **Home is where you find out what is waiting.** Above the projects, two lists that cross all of
  them: what is waiting on you — a delegation held for approval, a question nobody answered, a card
  the board left in *needs you* — and who is working right now, on what, and since when. Every line
  puts you where the thing is: the thread for an approval or a question, the board with the card
  open for a task. Both disappear when there is nothing in them, so a quiet Home looks like it
  always did. And the badge that used to mark the last project you opened is gone: you are on Home
  precisely because you are not in it. In its place, each card says what is happening inside —
  "2 trabajando · 1 esperándote".
- **Agents on the same task know about each other.** A planner splitting work between two
  implementers started each of them blind: neither knew the other was there, both reached for the
  same files, and the planner got back two answers that disagreed. Each one is now told who else is
  working on this same task and what they were asked to do — and that what somebody else has in
  their hands is theirs to change, not yours to overwrite. It travels every turn, like the board,
  because it is the kind of thing that changes while you work.
- **A hook can write to "the boss" instead of to somebody by name.** The agent to instruct now
  offers the top of the hierarchy — the project's root planner, the same agent the composer, the
  CLI and the phone write to by default — resolved when the hook fires rather than when it is
  saved, so rearranging the team never leaves it pointing at somebody who is no longer in charge.
  Left unfiltered it reaches the boss of *every* project, which is what makes one scheduled hook
  enough for all of them; narrowed to a project it is that one's boss, and an event an agent
  caused stays in the project where it happened.

### Fixed

- **You can read back through a conversation while an agent is still writing.** In a chat, every
  delta it sent dragged you back to the bottom — scrolling up to check what it had said two minutes
  ago was impossible until it finished. The chat now does what the orchestrator thread already did:
  it follows the bottom only while you are at the bottom, and when you are not, a pill in the corner
  says how many messages came in and takes you there when you want it. The count is in all three
  places now — chat, thread and the communication feed — instead of a bare "new messages".
- **A long model name no longer breaks the new-chat dialog.** A participant's row is three dropdowns
  and a bin in a grid, and a grid column will not go under the width of what it holds: pick a model
  with a long name and the row stretched, the dialog stretched with it, and the name and mode fields
  ended up hanging out of the card. The columns can shrink now and the name clamps.
- **A tool failing inside an agent stops looking like the app broke.** Antigravity's `view_file`
  fails, the agent retries and carries on — and the conversation showed a red alarm about it, the
  same shape a real failure gets. It is a line in the run's activity now, in amber, with what the
  provider said one hover away. Red is kept for what is actually broken. The one case worth saying
  out loud is still said: the same tool failing three times in a run means the agent is going in
  circles, and that gets a single line naming it.
- **The composer's buttons stop crowding the box.** The send button no longer turns into a clock —
  queueing works exactly as before, Enter queues while an agent is busy and the tooltip says so —
  and the paperclip moved down to the bar, alone on the left, with the agent, the model, the
  approvals and the quota gathered on the right.
- **`ais run` fails when the task failed, in any language.** It decided its exit code by looking for
  the Spanish words of "CLI not found" in the feed — text that stopped existing the day those
  messages started coming out of the dictionaries. On an English machine a task that died for want
  of a CLI exited zero, green to whatever script had called it. It reads the runs now.
- **The conversation stops repainting itself whole.** The thread and the communication feed drew
  every message they had — three thousand per project — and not one row was memoised, so anything
  that touched the store redrew all of them. They draw the last stretch now, with a line at the top
  to walk further back that keeps your place instead of jumping, and the rows only redraw when
  something of theirs actually changed.
- **An agent typing no longer costs more the longer you have been working.** Every delta a CLI sent
  was a write: a copy of the whole message list to add one letter to the end of it, plus a copy of
  the runs map for the raw line, plus a pass over every message to decide what to save. Per token.
  With a long history that is work proportional to everything ever said, which is exactly why the
  window got heavier as the day went on. The deltas are gathered and applied together, at most every
  80 ms, and flushed on the spot when a run ends or is stopped so nothing arrives late or missing.
- **A project opens the way you left it, conversation included.** Switching to another project and
  coming back dropped you in the orchestrator thread, even if you had been talking in one of that
  project's chats: the sidebar asked for the project *and no chat*, and that is exactly what it got.
  Each project now remembers its last conversation as well as its view, and reopening the app comes
  back to both. Asking for the thread on purpose still gives you the thread.
- **Typing no longer writes to disk on every keystroke.** Each character saved every draft in the
  app as JSON, synchronously, on the main thread — which is exactly the thread that has to keep up
  with your typing. What you write still lands in the app instantly; the disk hears about it at
  most every 400 ms, and immediately when the window closes or goes away, so nothing is lost.
- **The notifications panel no longer opens with a tooltip already showing.** Opening it moved the
  focus onto the first icon button, and a tooltip shows on focus as much as on hover.
- **A card left in review comes back.** The board is put back in step with its runs on every launch,
  but only for cards *en curso*. One parked *en revisión* behind a review that died with the app —
  or whose run fell out of a trimmed history — stayed there forever. It is read now the same way the
  live flow reads it: approved goes to ready, changes and failures come back to you, and a card a
  person dragged there by hand is still nobody's business but theirs.
- **An agent in a chat is the same agent as in a task.** The chat built its own system prompt, in
  Spanish, without the `ask` block — so an agent you were talking to could not ask you for a
  decision — and with every skill pasted in whole instead of pointed at in the repo. Chats go
  through the one builder now: same profile, same shared context, same skills, same way of asking,
  minus the board and the delegation an agent has no use for in a conversation.
- **The app speaks your language all the way down.** The interface was translated and about thirty
  messages underneath it were not: a stopped run, an approval, a rejected delegation, a hook that
  failed, the errors the phone gets back, what an interrupted run leaves behind, the CLI that could
  not be installed. In an English window they all came out in Spanish. They go through the same
  dictionaries as everything else now — and a run interrupted by yesterday's build in another
  language is still recognised as interrupted today.
- **A delegation that names nobody no longer hangs the task.** A planner that misspelled an agent's
  name — or named one that is not under it — was left waiting for a team that was never coming, its
  card stuck at *en curso* until the app restarted. Now the mistake goes back to the planner with
  the names it can actually use, so it delegates again; out of rounds, the task closes as needing
  you instead of pretending to work.
- **A run that cannot even start closes its card.** With the CLI missing, the run errored and the
  board never heard about it.
- **Hitting the round ceiling says so.** The task now closes as needing you, with the ceiling in the
  detail and the same notification any failure gets, instead of ending quietly as if it had
  finished.
- **A planner that had forgotten how to delegate.** Sending the instructions only on the turn that
  opens a session was right for the description — the role, the profile, the shared context, the
  list of skills — and wrong for the two blocks an agent *acts* through. A CLI compacts its own
  context as a session grows, and once the `delegate` block had been summarised away the planner
  could no longer reach its own team: it went looking for an `ainess` command line and an MCP
  tool, and ended up asking the user to delegate on its behalf, reasoning about the app it was
  running inside as if it belonged to somebody else. The `delegate` and `ask` blocks now go on
  every turn. They are the protocol, not the preamble.
- **A crash no longer leaves agents working behind the app's back.** Closing the app walks every
  agent process down; a crash — the task manager, a power cut, a panic — never reaches that, so
  the CLIs kept going: still editing the workspace, still spending quota, with nobody reading
  their output and the app that started them gone. Every run now writes down the process behind
  it, and the next launch finds those, stops them and says so, across every project — including
  the ones it does not load at startup, whose bookkeeping can wait but whose processes cannot.
  A pid is never enough to kill on: they get handed out again, and the next holder is as likely
  to be your own dev server as an agent, so a process is only stopped when its image *and* the
  moment it started still match the run that recorded it.
- **Each project remembers the view you left it on.** The board, the conversation and the
  hierarchy were one setting shared by every project, so opening one in the hierarchy and coming
  back to another showed the hierarchy there too. Each project keeps its own now — across
  restarts, and reopening the app lands the last project where it was left. Clicking a chat is
  still an explicit destination and opens the conversation.
- **The model picked in a conversation is remembered with it.** Choosing one, walking to the board
  and coming back said "default model" again while the box right below still held what you had
  typed. It is now kept per conversation, next to the draft, model typed by hand included.
- **A hook on a machine event no longer asks for an agent twice.** The "instruct an agent" action
  sat under a filter that also listed agents, so the same dialog had two agent pickers meaning
  different things. On a machine event — a clock, the connection, a file changing — nothing an
  agent did sets the hook off, so filtering by one could only mean "never fire": those options are
  gone there, leaving the action's own picker as the only one, and a hook that had one falls back
  to that agent's project. The filter is also named for what it does now ("Escucha a").
- **Links in an agent's answer took the whole app to `tauri.localhost`.** Agents write two kinds
  of link and the app treated them as one: a web address, and a path inside the repo they are
  working on (`src/lib/foo.ts`, `README.md`). The second is not something to open, and left on an
  `<a href>` the desktop window followed it — off to `tauri.localhost/src/lib/foo.ts`, with the app
  gone from under you. Only real addresses are links now, and they open in the real browser; a
  repo path is left as text you can read. A `javascript:` or `data:` link — which an agent can
  write, deliberately or not — is never one at all.
- **An agent could not switch models when its parent told it to.** A planner naming a `model` for
  a task was only obeyed while "choose the model" was on in Configuración, so with it off — the
  default — an implementer told to retry on another model because its own had run out of quota was
  quietly started on the same exhausted one again. A model the parent asks for is honoured either
  way now; that setting decides whether the planner is *told to pick* one, not whether its pick
  counts. And a child that ran out of quota no longer reaches its parent as a wall of CLI error
  text: it is said plainly, with the models of that same CLI still worth trying — its own family
  left out, since quota is spent per family — and with the reminder that a task can carry a
  `model`. When the CLI has no other model, the parent is told to say so rather than retry.

## 0.7.0 — 2026-09-08

### Added

- **Skills are opened when they apply, not poured into every run.** A skill used to travel whole
  inside the system prompt of every agent it was enabled for: five skills were five manuals in every
  run, read or not. Each one is now written to `.ainess/skills/<name>/SKILL.md` and the prompt
  carries only its name, one line of what it is for and that path — the agent opens the one the work
  is about, and whatever else the skill needs (a script, a template) can sit in the same folder.
  That one line of description is what it decides from, and the editor now says so.
- **Notifications make a sound.** Two short notes, rising when something needs you and falling when
  something finished, so you can tell them apart without looking. The app synthesises them — no file
  in the installer, and it plays the same in the window, from the tray (the app keeps running there,
  which is what lets the sound reach you) and on the phone. Configuración → General turns it off,
  and its editor tunes the notes, the wave and the volume, or takes a sound of your own.
- **Each agent's history, in the project.** `.ainess/history/` gets one file per agent, appended
  as its turns end: who asked, what was asked and what came back, for the work it was given and for
  the chats. The app keeps all of it in its own storage, where only the app can read it; this is the
  way in for an agent that comes back tomorrow, and for you with an editor. Old turns are dropped
  whole when the file fills up, never cut in half.
- **Terminal tabs are dragged into the order you want**, like any tabbed editor: the one being
  carried fades and a line shows where it would land.
- **Hooks on the machine's own conditions.** Until now a hook answered something an agent did.
  Five more events answer the machine instead: the app opening, a clock (at a time of day or every
  so many minutes), the connection dropping and coming back, and a file changing in a project's
  folder — that last one riding the watcher that was already there, so the noise (`.git`,
  `node_modules`, build output) never reaches it. They run while the app is open, no more than once
  a minute each, and the project they act on is the one in the hook's own filter, or whichever is
  open. `approval.requested`, which was already being fired, is finally in the list you can pick
  from.
- **The changelog in your language.** The dialog that opens after an update, and Configuración →
  Acerca de, now show the notes translated. English stays in `CHANGELOG.md` and each other language
  has its own file, which the release check keeps in step with the version being published.
- **It looks for a new version every five minutes**, not only once at startup, so a release
  published while the app is open reaches it the same day. The same offer as always, and the same
  switch in Configuración turns it off.
- **Cutting a turn short to say something.** A message waiting for an agent has a second button:
  it stops what is running and hands the message over right away. Nothing is repeated — what the
  agent did is on disk and what it said is in its own session, which the run that follows resumes
  — and it is told that its turn was cut, so it does not read the transcript as one it finished.
- **Commands in the box.** Typing `/` on an empty composer opens a short list: `/compact` has every
  agent of the project start a new session — nothing is lost, since each one is pointed at its own
  file in `.ainess/history/` and reads back only what the new work needs — and `/cost` opens what
  the project has spent. Anything else in the box is a message, so "look at the /compact of Claude"
  still goes to the team untouched.

### Fixed

- **The instructions were being sent again on every turn.** An agent's preamble — its role, the
  delegate and ask schemas, the shared context, the profile, the list of skills — went with every
  message of a conversation the CLI was already carrying forward. With Claude that was the same
  paragraphs billed turn after turn; with the providers that take the instructions inside the
  prompt (Antigravity, Copilot, opencode and the rest) it also left a copy of them in the
  transcript, for good, so a long session paid for it many times over. They go once now, on the
  turn that opens the session. What still goes every turn is the board, which is the part that
  changes.
- A project opens its folder in the file manager, from the right click and from the three dots
  alike — and those two menus now offer the same actions everywhere they are the same thing. The
  project's path was in the right click and not in the dots, and a chat's "Open" the other way
  round.
- A project can no longer be given two orchestrators at the root. The team dialog asks for a parent
  for the second one, which is where it belonged anyway: side by side they both read the whole
  board and can take the same card, only the first is ever the default the composer, the CLI and
  the phone write to, and the project's single "task in progress" pointer let one overwrite the
  other — leaving the first task without its card moved, its hooks or its notification. A team that
  already has two says so as soon as you open either of them.
- Changing an agent's CLI kept the session of the old one, and the next run handed Antigravity a
  session id Claude had opened — which fails on the spot, since it is a name the other one has
  never heard. The session is dropped now when the CLI changes, and when the agent moves in or out
  of its own worktree, which is the other half of what a session is tied to.
- The repository watcher no longer wakes on the app's own `.ainess/` folder: the board, the team
  and now the history are written there as the work happens, and a file hook would have been
  answering the app instead of the user.
- A hook asked twice what it is about: one field for the agent and another for the project. It is
  one now — everything, a whole project, or one agent under it — since an agent belongs to exactly
  one project and the pair could only agree or contradict each other into never firing.
- The agent lists that reach across projects — the one a hook instructs, the one a hook is filtered
  to, the one an order is bound to — group the agents under the project each belongs to, with its
  colour. Two projects with an "Orchestrator" each read the same before.
- An agent you write to yourself is told who it is. It reads the same prompt whether the work came
  from its planner or from you, so an implementer answered a message of yours by delegating it on
  — and then sat at "waiting for its team".
- And that wait is over anyway: a delegation naming somebody who is not under that agent left it
  waiting for a team that was never coming. When not one of them lands, the agent is free again.
- A link in a terminal opens with one click. Only the ones a CLI marked itself were links at all,
  and those needed Ctrl held; now any URL in the output is one, and it opens in the real browser.
- On the phone, the keyboard covered the box you were typing in. The page deliberately does not
  resize itself when the keyboard opens — that used to throw the conversation off its bottom
  anchor mid-task — so the shell is shortened by exactly what the keyboard takes instead.
- The "new version available" toast showed the release note as it is written, so it read
  `[CHANGELOG.md](https://…)`: a toast has no markdown to render it with. It says what it has to
  say now, and what changed is in the changelog that opens after the update.
- A message written while an agent was working showed up in Comunicación and nowhere else, as if
  the app had swallowed it. It now sits at the end of the conversation, dashed and with a clock,
  saying who it is waiting for, and it can be taken back before its turn comes.
- That message could also be handed over too early: an agent that delegates ends its own run
  before its team has finished, and the queue was emptied there — the message ran beside the work
  it was meant to follow. It waits now until the agent is really free.

## 0.6.0 — 2026-09-08

### Added

- **Files go with the message.** A clip in the composer, or Ctrl+V straight into the box: a
  screenshot, a PDF, a log. Images show a thumbnail before they go and anything else its name and
  size, and either can be taken back out. On send, the file is copied into the project's own
  `.ainess/attachments/` folder and the prompt carries its path — which is the one thing every CLI
  can do with an attachment, since they all read the repo they work in.

### Fixed

- A project with agents working shows it in its own dot, which breathes slowly. It used to wear
  an orange count next to its name, which read like something waiting for an answer — the amber
  badge at the bottom of the sidebar, the one that does need you, is now the only thing that
  looks like that.
- Deleting from the right-click menu asked in the pill at the top of the window, the shape meant
  for the phone, instead of the dialog. It only happened while working on the app, and it could
  also lose the question altogether.
- The `{{` list of a hook now says what each variable holds, instead of only its name, and the
  arrows scroll it: past the eighth one the highlight used to move below the fold.

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
