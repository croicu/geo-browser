# <Task Name>

<!--
Template for a new task, per CLAUDE.md's Task Workflow.

How to use:
1. Copy this file to tasks/<task-name>.md (short, kebab-case).
2. Fill in the sections below as the stage progresses — delete this comment block once started.
3. Add a "New Task" entry in CLAUDE.md's "## New Tasks" section pointing at the new file.
4. At Brainstorm, no GitHub issue is required (a lightweight one labeled status:brainstorm is
   optional, for backlog visibility). Open a real issue when advancing to Implementation —
   body = this file's Problem statement + Design decisions — and label it status:implementation.
5. Once the issue closes (Done), delete this file — the issue is the source of truth from then on.
   Only skip deletion if there is no real issue behind the task.
6. If the task is set aside rather than finished, relabel status:postponed and leave the issue
   open; if it's standing/continuous work rather than a single close-out, use status:ongoing
   instead. Both keep their issue open indefinitely — they are not part of the linear
   brainstorm -> ... -> ready-to-submit -> closed flow.
-->

## Status: Brainstorm

## Problem statement

<!-- What's wrong, missing, or requested — and why it matters. Include concrete evidence
     (error messages, logs, repro steps) where available, not just a restated feeling. -->

## Design decisions

<!-- Update as the discussion converges. Record the *why* behind each decision, not just the
     *what* — especially anything a future reader would find surprising or non-obvious. -->

## Open questions

<!-- Anything still ambiguous. Remove once resolved, or move the resolution up into Design
     decisions and leave a one-line note here for history if genuinely useful. -->

## Implementation plan

<!-- Added when advancing to Implementation. Concrete steps, file by file if useful. -->

## Test results

<!-- Added when advancing to Testing / Ready to Submit. Test counts, lint status, manual
     verification notes, any open issues found along the way. -->
