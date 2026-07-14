---
name: salesforce-tool-router
description: "Top-level router for ANY Salesforce task from Claude Code — decides which access method (MCP server vs sf CLI vs a specific skill) and which org to use, then delegates. TRIGGER when: user asks to do something with Salesforce (agents, Data Cloud/Data 360, CRM data, cases, metadata, code, SOQL) and it's unclear which tool/skill/org applies, or asks 'how do I do X in Salesforce from here'. DO NOT TRIGGER when: the user already named the exact skill (invoke it directly), or the task is entirely non-Salesforce (Slack/Gmail/Calendar only)."
metadata:
  type: orchestrator
  version: "1.0"
  last_updated: "2026-07-08"
  author: "Antonio Magana — Success Guide"
  audience: "Success Guides using Claude Code for Salesforce"
  companion_canvas: "see field_guide_canvas_url in ~/.claude/profile.md — the internal Field Guide canvas"
---

> **⚙️ Setup:** The optional companion Field Guide canvas is read from `field_guide_canvas_url` in `~/.claude/profile.md`. Run `/setup-profile` once after cloning. No need to edit this file.

# Salesforce Tool Router

## Purpose

This is the **front door for every Salesforce task** in Claude Code. It doesn't do the work itself — it **routes**: for whatever the user asks, it picks the right **access method** (🔌 MCP server, ⌨️ `sf` CLI, or 🧩 a specific skill), the right **org**, enforces the **guardrails**, then hands off. Goal: always do the right thing, the right way, with no margin for error.

This skill is the invokable version of the **"Claude Code × Salesforce — MCP vs CLI vs Skills" field guide canvas** (F0BFY2876F7). The canvas is the human reference; this skill makes Claude follow it every time.

**It sits ABOVE the two domain orchestrators — it does not replace them:**

- **`/agentforce-success-guide`** — owns the Agentforce domain (Discover → Audit → Observe → Build).
- **`/orchestrating-datacloud`** — owns the Data Cloud domain (Connect → Prepare → Harmonize → Segment → Act).

If a task lands squarely inside one of those domains, this router hands off to it and stops. It only "does routing," never the domain work.

---

## The three access methods (the mental model)

| Method | What it is | Best for | Writes? |
|---|---|---|---|
| 🔌 **MCP servers** | Live tool connections Claude calls in natural language | Reading/exploring data, invoking agents (demo), cross-app work | Depends on server — most of ours are **read-only** |
| ⌨️ **`sf` CLI** | Salesforce CLI in the terminal against **STORM** (`my-org`) | Deploys, agent lifecycle, metadata, Data Cloud Apex — **the writes to STORM** | ✅ Full CRUD + deploy |
| 🧩 **Skills** | Pre-built expert playbooks that orchestrate CLI+MCP | Repeatable expert jobs (audit, test, scan, prep) | Via the CLI they call (guarded) |

**Rule of thumb:** *Reading/exploring → MCP. Changing/deploying/agent-lifecycle → CLI. A known repeatable job → Skill.* When more than one works, prefer **Skill** (best practices baked in), then **CLI** (most reliable), then **MCP** (fastest to ask).

---

## Step 0 — Guardrails (apply to EVERY route, before any action)

These are hard constraints. Never route around them.

1. **Which orgs are read-only.** `orgcs` (real support) and `Org62-Sobject-Read` (real CRM) are **read-only** — never attempt writes/case creation through them. Treat their data as sensitive (CSG/Claude data-handling) before any external share.
2. **STORM writes are the human's to run.** STORM (`my-org`) *can* be written to via the CLI, but by convention the assistant stays **read-only** on it — for any write/deploy/activate/assign, **hand the user the exact `sf` command to run**, don't run it.
3. **Real vs. demo data.** `orgcs`/`Org62` = real. `Salesforce_DX` (demo-scout) = STORM. `salesforce-sobject-all`/`sf-service-assistant` = other demo SDOs. Never treat demo data as customer data.
4. **demo-scout MCP ≠ a second Data Cloud path** — it shares the same token/user as the CLI. Don't expect extra reach from it.
5. **Confirm the org before acting.** Default CLI org is `my-org` (STORM). If the task implies a different org, confirm/switch (`/switching-org`) first. For MCP-agent work, remember the Hosted-MCP server is single-org and only reads from whichever org it last authenticated against.
6. **Flag Flex Credits** before invoking an agent, querying Data Cloud, or running Prompt Builder. Standard CRM read/write is free.
7. **Schema drift is real.** Always `getObjectSchema` (MCP) or `sf sobject describe` **before** writing SOQL — field names vary by org/API version (e.g. `SessionStartTime`, not `StartTime`).
8. **Slack/output limits.** Slack MCP can't edit/delete sent messages or post to Slack Connect (external) channels, and appends a footer — for polished/external posts, draft it and let the user paste. Canvas links are returned, not auto-posted.

---

## Step 1 — Classify the task

Put the request into exactly one lane. If it spans lanes, route the primary intent first and note the follow-ups.

| Lane | Signals | Go to |
|---|---|---|
| **A. Agentforce (agents)** | discover/audit/observe/build/test an agent, topics, actions, session quality, "why is my agent broken" | **§2 · hand off to `/agentforce-success-guide`** |
| **B. Data Cloud / Data 360** | ingestion, DLO/DMO, mappings, identity resolution, segments, activations, calculated insights, STDM traces | **§3 · hand off to `/orchestrating-datacloud`** (or a phase skill) |
| **C. CRM / support data (read)** | accounts, opps, contacts, ARR, cases, engagements | **§4 · MCP read** |
| **D. Metadata / code / deploy** | retrieve/deploy metadata, Apex, LWC, Flows, code scan, tests, debug logs | **§5 · CLI / skill** |
| **E. SOQL / data ops** | write a query, optimize it, bulk import/export, test data | **§6 · skill + MCP/CLI** |
| **F. Docs / research / enablement** | official docs, Trailhead, release notes, feature research | **§7 · MCP / research skill** |
| **G. MCP setup / "expose agents"** | connect Claude/Cursor to an org, create ECA, activate Hosted MCP | **§8 · `/sf-hosted-mcp`** |

---

## Step 2 — Lane A: Agentforce

**Hand off to `/agentforce-success-guide`.** It owns Discover → Audit → Observe → Build and already delegates onward:

- Observe production sessions → `/observing-agentforce` (the observability *audit* — STDM via server-side Apex `ConnectApi.CdpQuery`, or local `sf agent preview` traces as fallback).
- Build/modify an agent → `/developing-agentforce`.
- Write/run test suites, safety probes → `/testing-agentforce`.

**Quick pulse checks the router can answer directly** (read-only, no need to enter the full orchestrator):

- "Do we have agents / are they active?" → `sf data query -o my-org --query "SELECT MasterLabel, DeveloperName, Status, Type FROM BotDefinition ORDER BY MasterLabel"` (or MCP `soqlQuery`). This sees **all** agents, incl. new-Builder ones the Hosted MCP can't list.
- "How many sessions / how fresh?" → `sf data query -o my-org --query "SELECT COUNT(Id), MAX(SessionStartTime) FROM ConversationDefinitionSession"`.

**Known limits to state up front:** new-Builder (Agent Studio) agents aren't MCP-invocable yet (confirm in Setup → Agentforce Agents); `GenAiPlannerBundle`/`GenAiPlanner` aren't SOQL-queryable (use `sf project retrieve`); invoking agents via MCP costs Flex Credits.

---

## Step 3 — Lane B: Data Cloud / Data 360

**Hand off to `/orchestrating-datacloud`** for any multi-step pipeline or cross-phase troubleshooting. For a single, well-scoped phase, go straight to the phase skill:

| Task | Skill |
|---|---|
| Connect a source / manage connectors | `/connecting-datacloud` |
| Data streams, DLOs, transforms, ingestion | `/preparing-datacloud` |
| DMOs, mappings, identity resolution, data graphs | `/harmonizing-datacloud` |
| Segments, calculated insights, audience SQL | `/segmenting-datacloud` |
| Activations, activation targets, data actions | `/activating-datacloud` |
| Run Data Cloud SQL / async / vector / metadata introspection | `/retrieving-datacloud` |
| Inspect DLO/DMO field schema | `/getting-datacloud-schema` |
| Python transformations (code extensions) | `/developing-datacloud-code-extension` |

**Critical limit (verified on STORM):** the Data Cloud STDM/DMO layer (`ssot__*__dlm`) is **not** reachable by plain SOQL or by a plain CLI/`Salesforce_DX` token (`INVALID_AUTH_HEADER`). Reach it **server-side via Apex** `ConnectApi.CdpQuery.queryAnsiSqlV2` — which is exactly what `/observing-agentforce` and the Data Cloud skills do. Do not try to hit the Data Cloud REST `/ssot` endpoint with the CLI access token.

---

## Step 4 — Lane C: CRM / support data (read)

Read-only MCP is the right tool. Pick by data type:

| Data | MCP server | Notes |
|---|---|---|
| Support cases, engagements, case history | `orgcs` | 🔒 read-only, real. Related skills: `/orgcs-case-age`, `/etrab-*` |
| Accounts, opps, ARR/ACV, contacts | `Org62-Sobject-Read` | 🔒 read-only, real, sensitive |
| Same objects in STORM (demo) | `Salesforce_DX` or `sf data query -o my-org` | demo data |

Always `getObjectSchema` before SOQL. Never write through `orgcs`/`Org62`. For discovery-call prep that combines both orgs + web, use `/discovery-call-canvas`.

---

## Step 5 — Lane D: Metadata / code / deploy

CLI-first (writes) or the matching skill (best practices):

| Task | Route |
|---|---|
| Retrieve/deploy metadata, scratch orgs, CI/CD | `/deploying-metadata` (or `sf project retrieve/deploy start`) |
| Static code analysis (PMD/ESLint/Flow/SFGE/ApexGuru) | `/running-code-analyzer` (or `sf code-analyzer run`) |
| Run Apex tests / coverage / fix loop | `/running-apex-tests` |
| Analyze debug logs / governor limits | `/debugging-apex-logs` |
| Generate Apex / LWC / Flow / custom metadata | the matching `/generating-*` skill |

Reminder (guardrail 2): deploys/writes to STORM are handed to the user as ready-to-run `sf` commands.

---

## Step 6 — Lane E: SOQL / data ops

| Task | Route |
|---|---|
| Author / optimize a SOQL/SOSL query | `/querying-soql`, then run via MCP `soqlQuery` (read org) or `sf data query` (STORM) |
| Bulk import/export, test-data generation, cleanup | `/handling-sf-data` (STORM/demo only — never real orgs) |

---

## Step 7 — Lane F: Docs / research / enablement

| Task | Route |
|---|---|
| Authoritative product docs | `Salesforce_Docs` MCP (`salesforce_docs_search`/`_fetch`) or `/fetching-salesforce-docs` |
| Feature research (docs + Trailhead + release notes + Slack) | `/sf-feature-research` |
| Trailhead content only | `Trailhead` MCP (`content_search`/`fetch_content`) — no learner-progress data |

Never fabricate Trailhead URLs — search live.

---

## Step 8 — Lane G: MCP setup / expose agents

Hand off to **`/sf-hosted-mcp`** — it creates the External Client App (ECA) and registers the Hosted MCP server so Claude/Cursor/etc. can invoke the org's agents. Companion reference: the "MCP + Demo Scout" setup canvas (F0B5R3VCWLT).

---

## Output Standards

- **Announce the route.** Before acting, state in one line: *lane → access method → org → skill/command*, plus any guardrail that applies (e.g. "read-only org," "STORM write — I'll hand you the command," "Flex Credits").
- **Hand off cleanly.** When a domain orchestrator or skill owns the task, delegate and stop — don't half-do its job here.
- **Prefer read-only + least-privilege.** Default to MCP read; escalate to CLI only when a write/deploy/lifecycle action is actually required, and then hand the command to the user for STORM.
- **When ambiguous, ask one question** (via AskUserQuestion) rather than guessing the org or the write intent.

---

## Serial vs. Fan-Out — using subagents deliberately

**Routing itself is ALWAYS inline.** Classifying a request (Step 1) is one fast decision — never spawn a subagent to do it. The only question is whether the *routed task* should fan out.

**A subagent is a detour, not a shortcut.** It spins up a fresh helper with an empty context window that re-learns everything from scratch and returns only its final answer. It pays off in exactly two shapes:

- **Big-and-offloadable** — the work would flood this session with material we don't need to keep (reading many files, long tool dumps, whole-org scans). The helper absorbs the noise; only the conclusion comes back, keeping the main thread clean.
- **Many-and-parallel** — N independent chunks that run at once (audit every agent, review several files), where concurrency actually saves wall-clock time.

**Otherwise inline wins — it's faster *and* cheaper.** Quick lookups, short dependent steps, and anything that needs a mid-task question to the user (subagents can't ask) all stay inline.

| Routed task | Do it… | How |
|---|---|---|
| Quick read / count / single SOQL | **Inline** | MCP `soqlQuery` or `sf data query` |
| One agent's health, one file's scan | **Inline, serially** | the matching skill |
| Whole-org agent audit (>3 agents), multi-account prep | **Fan out** | `/agentforce-success-guide` Prep Mode workflow |
| Broad research across many sources | **Subagent(s)** | `/sf-feature-research` or parallel readers |

**Two costs to name when you recommend fan-out:** (1) 💰 parallel subagents use *more total tokens* — each re-derives context — but keep this session clean; (2) ⏱️ a *single* subagent on a small/sequential task is *slower* than inline (spawn + re-onboard + return with no parallelism to offset it). Fan-out only buys wall-clock when the work is genuinely parallel.

> ⚠️ **Live customer calls stay serial and narrated — never parallelize them.** The value is the customer watching each step land in real time; orchestration is invisible to them and only adds cost and latency. Fan-out is for async prep only. (This mirrors `/agentforce-success-guide`: Prep Mode fans out; the live arc stays inline.)

---

## Routing Quick Reference

| "I want to…" | Route |
|---|---|
| look at CRM / case data | 🔌 MCP read — `Org62` / `orgcs` |
| explore or count STORM data | 🔌 `Salesforce_DX` MCP or ⌨️ `sf data query -o my-org` |
| change / deploy something in STORM | ⌨️ CLI — hand the user the command |
| audit / test / build an agent | 🧩 `/agentforce-success-guide` → observing/testing/developing |
| do anything Data Cloud | 🧩 `/orchestrating-datacloud` (or a phase skill) |
| get agent session traces / metrics | 🧩 `/observing-agentforce` (Apex `CdpQuery`); quick count via `ConversationDefinitionSession` |
| scan code / run tests / read logs | 🧩 `/running-code-analyzer` / `/running-apex-tests` / `/debugging-apex-logs` |
| write/optimize SOQL or move data | 🧩 `/querying-soql` / `/handling-sf-data` |
| find official docs / research a feature | 🔌 `Salesforce_Docs` MCP / 🧩 `/fetching-salesforce-docs` / `/sf-feature-research` |
| connect Claude to an org / expose agents | 🧩 `/sf-hosted-mcp` |

---

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| Router doesn't do domain work | By design | Classifies + delegates only; the domain orchestrators/skills execute |
| New-Builder agents invisible via Hosted MCP | Not GA | Query `BotDefinition` via CLI; confirm in Setup → Agentforce Agents |
| `GenAiPlannerBundle`/`GenAiPlanner` not SOQL-queryable | Platform | `sf project retrieve start --metadata GenAiPlannerBundle:<name>` |
| Data Cloud DMOs (`ssot__*__dlm`) closed to plain SOQL/CLI token | Platform | Server-side Apex `ConnectApi.CdpQuery` (used by observing/DC skills) |
| Real orgs (`orgcs`/`Org62`) are read-only | By design | Writes go to STORM (CLI, user runs) or a demo SDO |
| STORM writes not auto-run | By convention | Hand the user the exact `sf` command |

## Related

Companion canvas F0BFY2876F7 · domain orchestrators `/agentforce-success-guide`, `/orchestrating-datacloud` · setup `/sf-hosted-mcp` (canvas F0B5R3VCWLT).
