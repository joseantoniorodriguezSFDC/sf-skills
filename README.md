# sf-skills

Claude Code skills for Salesforce **Success Architects and Success Guides** working with Agentforce customers.

Built by Jose Antonio Rodriguez — Success Guide, Agentforce Service.

---

## First-time setup

These skills come in two layers:

- **Capability layer — the skills themselves.** Shared, versioned, identical for everyone. This repo.
- **Context layer — who you are.** Your workspace email, timezone, Slack id, and support org. Personal to you, and *not* in this repo.

A freshly cloned skill is fully capable but knows nothing about you. You supply the context layer **once**, into a single file the skills read — `~/.claude/profile.md`:

```bash
git clone https://github.com/joseantoniorodriguezSFDC/sf-skills.git /tmp/sf-skills
cp -r /tmp/sf-skills/skills/* ~/.claude/skills/
cp /tmp/sf-skills/profile.template.md ~/.claude/profile.md
```

Then, in Claude Code, run:

```
/setup-profile
```

It auto-detects your email, timezone, Slack id, and org from the MCPs you've already connected, asks you to confirm, and fills `~/.claude/profile.md`. Every skill reads from there — so you never hand-edit a `SKILL.md`, and `git pull` for skill updates never clobbers your settings. It also **offers to create the two Slack canvases you won't have yet** — your brag book and your ETRAB weekly note — and writes their URLs into the profile.

> **New to the toolkit?** [`SETUP.md`](./SETUP.md) is the full step-by-step walkthrough — installing, connecting the MCP servers, running `/setup-profile`, and creating the canvases you're missing.

> ⚠️ **Never commit `~/.claude/profile.md`** — it identifies you. The repo ships only the blank `profile.template.md`. (Same rule as `~/.claude.json`, which holds your MCP OAuth secrets.)

---

## Skills

### `sf-feature-research`

Research any Salesforce feature end-to-end in a single command. Runs four search tracks in parallel and synthesizes findings into a structured report:

| Track | What it searches |
|---|---|
| **Trailhead** | Official learning content — modules, trails, projects, superbadges |
| **Salesforce Help & Docs** | Setup guides, developer references, API docs — with published dates |
| **Web** | Recent release notes, blog posts, and Salesforce Help articles from the past year |
| **Slack** | Internal threads, demos, recordings, and enablement materials from SEs, SAs, and enablement teams |

> **Note:** For some searches — particularly Salesforce docs lookups — this skill may delegate to the **sf-demo-scout** plugin if it is installed, which provides enhanced access to official documentation. If you have sf-demo-scout installed, those lookups will be faster and more comprehensive.

**Example triggers:**
```
/sf-feature-research Agentforce Service Agent
/sf-feature-research Slack MCP integration
/sf-feature-research Data Cloud unification
"Find me everything on Headless 360 — docs, Trailhead, Slack"
"What are people saying internally about Einstein Copilot?"
```

#### Install `sf-feature-research`

```bash
git clone https://github.com/joseantoniorodriguezSFDC/sf-skills.git /tmp/josea-sf-skills
cp -r /tmp/josea-sf-skills/skills/sf-feature-research ~/.claude/skills/sf-feature-research
```

Then restart Claude Code and run `/sf-feature-research <feature name>`.

**Need help with the installation?** See the [Claude Code docs](https://docs.claude.com/en/docs/claude-code/overview) for the full setup process. *(Salesforce-internal users: an installation Slackbot is available in the enterprise workspace.)*

---

### `agentforce-success-guide`

The front door for Success Guides and Success Architects running Agentforce coaching sessions with customers. It connects Claude Code directly to a customer's Salesforce org via the Salesforce Hosted MCP Server — no browser, no Setup clicks required.

This is the **Headless 360** story in practice: everything you'd normally do through the Salesforce UI (checking agents, diagnosing permissions, reviewing production sessions) happens here, from the terminal, through governed API calls that inherit the org's security model.

**What it does:**

| Domain | Trigger phrase | What happens |
|---|---|---|
| **Discover** | "show me the agents" | Inventories every agent in the org — name, type, status |
| **Audit** | "why isn't the agent working" | Diagnoses broken agents: inactive status, missing Einstein Agent User, missing permission sets, missing beta perms |
| **Observe** | "how is the agent performing" | Surfaces production session quality, failures, and misroutes (delegates to `observing-agentforce`) |
| **Build** | "let's build an agent" | Hands off to `developing-agentforce` to create or modify agents from the terminal |

---

## Success-Guide daily-workflow skills

Beyond the two Agentforce skills above, this repo ships the **daily-driver toolkit** — the read-only skills a Success Guide leans on every day, the orchestrators that decide *which* tool to use, and the **post-call motion** that turns one paste of call notes into the whole follow-up. None of them hard-code anything about you: every personal value (workspace email, Slack id, timezone, booking link, canvas ids) lives in `~/.claude/profile.md` and is filled once by `/setup-profile` (see [First-time setup](#first-time-setup) above). Each skill's `> ⚙️ Setup:` note lists which profile fields it reads.

| Skill | What it answers | Sources | Writes? |
|---|---|---|---|
| **`daily-driver`** ⭐ | "Catch me up — what needs me today?" Orchestrates the lanes below into one picture | all of the below | ❌ read-only (nudges are draft-and-confirm) |
| **`salesforce-tool-router`** ⭐ | "How do I do X in Salesforce from here?" Routes any SF task to MCP vs CLI vs the right skill + org | routing only | ❌ routes, doesn't act |
| `gmail-priority-check` | "Which email actually needs me?" | Gmail | ❌ read-only |
| `calendar-agenda` | "What meetings do I have?" | Google Calendar | ❌ read-only |
| `orgcs-case-age` | "Which cases has the customer gone quiet on?" | Salesforce (support org) | ❌ detect + alert |
| `orgcs-engagement-nudge` | "Which engagements are waiting on a nudge?" | Salesforce + Slack | ⚠️ draft-and-confirm nudge only |
| `etrab-weekly-note` | Per-account weekly status notes, follow-on to the last one | Salesforce + Slack + Gmail | ❌ read-only (drafts to paste) |
| `discovery-call-canvas` | Turn an account/case into a discovery-prep Slack canvas (or refresh a working canvas after a call) | Salesforce + Slack + web | ✅ creates or refreshes a Slack canvas only |
| **`post-call-360`** ⭐ | "Wrap up this call" — one paste of call notes → customer email draft + internal Slack summary + your homework + refreshed canvas (+ paste-ready OrgCS case comment for cases) | Salesforce + Slack + Google + web | ⚠️ email draft-only; Slack summary auto-sends to internal targets only; case comment paste-ready (read-only); delegates tasks + canvas |
| `call-next-steps` | "Log my homework from this call" → due-dated Google Tasks | Gemini notes → Google Tasks | ⚠️ draft-and-confirm; writes Google Tasks only |
| `ae-syncup-channel` | "Sync the account team on a new case" → per-case Slack channel + kickoff | Salesforce + Slack | ⚠️ confirm-before-create; creates a channel + posts kickoff |
| **`brag-book`** ⭐ | "What have I contributed?" → qualitative promotion evidence in a Slack canvas | Slack + Salesforce | ⚠️ draft-and-confirm; updates a Slack canvas |
| `case-closure-hygiene` | "Is this case ready to close / why isn't it counting?" → closure SOP checklist | Salesforce | ❌ read-only advisory + draft outreach & paste-ready final case comment |

> ⭐ = **orchestrator** (routes/synthesizes; delegates the real work to the task skills). The others are single-purpose task skills.

> **Utility — `context-reset`.** One command, `/context-reset`, for the whole checkpoint → `/clear` →
> resume loop that cures a bloated, over-compacted context that has gone slow: it writes a tight
> checkpoint, you `/clear`, and a fresh window reloads only that checkpoint. Works the moment it's
> installed; an optional one-time SessionStart hook makes the resume automatic — see
> [`SETUP.md` §6](./SETUP.md#6-optional--turn-on-the-context-reset-auto-resume-hook).

> **The post-call motion.** `post-call-360` is the front door after any customer call: one paste of the Gemini notes fans out to a customer recap email (draft), an internal AE/CSM Slack summary, your homework, and a refreshed next-call canvas — and, when the call is anchored to a **case**, a paste-ready internal OrgCS case comment (Published unchecked) so the record lands on the case. Engagements (no case object) keep the Gmail draft as their record. It chains `call-next-steps` (your homework → Google Tasks), `discovery-call-canvas` in next-call mode (the persistent working canvas), and — for a brand-new case — `ae-syncup-channel` (spins up the case channel). The customer email is **never** auto-sent, and the internal summary auto-sends **only** to an internal channel you're already a member of, else it falls back to a DM or a hand-paste draft.

### Setup — one profile, filled once

Every daily-workflow skill is safe to publish because it hard-codes nothing about you: it reads your context from `~/.claude/profile.md`, which `/setup-profile` fills for you (see [First-time setup](#first-time-setup)). Beyond the auto-detected basics (`workspace_email`, `slack_user_id`, `timezone`, `orgcs_username`), a few skills read **optional, you-provide** fields — `/setup-profile` prompts for these:

| Profile field | Used by | What it is |
|---|---|---|
| `name` | `ae-syncup-channel` | the name you sign AE kickoffs with |
| `booking_link` | `post-call-360`, `ae-syncup-channel`, `case-closure-hygiene` | your self-service scheduling URL (inlined into customer/AE outreach) |
| `brag_canvas_url` | `brag-book` | your brag-book Slack canvas — create one (structure in the skill) or reuse |
| `guide_channel_id` | `brag-book` | your team's guide channel where you share content |

Each skill's `> ⚙️ Setup:` note names exactly which profile fields it reads — you never hand-edit a `SKILL.md`. (Tokens like `<Account>`, `<AE name>`, `<Case#>` inside skills are *examples*, not settings.)

> The `post-call-360` motion also uses a `Customer Next Steps` Google Tasks list — nothing to set; `call-next-steps` creates it (and remembers its id) on first run.

### Subagent discipline

All of these skills follow one rule for when to spin up a Claude Code subagent — see [`SUBAGENTS.md`](./SUBAGENTS.md). Short version: **inline by default; fan out to subagents only when the work is *big-and-offloadable* or *many-and-parallel*; never during a live customer call.** The `daily-driver` and the two `orgcs-*` / `etrab-*` skills gate their fan-out on engagement count so small runs never pay the spawn cost.

---

## Prerequisites

The skill checks these automatically on startup, but here's what you need and why:

### 1. Salesforce CLI (`sf`)

The CLI is used to authenticate to Salesforce orgs and run deployments. The skill uses it to list authenticated orgs so you can pick which customer org to inspect.

- Install: https://developer.salesforce.com/tools/salesforcecli
- Or via npm: `npm install -g @salesforce/cli`

### 2. Required Claude Code skills

These skills live at `~/.claude/skills/` and are called by `agentforce-success-guide` when needed. You don't invoke them directly — the orchestrator skill delegates to them at the right moment.

| Skill | Why it's needed | Where to get it |
|---|---|---|
| `observing-agentforce` | Powers the Observe domain — analyzes production agent sessions and surfacing quality issues | [forcedotcom/sf-skills](https://github.com/forcedotcom/sf-skills) or the sf-demo-scout plugin |
| `developing-agentforce` | Powers the Build domain — creates and modifies agents via CLI without opening a browser | [forcedotcom/sf-skills](https://github.com/forcedotcom/sf-skills) or the sf-demo-scout plugin |
| `sf-hosted-mcp` | Sets up the Salesforce Hosted MCP Server if it isn't connected yet | [ro-mo-do/sf-skills](https://github.com/ro-mo-do/sf-skills/tree/main/sf-hosted-mcp) |

To install a skill from a GitHub repo:

```bash
git clone https://github.com/forcedotcom/sf-skills.git /tmp/sf-skills
cp -r /tmp/sf-skills/skills/observing-agentforce ~/.claude/skills/observing-agentforce
cp -r /tmp/sf-skills/skills/developing-agentforce ~/.claude/skills/developing-agentforce
```

### 3. Salesforce Hosted MCP Server (`salesforce-sobject-all`)

This is the connection between Claude Code and your Salesforce org. It lets Claude query SOQL, read records, and inspect org configuration — all under your user's permissions and the org's security model.

#### Install the `sf-hosted-mcp` skill

This skill handles the full MCP setup: it creates an External Client App (ECA) in your org and registers the MCP server in Claude Code.

```bash
git clone https://github.com/ro-mo-do/sf-skills.git /tmp/ro-mo-do-sf-skills
cp -r /tmp/ro-mo-do-sf-skills/sf-hosted-mcp ~/.claude/skills/sf-hosted-mcp
```

Then restart Claude Code and run `/sf-hosted-mcp` to complete the setup.

#### Fix the `~/.claude.json` OAuth block (required)

After `sf-hosted-mcp` runs `claude mcp add`, the CLI writes an **incomplete OAuth block** — it omits `clientSecret` and `scopes`, which are both required for the Salesforce Hosted MCP Server. Without them the server will appear as "Needs authentication" with no way to connect.

Open `~/.claude.json` in your editor:

```bash
code ~/.claude.json
```

> If `code` is not found, use `open ~/.claude.json` to open it in your default editor.

Find the `salesforce-sobject-all` entry and make sure the `oauth` block has all four fields:

```json
"salesforce-sobject-all": {
  "type": "http",
  "url": "https://api.salesforce.com/platform/mcp/v1/platform/sobject-all",
  "oauth": {
    "clientId": "<YOUR-CONSUMER-KEY>",
    "clientSecret": "<YOUR-CONSUMER-SECRET>",
    "scopes": "mcp_api refresh_token offline_access",
    "callbackPort": 8082
  }
}
```

**Where to find these values:**
- `clientId` and `clientSecret` — Salesforce Setup → External Client App Manager → your ECA → OAuth Settings → click **"Click to reveal"** next to Consumer Secret
- `scopes` — use exactly `mcp_api refresh_token offline_access` (space-separated, all lowercase)
- `callbackPort` — use `8082` unless that port is already in use on your machine

Save the file, restart Claude Code, then open `/mcp` — the server should now show a **Connect** button. Complete the OAuth flow in the browser that opens.

---

## Installation

Install one skill or all of them at once:

```bash
git clone https://github.com/joseantoniorodriguezSFDC/sf-skills.git /tmp/josea-sf-skills

# Install agentforce-success-guide
cp -r /tmp/josea-sf-skills/skills/agentforce-success-guide ~/.claude/skills/agentforce-success-guide

# Install sf-feature-research
cp -r /tmp/josea-sf-skills/skills/sf-feature-research ~/.claude/skills/sf-feature-research

# Or install the whole daily-driver toolkit at once
cp -r /tmp/josea-sf-skills/skills/* ~/.claude/skills/
```

Then restart Claude Code. The skills are available immediately as:

```
/setup-profile
/agentforce-success-guide
/sf-feature-research
/daily-driver
/salesforce-tool-router
/gmail-priority-check
/calendar-agenda
/orgcs-case-age
/orgcs-engagement-nudge
/etrab-weekly-note
/discovery-call-canvas
/post-call-360
/call-next-steps
/ae-syncup-channel
/brag-book
/case-closure-hygiene
/context-reset
```

> After installing the daily-workflow skills, run `/setup-profile` once to fill `~/.claude/profile.md` — every skill reads its context from there (see *Setup — one profile, filled once* above). Most skills also need the relevant read-only MCP servers connected (Salesforce support/CRM org, Google Workspace, Slack) — each skill's *Prerequisites* section lists exactly which.

---

## Usage

Once installed, type `/agentforce-success-guide` in Claude Code to start a session. The skill will:

1. Check all prerequisites and surface any blockers
2. Show you a list of authenticated Salesforce orgs to pick from
3. Confirm the MCP server is pointed at the right org
4. Wait for your instruction — then run Discover, Audit, Observe, or hand off to Build

---

## Security note

The `~/.claude.json` file contains your MCP OAuth credentials including the Consumer Secret. **Do not commit that file to git.** This repo contains only the skill definition — no credentials, no org-specific data.
