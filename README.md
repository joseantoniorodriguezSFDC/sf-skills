# sf-skills

Claude Code skills for Salesforce **Success Architects and Success Guides** working with Agentforce customers.

Built by Jose Antonio Rodriguez — Success Guide, Agentforce Service.

---

## Skills

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

If you don't have it set up yet, run `/sf-hosted-mcp` after installing that skill — it walks you through creating the External Client App (ECA) in your org and registering the MCP server in Claude Code.

**Important:** After running `claude mcp add`, you must manually edit `~/.claude.json` to add the `clientSecret` and `scopes` fields to the OAuth block — the CLI does not add them automatically. The `sf-hosted-mcp` skill explains this step in detail.

---

## Installation

```bash
git clone https://github.com/joseantoniorodriguezSFDC/sf-skills.git /tmp/josea-sf-skills
cp -r /tmp/josea-sf-skills/skills/agentforce-success-guide ~/.claude/skills/agentforce-success-guide
```

Then restart Claude Code and run:

```
/agentforce-success-guide
```

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
