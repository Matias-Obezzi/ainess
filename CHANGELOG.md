# Changelog

What changed in each release, for the people who use it. This is the English one and the app shows
it to English readers; the other languages are in `docs/changelog/`, and the release check will not
let one of them fall behind.

## 0.9.0 — 2026-09-08

### Added

- **You can write code in the box.** Enter sent, so a code block meant remembering Shift+Enter on
  every line and hoping you had closed the fence — the box showed markdown as flat text and gave no
  sign either way. Now the keys know where the caret is: on a line that is only an opening fence,
  Enter writes the closing one and leaves you between them; inside a fence Enter is a line break
  that carries your indentation and Tab is two spaces; and the fenced part of what you are writing
  has a background so you can see where it starts and ends. Ctrl+Enter sends from inside a fence,
  since plain Enter no longer can.

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
