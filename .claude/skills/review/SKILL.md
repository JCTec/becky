---
name: review
description: Look over Dania's page and say what needs attention.
disable-model-invocation: true
---
Change nothing. Do "Being her QA" in AGENTS.md for the whole page: run
`node scripts/check.mjs`, read all the text as a first-time visitor would, and reply with at
most five points, most important first. One line each: what, where, and what you suggest.
If nothing needs attention, say so in one sentence. Then ask which one to start with.
