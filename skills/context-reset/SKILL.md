---
name: context-reset
description: "ONE command, /context-reset, for the whole checkpoint→clear→resume loop that cures a bloated, over-compacted context that has gone slow. It auto-detects direction: if there's active work in context it SAVES a checkpoint; if the window is fresh (post-/clear) it RESUMES from the last one. TRIGGER when: user types /context-reset, or says 'checkpoint', 'hand off', 'save where we are', 'context is too big/large', 'you're getting slow', 'let's clear and keep going', 'reset context', 'resume', or 'pick up where we left off'. Claude should also proactively SUGGEST /context-reset when it detects context bloat/degradation (see Auto-suggest). DO NOT TRIGGER when: the user wants to permanently record a durable fact (that's the memory system), or wants a plain /clear with nothing preserved (they can just type /clear)."
metadata:
  type: utility
  version: "1.0"
  last_updated: "2026-07-16"
  author: "Jose Antonio Rodriguez — Success Guide"
  audience: "Anyone whose Claude Code context has grown large and started to degrade"
---

# Context Reset — checkpoint, clear, resume

## Why this exists

Long sessions bloat the context window. After several compacts / auto-compacts, quality
degrades — instructions get missed, details get dropped, work gets sloppy (this is literally
how a set of Slack canvases once got shortchanged). The fix is not to keep pushing through a
degraded context; it's to **write down the irreplaceable state, clear the conversation, and
reload only that state into a fresh window.**

**Hard truth about the mechanism:** nothing — not a skill, hook, slash command, or tool — can
trigger `/clear` programmatically. Wiping the conversation is a harness action reserved to the
user by design. So the loop **cannot collapse to a single command**; the irreducible minimum is
**two user actions**:

```
  /context-reset   →   user types /clear   →   (auto-resume)
  writes a tight       built-in; only the      the context-reset SessionStart hook
  curated checkpoint   user can do this        re-injects the checkpoint — no 3rd step
```

The old third step (typing `/context-reset` again to resume) is **gone**: `context-reset-hook.sh`
runs on `SessionStart`, detects the fresh checkpoint after a `/clear`, and hands it back
automatically. Manual resume still works (just say "resume") if the hook is ever disabled.

---

## Where checkpoints live

- Directory: `~/.claude/checkpoints/`
- Filename: `<short-slug>--<YYYY-MM-DD-HHMM>.md` (e.g. `apollo-canvas--2026-07-16-1113.md`)
- `~/.claude/checkpoints/archive/` — where consumed checkpoints go after a successful resume.

Checkpoints are **transient working state**, not durable facts. Durable facts (who the user is,
standing preferences, project constraints that outlive this task) still go to the memory system
at `~/.claude/projects/.../memory/`. If something in the checkpoint turns out to be permanent,
promote it to a memory instead of leaving it here.

---

## Auto-suggest — raise it before being asked

The user wants to be *reminded* when it's time, not to have to notice bloat themselves. Offer a
reset proactively when any of these are true:

- The session was **continued from a compaction summary**, or has already been compacted /
  auto-compacted at least once.
- The session is **very long** / large tool outputs have accumulated, or you catch yourself
  **dropping details, missing instructions, or redoing work** — the tell-tale signs of a
  degraded window (this is how work gets sloppy).
- You're about to **switch to a different, unrelated task** — a natural clean cut.

How to raise it, without nagging:
- Say it **once** at a natural pause — never interrupt an action mid-flight to suggest it, and
  don't repeat it every turn. Re-raise only if things clearly worsen.
- Use one line and name the single command, e.g.:
  > *Context is getting heavy and quality can start to slip here — want to checkpoint and clear?
  > Just type `/context-reset`.*
- It's a suggestion, not a demand. If the user says no, drop it and keep working.

> **How the reminders are wired** (a skill only loads once triggered, so three things make them
> fire without it):
> 1. The global `CLAUDE.md` "Context health" note — lets Claude raise it before this skill loads.
> 2. `context-reset-hook.sh` on `SessionStart` with `source: compact` — auto-injects the reminder
>    right after any compaction (auto or manual), which is the exact degradation event to catch.
> 3. The same hook with `source: clear` — auto-resumes a waiting checkpoint after `/clear`.
>
> Registered in `settings.json` → `hooks.SessionStart`. Keep the three roughly in sync if you edit
> one. The hook is the belt-and-suspenders backup to Claude noticing on its own.

## Step 0 — Which mode? (auto-detect, don't ask)

`/context-reset` runs both directions; pick from **the state of the current window**, not from
which words the user used:

- **CHECKPOINT mode** — there IS substantial active work in this window (an ongoing task, recent
  tool calls, a thread of decisions). The user wants to save it and clear. This is the default
  whenever real work is in play.
- **RESUME mode** — the window is essentially fresh: little or no prior context (you were just
  `/clear`ed), and an un-archived checkpoint exists in `~/.claude/checkpoints/`. Reload it.

The discriminator is "is there live work here to save?" — yes → checkpoint, no → resume. The
presence of a checkpoint file is only a secondary hint. Only if it's genuinely ambiguous (real
work in the window *and* the user clearly means to resume something older) ask one short
question: *"Save a checkpoint of what we're doing, or resume the last one?"*

---

## CHECKPOINT mode

Goal: capture everything the next window needs and **nothing it doesn't**. The checkpoint must
be tight — a page or two. If you copy the whole conversation in, you've rebuilt the bloat you're
trying to escape. Capture the *irreplaceable* state; leave the retrievable detail on disk.

1. **Confirm scope in one line.** State what you're about to checkpoint ("the Apollo Agentforce
   deep-dive work") so the user can correct you before you write.

2. **Write the checkpoint file** to `~/.claude/checkpoints/<slug>--<date>.md` using the template
   below. Get the timestamp with `date +%Y-%m-%d-%H%M`. Keep each section to what's true and
   load-bearing — omit a section rather than pad it.

3. **Record the transcript path** so deep detail stays retrievable without living in context.
   The current session transcript is under `~/.claude/projects/<project-dir>/<session-id>.jsonl`.
   If you can't determine the exact file, note the projects dir and the date so it can be found;
   `ls -t ~/.claude/projects/*/*.jsonl | head` finds the most recent.

4. **Tell the user exactly what to do next**, verbatim:
   > Checkpoint saved to `~/.claude/checkpoints/<file>`. Type **`/clear`** now — when the fresh
   > window opens I'll reload this checkpoint automatically. No other command needed.

5. **Do not** run `/clear` yourself (you can't) and don't pretend you did. Don't `/compact`
   either — compaction is what degrades over repeated use; a clean checkpoint + `/clear` is the
   whole point.

### Checkpoint template

```markdown
# Checkpoint: <task name> — <date/time>

## Goal
<1–2 lines: what we're ultimately trying to achieve.>

## Status
- Done: <what's complete and verified>
- In flight: <what's half-done, and exactly where it stopped>
- Not started: <what remains>

## Irreplaceable facts (the stuff that's painful to re-derive)
- IDs / links / paths: <record IDs, Slack channel & message ts, canvas IDs, file paths, URLs>
- Decisions made: <choices already settled — don't relitigate these>
- Constraints: <accuracy bars, do-not-do's, audience/permission rules, tone>

## Next steps (ordered)
1. <the very next action, concrete enough to just do>
2. ...

## Gotchas / do-not-repeat
- <mistakes already caught and fixed, dead ends, things that looked right but weren't>

## Full detail (if needed)
- Transcript: ~/.claude/projects/<...>/<session>.jsonl
- Other artifacts: <docs, drafts, files touched>
```

---

## RESUME mode

Goal: rehydrate a clean working context from the checkpoint — nothing more.

> Usually you don't reach here by hand: the `SessionStart` (`source: clear`) hook injects a
> resume directive automatically after a `/clear`. These steps are what that directive tells you
> to do, and they also apply when the user resumes manually or the hook is disabled.

1. **Find the checkpoint.** `ls -t ~/.claude/checkpoints/*.md 2>/dev/null | head`. If several
   exist, pick the most recent whose task matches the user's ask; if unclear, list the candidate
   titles and ask which one. (Ignore anything already in `archive/`.)

2. **Read it** and give the user a 3–5 line orientation: the goal, what's done, and the next
   step you're about to take. Do **not** dump the whole file back at them.

3. **Only pull deeper detail if a step needs it.** The transcript path and artifact links are in
   the checkpoint — read from those on demand rather than loading everything up front. That
   restraint is the entire benefit; don't undo it.

4. **Continue the work** from "Next steps."

5. **Archive the consumed checkpoint** once you've resumed successfully so the directory doesn't
   accumulate stale state:
   `mv ~/.claude/checkpoints/<file> ~/.claude/checkpoints/archive/`.
   If the task will span several clear/resume cycles, write a fresh checkpoint at each cut rather
   than reusing one.

---

## Guardrails

- **Concise or it's pointless.** A checkpoint that reintroduces the bloat has failed. Favor IDs,
  links, and decisions over prose; point at the transcript for the rest.
- **Honesty.** Never claim the context was cleared — you can't clear it; the user does. Report
  the checkpoint as written and the file path plainly.
- **Don't lose outward-facing safety.** If the work involves customer-facing vs. internal
  material (e.g. a canvas with internal presenter notes), carry that distinction into the
  checkpoint's Constraints so it survives the reset.
- **Promote, don't hoard.** Anything permanent belongs in the memory system, not a checkpoint.
