---
name: restore
description: Undo a saved change to Dania's page.
argument-hint: which change (leave empty for the last one)
disable-model-invocation: true
---
Dania wants to undo: $ARGUMENTS

1. Do step 1 of "The steps for every change" in AGENTS.md.
2. List her saved changes: `git log --grep="^Page: " --format="%h %ad %s" --date=short -10`.
   Without a request, take the newest. Otherwise show up to five as a numbered list, date
   and summary only, without the "Page: ", and ask which. If the list is empty, say there is nothing to undo.
3. Tell her what comes back and what goes away, quoting the words, and wait for her yes.
4. `git revert --no-commit <change>`. If it does not apply cleanly, run `git revert --abort`,
   tell her later changes touched the same words and nothing has changed, and offer to make
   the change by hand with the normal steps.
5. Run `node scripts/check.mjs`. If it fails, run `git revert --abort`, tell her nothing
   changed and why, and stop.
6. Commit with the summary "Page: undo " plus the original summary, then send it as in step 6 of
   AGENTS.md. Close as usual. Undoing an undo works the same way.
