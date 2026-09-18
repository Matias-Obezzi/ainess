# Code Review

> Checklist before approving a change

Before approving a code review, check:
- Does the change solve the requested problem without touching unrelated code?
- Is there error handling for paths that can fail?
- Are variable and function names clear?
- Were tests added or updated for the new behavior?
- Is there duplicated code that could be extracted?
- Are there leftover console.log calls, TODOs, or debug comments?
