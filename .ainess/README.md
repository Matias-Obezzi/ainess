# The .ainess folder of ais

What ainess knows about this project lives here. `BOARD.md` is the task board and `AGENTS.md` is the team: the app writes both, so anything you edit by hand is lost on the next run — to move a card, the planner delegates it with its id.

The rest of the folder belongs to the agents: plans, notes and handoffs go here rather than in each CLI's own config folder.

If a dev server is watching this repository, add `.ainess/` to what it ignores: every change of the board touches these files.
