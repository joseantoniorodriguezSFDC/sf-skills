# sf-skills

Claude Code skills for Salesforce **Success Architects and Success Guides** working with Agentforce customers.

Built by Jose Antonio Rodriguez — Success Guide, Agentforce Service.

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

**Need help with the installation?** Use the [Claude Code Installation Slackbot](https://salesforce.enterprise.slack.com/docs/T01G0063H29/F0AU63M26DB) — it guides you step by step through the full Claude Code and skills setup process.

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

Beyond the two Agentforce skills above, this repo now ships the **daily-driver toolkit** — the read-only skills a Success Guide leans on every day, plus two top-level orchestrators that decide *which* tool to use. These are templatized: any personal value (Slack id, workspace email, org, timezone, canvas id) appears as a `<PLACEHOLDER>` you fill in once. Each skill carries a `> ⚙️ Setup:` note at the top listing exactly what to replace.

| Skill | What it answers | Sources | Writes? |
|---|---|---|---|
| **`daily-driver`** ⭐ | "Catch me up — what needs me today?" Orchestrates the four lanes below into one picture | all of the below | ❌ read-only (nudges are draft-and-confirm) |
| **`salesforce-tool-router`** ⭐ | "How do I do X in Salesforce from here?" Routes any SF task to MCP vs CLI vs the right skill + org | routing only | ❌ routes, doesn't act |
| `gmail-priority-check` | "Which email actually needs me?" | Gmail | ❌ read-only |
| `calendar-agenda` | "What meetings do I have?" | Google Calendar | ❌ read-only |
| `orgcs-case-age` | "Which cases has the customer gone quiet on?" | Salesforce (support org) | ❌ detect + alert |
| `orgcs-engagement-nudge` | "Which engagements are waiting on a nudge?" | Salesforce + Slack | ⚠️ draft-and-confirm nudge only |
| `etrab-weekly-note` | Per-account weekly status notes, follow-on to the last one | Salesforce + Slack + Gmail | ❌ read-only (drafts to paste) |
| `discovery-call-canvas` | Turn an account/case into a discovery-prep Slack canvas | Salesforce + Slack + web | ✅ creates a Slack canvas only |

> ⭐ = **orchestrator** (routes/synthesizes; delegates the real work to the task skills). The others are single-purpose task skills.

### Setup — fill in your placeholders

Every daily-workflow skill is safe to publish because personal values are placeholders. After copying a skill into `~/.claude/skills/`, open its `SKILL.md` and replace:

| Placeholder | Your value |
|---|---|
| `<YOUR_SLACK_USER_ID>` | your Slack member id (Slack profile → ⋯ → *Copy member ID*) |
| `<YOUR_WORKSPACE_EMAIL>` | the email your Google Workspace / Slack MCP is authenticated as |
| `<YOUR_STORM_ORG>` | your demo/CLI org alias |
| `<YOUR_WEEKLY_CANVAS_ID>` | the Slack canvas id you keep your weekly rollup in (or create one) |
| `<your timezone>` | your IANA timezone (e.g. `America/New_York`) |
| `<CHANNEL_ID>`, `<Account>`, `<AE name>`, `<Case#>`, `<ENG-id>` | these are only in *examples* — no need to change |

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
```

> After installing any daily-workflow skill, open its `SKILL.md` and fill in the `<PLACEHOLDER>` values (see the *Setup* table above). Most skills also need the relevant read-only MCP servers connected (Salesforce support/CRM org, Google Workspace, Slack) — each skill's *Prerequisites* section lists exactly which.

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
