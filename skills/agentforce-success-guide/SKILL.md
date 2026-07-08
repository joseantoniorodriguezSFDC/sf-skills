---
name: agentforce-success-guide
description: "Success Guide orchestrator for Agentforce via MCP. TRIGGER when: user wants to discover agents in a Salesforce org, audit agent permissions or beta perms, observe production agent health, or needs a Headless 360 coaching narrative for a customer. DO NOT TRIGGER when: user is building or modifying an .agent file (use developing-agentforce), running test specs (use testing-agentforce), or setting up the MCP connection itself (use sf-hosted-mcp)."
metadata:
  type: orchestrator
  version: "1.1"
  last_updated: "2026-05-29"
  author: "Jose Antonio Rodriguez — Success Guide, Agentforce Service"
  audience: "Success Guides coaching customers on Agentforce"
---

# Agentforce Success Guide Skill

## Purpose

This skill is the front door for Success Guides running Agentforce coaching sessions with customers. It uses the Salesforce Hosted MCP Server (`sobject-all`) to inspect the customer's org directly from Claude Code — no browser, no Setup clicks — and delivers the full **Headless 360 story**: Agentforce investment is not locked to the Salesforce UI.

Three things this skill does:

1. **Discover** — inventory every agent in the org: what's deployed, what's active, what topics and actions each agent has
2. **Audit** — diagnose why an agent is broken or invisible: missing permissions, inactive status, missing beta perms, no Einstein Agent User
3. **Observe** — surface production health of a specific agent: session quality, failures, misroutes — delegates to `observing-agentforce`

When the customer wants to go further and build or modify an agent, hand off to `developing-agentforce`.

---

## Prerequisites

Before running any domain, run through all steps in order. Do not skip even if the user says "just show me the agents."

### Step 0 — Dependency Check

Run all checks below before anything else. Present a single pass/fail summary and stop if any blocker is unresolved.

#### 0.1 — Salesforce CLI

```bash
sf --version
```

If the command errors or is not found: the Salesforce CLI is not installed. Direct the user to install it:
- Via the official installer: https://developer.salesforce.com/tools/salesforcecli
- Or via npm: `npm install -g @salesforce/cli`

If installed but outdated (the CLI prints an update warning): run `sf update` before continuing.

#### 0.2 — Required skills

Check that the following skills are installed at `~/.claude/skills/` (user scope):

```bash
ls ~/.claude/skills/
```

| Skill | Used for | Install source |
|---|---|---|
| `observing-agentforce` | Domain 3 — production session analysis | [forcedotcom/sf-skills](https://github.com/forcedotcom/sf-skills) or Scout plugin |
| `developing-agentforce` | Domain 4 — build/modify agents | [forcedotcom/sf-skills](https://github.com/forcedotcom/sf-skills) or Scout plugin |
| `sf-hosted-mcp` | MCP setup if connection is missing | [ro-mo-do/sf-skills](https://github.com/ro-mo-do/sf-skills/tree/main/sf-hosted-mcp) |
| `generating-mermaid-diagrams` | Optional — agent map diagrams | Salesforce skills library |

If any required skill is missing, install it:

```bash
# Example: install observing-agentforce from forcedotcom/sf-skills
git clone https://github.com/forcedotcom/sf-skills.git /tmp/sf-skills
cp -r /tmp/sf-skills/skills/observing-agentforce ~/.claude/skills/observing-agentforce
```

Skills can also come from the **sf-demo-scout plugin** if it is installed — check `~/.claude/plugins/` for Scout. If Scout is present, its versions of `observing-agentforce` and `developing-agentforce` are available as `sf-demo-scout:observing-agentforce` and `sf-demo-scout:developing-agentforce` and are equivalent.

#### 0.3 — Salesforce Hosted MCP Server (`salesforce-sobject-all`)

Run `claude mcp list` and check for a server pointing to `https://api.salesforce.com/platform/mcp/v1/platform/sobject-all`.

**States and actions:**

| State | Action |
|---|---|
| `✓ Connected` | Proceed |
| `! Needs authentication` | Open `/mcp` in Claude Code and click Connect next to the server to complete OAuth |
| Missing entirely | Follow the setup flow below |

**If the server is missing — full setup flow:**

**Step 1:** Install the `sf-hosted-mcp` skill if not already present (see 0.2), then run `/sf-hosted-mcp`. This skill creates the External Client App (ECA) in your Salesforce org and registers the MCP server in Claude Code.

**Step 2:** After `/sf-hosted-mcp` completes, the `claude mcp add` command it runs writes an **incomplete OAuth block** — Salesforce Hosted MCP requires `clientSecret` and `scopes` which the CLI does not add automatically. Without these the server will show `! Needs authentication` and the Connect prompt will not appear.

Fix this by opening `~/.claude.json` directly:

```bash
code ~/.claude.json
```

> If `code` is not found, use `open ~/.claude.json` (opens in default editor) or `nano ~/.claude.json`.

Find the `salesforce-sobject-all` entry under `mcpServers` and ensure the `oauth` block contains all four fields:

```json
"salesforce-sobject-all": {
  "type": "http",
  "url": "https://api.salesforce.com/platform/mcp/v1/platform/sobject-all",
  "oauth": {
    "clientId": "<CONSUMER-KEY>",
    "clientSecret": "<CONSUMER-SECRET>",
    "scopes": "mcp_api refresh_token offline_access",
    "callbackPort": 8082
  }
}
```

**Where to find these values:**
- `clientId` and `clientSecret` — Salesforce Setup → External Client App Manager → your ECA → Settings → OAuth Settings → click **"Click to reveal"** next to Consumer Secret
- `scopes` — use exactly `mcp_api refresh_token offline_access` (space-separated, all lowercase)
- `callbackPort` — use `8082` unless that port is already in use on your machine

**Step 3:** Save the file, then restart Claude Code. On relaunch, open `/mcp` — the server should now show a Connect button. Complete the OAuth flow in the browser that opens.

> **Security note:** `~/.claude.json` contains your Consumer Secret in plain text. Do not commit this file to git or share it.

#### 0.4 — Dependency check summary

Present before proceeding:

```
Dependency Check
──────────────────────────────────────────────────
✅ Salesforce CLI        sf 2.x.x
✅ observing-agentforce  ~/.claude/skills/
✅ developing-agentforce ~/.claude/skills/
✅ sf-hosted-mcp         ~/.claude/skills/
✅ MCP (sobject-all)     Connected
──────────────────────────────────────────────────
```

Only proceed past Step 0 when all items are green. For any red item, resolve it with the user before continuing.

---

### Step 1 — Org Selection

Run `sf org list --json` to get all authenticated orgs. Present them as a numbered list showing alias, username, instance URL, and connected status:

```
Authenticated orgs:
  1. customer-demo     admin@acme-demo.salesforce.com       Connected
  2. my-sandbox        me@company.sandbox.salesforce.com    Connected
  3. old-org           me@company.salesforce.com            Unreachable

Which org do you want to use? (enter number, or 'new' to log into a new org)
```

**If the user picks an existing org:**
- Run `sf config set target-org <alias> --global` to set it as default
- Note: The MCP server (`salesforce-sobject-all`) is always connected to whichever org it last authenticated against. If the user switches to a different org than what MCP is connected to, warn them:
  > "The MCP server is still connected to the previous org. To switch it, restart Claude Code after selecting the new org — otherwise agent data will come from the wrong org."
- To verify which org MCP is actually reading from, call `getUserInfo` (MCP) and compare the username against the selected org.

**If the user picks 'new':**
- Ask whether it's a production/developer org or a sandbox
- For production: `sf org login web --alias <alias> --set-default`
- For sandbox: `sf org login web --alias <alias> --instance-url https://test.salesforce.com --set-default`
- After login, check whether an ECA and MCP connection already exist for this org. If not, direct the user to `/sf-hosted-mcp` to set it up before continuing.

**If no orgs are authenticated at all:**
- Direct the user to `/sf-hosted-mcp` — that skill handles the full first-time setup.

### Step 2 — Confirm org via MCP

After org selection, call `getUserInfo` (MCP) to confirm the MCP server is reading from the correct org. Present:
- Org / company name
- Username
- Profile and role

If the username does not match the selected org, the MCP server is still pointed at a previous org. Warn the user and ask them to restart Claude Code before proceeding.

### Step 3 — SFDX project check

Check for `sfdx-project.json` in the working directory. Required only for Observe and Build domains — note if absent but do not block Discover or Audit.

---

## Headless 360 Framing (use this with customers)

Before diving into technical output, frame what's happening:

> "What you're seeing right now is Headless 360 in action. Claude is reading your Salesforce org directly through the MCP Server — the same agent you've been configuring in Setup is visible and queryable here, with no browser required. This is what 'the API is the UI' means in practice."

Key talking points to weave in throughout the session:

- **MCP = the "in"**: external AI clients (Claude, Cursor, ChatGPT) connecting to Salesforce via governed, auditable API calls
- **Every call inherits FLS, sharing rules, and object permissions** — the audit trail shows your name, not "Claude"
- **This is included in Enterprise Edition+** — no extra SKU, no Flex Credits for standard CRM read/write
- **Invoking an agent via MCP, querying Data Cloud, or running Prompt Builder consumes Flex Credits** — flag this proactively

---

## Domain 1: Discover

**Trigger phrases:** "show me the agents", "what agents do we have", "what's deployed", "agent inventory"

### Step 1 — Inventory all agents

Use `soqlQuery` (MCP) to pull the full agent inventory:

```soql
SELECT Id, MasterLabel, DeveloperName, Status, Type, Description
FROM BotDefinition
ORDER BY MasterLabel ASC
```

Present as a table:

| Agent Name | API Name | Type | Status | Description |
|---|---|---|---|---|
| ... | ... | ... | Active / Inactive | ... |

Flag any agents with `Status = 'Inactive'` — these are invisible to end users and to MCP invocation.

### Step 2 — Topics per agent

For each agent the user wants to inspect, pull topics:

```soql
SELECT Id, MasterLabel, DeveloperName, Description, SortOrder
FROM BotTopic
WHERE BotDefinitionId = '<ID>'
ORDER BY SortOrder ASC
```

### Step 3 — Actions per topic

```soql
SELECT Id, MasterLabel, Type, ActionName, ActionType
FROM BotTopicDefinition
WHERE BotTopicId = '<ID>'
ORDER BY MasterLabel ASC
```

### Step 4 — Present agent map

After collecting topics and actions, present a clean summary:

```
Agent: <MasterLabel> (<DeveloperName>) — <Status>
  Topics:
    └─ <TopicName>
         Actions: <Action1>, <Action2>, ...
```

If the user wants a Mermaid diagram of the agent structure, delegate to `generating-mermaid-diagrams`.

### Step 5 — MCP discoverability note

Explain to the customer:

> "Agents built in Agentforce Studio (Agent Script architecture) are not yet MCP-invocable as of May 2026 — engineering is actively working on it. Agents in the legacy Setup → Agentforce Agents list are the ones visible here. If an agent you expect to see is missing, check whether it was built in Agent Studio."

---

## Domain 2: Audit

**Trigger phrases:** "why isn't the agent working", "agent is missing", "permission error", "audit", "what's blocking this agent", "beta perms"

This is the highest-value domain for customer coaching. A broken agent almost always has one of five root causes. Work through them in order.

### Check 1 — Agent status

```soql
SELECT Id, MasterLabel, DeveloperName, Status
FROM BotDefinition
WHERE DeveloperName = '<AgentApiName>'
```

If `Status != 'Active'`: the agent is not live. It must be activated in Setup → Agentforce Agents → Activate, or via `sf agent activate --api-name <name>`.

### Check 2 — Einstein Agent User (Service agents only)

Service agents require a dedicated Einstein Agent User. Query for it:

```soql
SELECT Id, Username, IsActive, UserType
FROM User
WHERE UserType = 'CsnOnly'
   OR Username LIKE '%einstein%'
   OR Username LIKE '%agent%'
ORDER BY CreatedDate DESC
LIMIT 10
```

If none found: the agent cannot run. Guide the user to create one — or delegate to `developing-agentforce` (Section 3 of the Create Agent workflow covers Einstein Agent User creation via CLI).

If found but `IsActive = false`: reactivate the user in Setup.

### Check 3 — Required permission sets on the Einstein Agent User

The Einstein Agent User needs specific object and field permissions. Check what permission sets are assigned:

```soql
SELECT PermissionSet.Name, PermissionSet.Label
FROM PermissionSetAssignment
WHERE AssigneeId = '<EinsteinAgentUserId>'
```

If `EinsteinAgentUser` or equivalent permission set is missing, the agent silently fails on all actions. Flag it clearly.

### Check 4 — Beta permission flags (MCP + Agentforce via MCP)

If the customer is trying to invoke agents via MCP (not just read/write CRM data), four beta permission flags must be enabled via the Black Tab (Setup → Critical Updates or Feature Management):

| Permission | Required for |
|---|---|
| `AgentforceMcpSupportPilot` | Agentforce agents discoverable via MCP |
| `MCPService` | MCP service layer activation |
| `ModelContextProtocolSupport` | MCP protocol support |
| `ApiCatalogMcpPilot` | API Catalog MCP server activation |

Query whether these are enabled:

```soql
SELECT Id, SettingName, SettingValue
FROM OrganizationFeaturePreference
WHERE SettingName IN (
  'AgentforceMcpSupportPilot',
  'MCPService',
  'ModelContextProtocolSupport',
  'ApiCatalogMcpPilot'
)
```

If the query returns no rows or `SettingValue = false` for any: present a clear checklist of what's missing and where to enable each one.

### Check 5 — Object and field permissions for agent actions

For each action the agent needs to execute, check whether the Einstein Agent User has the right object permissions. For a Service Agent reading Cases:

```soql
SELECT SobjectType, PermissionsRead, PermissionsCreate, PermissionsEdit
FROM ObjectPermissions
WHERE ParentId IN (
  SELECT PermissionSetId
  FROM PermissionSetAssignment
  WHERE AssigneeId = '<EinsteinAgentUserId>'
)
AND SobjectType IN ('Case', 'Contact', 'Account')
```

If `PermissionsRead = false` on an object the agent queries: the action returns empty results silently (no error). This is a common and hard-to-diagnose failure — call it out explicitly.

### Audit summary output

After all five checks, present a clear pass/fail table:

```
Audit Results — <AgentName>
─────────────────────────────────────────────────
✅ Agent Status:         Active
❌ Einstein Agent User:  Not found — BLOCKING
✅ Permission Sets:      Assigned
⚠️  Beta Perms (MCP):    AgentforceMcpSupportPilot missing
✅ Object Permissions:   Case ✅  Contact ✅  Account ✅
─────────────────────────────────────────────────
Blockers: 2  |  Warnings: 0
```

For each blocker, provide the exact remediation step. For MCP-related blockers, frame it as part of the Headless 360 story: "These permissions unlock the full Headless 360 architecture for this customer."

---

## Domain 3: Observe

**Trigger phrases:** "how is the agent performing", "is the agent working well", "session quality", "what are users asking", "agent failures", "production issues"

This domain delegates entirely to `observing-agentforce`. Before delegating:

1. Confirm the agent name — run Discover first if needed to get the exact `DeveloperName`
2. Confirm whether Data Cloud / STDM is available in the org (query `ssot__AiAgentSession__dlm` — if it errors, `observing-agentforce` will fall back to local trace analysis)
3. Hand off with this context:
   - Org alias
   - Agent `DeveloperName`
   - Whether SFDX project is present locally
   - Any specific sessions or timeframe the customer wants to focus on

Frame the observation for the customer:

> "We're now going to look at how real users have been interacting with this agent. Every session is logged — we can see what users asked, how the agent routed each request, whether actions executed correctly, and where conversations broke down. This is the observability story that's built into Agentforce."

After `observing-agentforce` completes its analysis, return here to summarize findings in coaching language — not engineering language — for the customer.

---

## Domain 4: Build / Modify (Hand-off)

**Trigger phrases:** "let's build an agent", "create a new agent", "modify the agent", "add a topic", "change what the agent does"

Do not attempt to build agents directly. Hand off to `developing-agentforce` with this context:

- Whether this is a new agent or modification of existing
- The agent's `DeveloperName` (from Discover) if modifying
- What the customer needs the agent to do (in plain language)
- Whether a Service or Employee agent is needed
- What backing logic already exists (run the scan from Discover domain first)

Frame the handoff:

> "Now we're going to use Agentforce Agent Script to build this directly from the terminal. Every change we make here gets deployed to your org via Headless 360 — no browser, no clicking through Setup. Watch the change log as it builds."

---

## Coaching Narrative Arc (full session flow)

For a complete customer coaching session, run the domains in this order:

```
1. Verify MCP connection + confirm org  (Prerequisites)
        ↓
2. Discover — show the full agent inventory  (Domain 1)
   "Here's everything deployed in your org right now."
        ↓
3. Audit — pick the agent they care most about  (Domain 2)
   "Let's check why this one isn't working / confirm it's healthy."
        ↓
4. Observe — surface production performance  (Domain 3 → observing-agentforce)
   "Here's how real users are interacting with it."
        ↓
5. Build / Iterate — if they want to improve it  (Domain 4 → developing-agentforce)
   "Let's fix that routing issue / add the billing topic right now."
        ↓
6. Wrap up — Headless 360 summary
   "Everything you just saw — inventory, health check, live session data,
    and the deploy — happened without opening a browser. That's Headless 360."
```

This arc works for both:
- **Live customer calls** (use Domains 1–3; Domain 4 only if time permits and customer is engaged)
- **Async coaching prep** (run all 4 domains; use output as briefing material for the call)

> **Live calls stay sequential and narrated — do not parallelize them.** The demo's value is the customer watching each phrase land in real time; orchestration is invisible to them and only adds cost. The fan-out below is for prep only.

---

## Prep Mode — Whole-Org Fan-Out (Workflow)

**Trigger phrases:** "prep me for the &lt;customer&gt; call", "audit the whole org", "brief me on every agent", "run a full 360 prep"

When the Success Guide is preparing **async** (no customer watching) and the org has **more than ~3 agents**, the serial arc above is slow. Use the bundled workflow to discover, audit, and observe every agent **concurrently**, then synthesize one briefing.

This is a headless fan-out, so it runs **only after** the interactive steps that a workflow cannot do itself:

1. Complete **Step 0–3** (dependency check, org selection, `getUserInfo` confirmation) in this session as normal.
2. Run **Domain 1, Step 1** once to get the agent list (the `BotDefinition` inventory).
3. Probe STDM availability once: attempt `SELECT Id FROM ssot__AiAgentSession__dlm LIMIT 1` via MCP. If it errors, STDM is unavailable.
4. Invoke the workflow, passing the confirmed context in as `args`:

```
Workflow({
  scriptPath: "~/.claude/skills/agentforce-success-guide/workflows/agentforce-360-prep.js",
  args: {
    agents: [ { id, developerName, masterLabel, status, type }, ... ],  // from Domain 1 Step 1
    hasStdm: true,                  // false if the STDM probe errored
    orgAlias: "<selected alias>",
    org: "<username from getUserInfo>"
  }
})
```

The workflow pipelines each agent through **Discover → Audit → Observe** independently, then runs one synthesis pass (the only barrier) to produce a customer-facing briefing. When `hasStdm` is `false`, the Observe stage is skipped org-wide rather than failing per agent — matching Domain 3's fallback behavior.

When it returns, present the `headline` and the per-agent table in coaching language. The customer's "findings → shareable Slack canvas" combo still works: pass the returned briefing to the Slack MCP server to author a canvas.

> **When NOT to use this:** live customer calls (keep them sequential), or orgs with 1–2 agents (fan-out overhead isn't worth it — run the arc serially). The MCP server is single-org; the workflow trusts the org you confirmed in Step 2 and never switches it.

---

## Output Standards

- Always present data as tables, not raw SOQL output
- Always translate technical findings into customer-facing language alongside the technical detail
- Always include a "what this means for the customer" line after each domain completes
- Flag Flex Credit implications before any action that would invoke an agent or query Data Cloud
- Never expose access tokens, consumer keys, or org IDs beyond what's needed for the session

---

## Skill Delegation Map

| Need | Skill | When |
|---|---|---|
| Observe production sessions | `observing-agentforce` | Domain 3 |
| Build or modify an agent | `developing-agentforce` | Domain 4 |
| Set up MCP connection | `sf-hosted-mcp` | Prerequisites fail |
| Generate architecture diagram | `generating-mermaid-diagrams` | Agent map visualization |
| Run Apex tests on backing logic | `running-apex-tests` | After build |
| SOQL query optimization | `querying-soql` | Complex inventory queries |
| Whole-org concurrent prep | `workflows/agentforce-360-prep.js` | Prep Mode, orgs with >3 agents |

---

## Known Limitations (be transparent with customers)

| Limitation | Status | Workaround |
|---|---|---|
| Agent Script agents (Agentforce Studio) not MCP-invocable | Not GA as of May 2026 | Verify agent appears in Setup → Agentforce Agents legacy list |
| Invoking agents via MCP requires 4 beta perms | Beta | Run Audit → Check 4 to verify and remediate |
| Invoking agents via MCP costs Flex Credits | GA behavior | Warn before any invocation; standard CRM read/write is free |
| STDM session data requires Data Cloud | GA | `observing-agentforce` falls back to local trace analysis if unavailable |
| Prep-mode workflow is async-only and token-heavy | By design | Use for orgs with >3 agents; run the serial arc for live calls and 1–2 agent orgs |
| Workflow cannot select/switch orgs | By design | It trusts the org confirmed in Step 2; complete Step 0–3 interactively before invoking |
