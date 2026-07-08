# Subagents & parallelization — when to fan out, when to stay inline

Every skill in this repo follows one discipline for spinning up Claude Code **subagents** (the `Agent` tool). It's a power tool that's easy to over-use, so the rule is deliberately conservative.

## The mental model

A subagent is a **fresh helper with its own blank context window**. It re-derives whatever it needs from scratch, does its work, and returns **only its final message** — none of its intermediate reasoning or tool output comes back. That "return just the conclusion" is both the benefit and the cost.

**It's a detour, not a shortcut.** Delegating a task is like emailing it to a colleague instead of doing it at your own desk: worth it when the task is big and self-contained, or you can hand five colleagues five tasks at once — not worth it to look up one phone number.

## The two costs

| Cost | What happens | When it bites |
|---|---|---|
| 💰 **Tokens** | The helper starts blank and re-derives context + carries its own overhead → **higher total tokens** than inline | Always higher total. The *win* is a **clean main thread** — the helper absorbs the noise, you keep only the answer |
| ⏱️ **Latency** | spawn → re-onboard → work → return. A *single* helper on a small task is pure added wait | Hurts on quick / sequential work. **Only** pays off when several run **in parallel** |

## The rule

> **Inline by default. Delegate only when the work is *big-and-offloadable* or *many-and-parallel* — and never during a live customer call.**

**✅ Fan out when:**
- **Big-and-offloadable** — read many files / scan a whole org to return *one* conclusion; the helper's noisy reads stay out of your session.
- **Many-and-parallel** — N independent chunks that run at once (audit 8 agents, review 6 files, one subagent per engagement), where concurrency actually saves wall-clock.
- **Specialized / independent** — needs a specific toolset or a fresh, unbiased second opinion.

**❌ Stay inline when:**
- It's a **quick, known lookup** (one query, one field, one file).
- The steps are **short and sequential** — each needs the previous result, so there's no parallelism to gain.
- It's **interactive** — the task needs to ask *you* something midway (subagents can't talk to the user).
- It's a **live customer call** — the value is the customer watching each step land in real time; orchestration is invisible to them and only adds cost and latency. Fan-out is for async *prep* only.

## How this repo applies it

- **Single-source skills** (`gmail-priority-check`, `calendar-agenda`) run fully inline — nothing to parallelize.
- **`orgcs-case-age`** is the reference example of *loop → bulk query, not loop → subagent*: it fetches every case's email + comments in **one** `WHERE … IN (<ids>)` query rather than a helper per case. Bulk-querying beats fan-out on both tokens and latency.
- **`orgcs-engagement-nudge`, `etrab-weekly-note`, `daily-driver`** gate their fan-out on **engagement count** — inline at ≤ 3, one subagent per engagement only above that, and synthesis always happens once, inline, because it needs every result together.
- **`agentforce-success-guide`** fans out one helper per agent in its async *Prep Mode* (many-and-parallel) but keeps the **live call arc strictly serial and narrated**.

That last contrast is the whole philosophy in one skill: **fan out for async breadth; stay inline for anything live or small.**
