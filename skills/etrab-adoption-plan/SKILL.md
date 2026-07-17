---
name: etrab-adoption-plan
description: Build an ETRAB (Easy to Resolve AI Blockers) adoption plan for a Success Guide engagement. Given an engagement (Playbook id, OrgCS URL, or name), it pulls the engagement record from OrgCS, reads the AE handoff/business-challenge notes in the engagement's Slack channel, applies the ETRAB canvas methodology + Adoption Blocker reference table, maps each customer blocker to a guide action (hand-to-hand by default; on engagements the Guide may take on simple, feasible implementation at the SG's discretion — ask about scope first), and produces a structured adoption plan + a pre-filled weekly ETRAB task entry. Optionally saves the plan to a Google Doc. Read-only on OrgCS.
---

# ETRAB Adoption Plan Builder

## Purpose

Turn a single ETRAB engagement into an actionable **adoption plan**. The Success Guide is the *delivery engine / guide* — we **identify blockers and work hand-to-hand with the customer and partner to remove them.** The plan reflects that: every blocker gets a *guide action* (coach, reproduce, configure-together, escalate) and a named *executor*. The executor is usually the customer admin / partner / AE — **but on an engagement the Guide may take it on directly** for simple, feasible tasks that don't require a complex implementation. That's a discretionary call, made by **asking about scope up front and then deciding together** — not a default, and unlike **cases**, which are strictly guide-only ([[feedback-sg-guide-not-implement]]).

ETRAB = **Easy to Resolve AI Blockers** — a proactive Agentforce-adoption program for accounts flagged as "stuck in the *used* phase." See [[etrab-engagement-skill]].

> **OrgCS MCP is read-only.** This skill never writes to Salesforce — it reads the engagement, the linked Slack channel, and the related case. Outputs (Google Doc, weekly-task text) are produced for the user to paste in. See [[orgcs-mcp-readonly]].

> Companion skill: [[orgcs-engagement-nudge]] handles follow-up cadence across all engagements; this skill builds the delivery plan for one.

---

## Prerequisites

- **OrgCS MCP connected** — `getUserInfo` returns a `@orgcs.com` username. If not, auth at `/mcp` via the orgcs custom domain (see [[orgcs-mcp-readonly]]).
- **Slack MCP connected** — needed to read the engagement channel for the AE's handoff notes. If down, build the plan from the engagement record alone and flag that channel context is missing.
- **Google Workspace MCP** (optional) — only if saving the plan to a Doc. If it errors with a connection/EOF, it's the known gateway outage → suggest `/mcp reconnect` (see [[gworkspace-mcp-gateway-outage]]).

---

## Inputs

| Input | How to resolve |
|---|---|
| **Engagement** (required) | A Playbook id (`aB6Hx…`), an OrgCS URL (`…/csc__Playbook__c/<id>/view`), or an engagement name. From a URL, extract the 18/15-char id between `csc__Playbook__c/` and `/view`. From a name, find it via SOQL (Step 1). |
| **Extra notes** (optional) | The user may paste AE notes directly; still read the channel to corroborate/augment. |
| **Persist target** (optional) | Google Doc (default offer), or just return inline. Ask once if unspecified. |

---

## Step 1 — Pull the engagement record (OrgCS, read-only)

Query `csc__Playbook__c` for the engagement. These fields carry the plan-relevant context (verified Jun 2026):

```soql
SELECT Id, Name, cssf_Account_Name__c, csc__Account__c,
       csc__Playbook_Status__c, csc__Stage__c, cssf_Intent__c,
       Customer_Readiness__c, cssf_Business_Challenges__c, cssf_Comments__c,
       Customer_Use_Case__c, Agent_Type__c, cssf_Recommendations__c,
       cssf_Priority__c, csc__Start_Date__c, csc__End_Date__c,
       Target_Activation_Date__c, Target_Usage_Date__c,
       cssf_Days_to_Renewal__c, Age__c, csc_Last_Activity_Date__c,
       csc_Next_Task_Due_Date__c, cssf_Engagement_Owner_Name__c,
       cssf_Delivery_Language__c, Program__c, Consumption_Plan__c, cssf_On_Hold__c
FROM csc__Playbook__c
WHERE Id = '<engagementId>'
```

By name instead of id: `WHERE Name LIKE '%<token>%' AND csc__Stage__c != 'Closed'` and disambiguate if >1.

- `cssf_Business_Challenges__c` is **rich-text HTML** — strip tags to read it. This is usually the AE's full handoff (account background, why-stuck, issues, contacts).
- Note **`cssf_Delivery_Language__c`** — if it's English but the account is non-English-speaking (often visible in the notes), flag delivering in the customer's language.
- Watch for **date conflicts**: `cssf_Days_to_Renewal__c` vs. an expiry date mentioned in the notes. If they disagree, flag it — the renewal/expiry date usually drives the whole plan's urgency, so it must be confirmed with the AE.
- `csc__Stage__c`/`cssf_Intent__c` confirm this is a Delivery / Adoption engagement.

## Step 2 — Read the engagement's Slack channel for AE handoff notes

Engagement channels follow `ZC:<channelId>:<Engagement Name>` (the channel id is the **middle colon-segment**). Find it with `slack_search_channels` on the engagement name (account token), `channel_types: "public_channel,private_channel"`, then `slack_read_channel` (newest first, ~30). Capture:
- the **AE's handoff message** (business challenges, background, key contacts, partner, churn/renewal risk),
- any **customer or partner replies** that add detail,
- ignore join/leave + bot system messages.

If the record's Business Challenges already contains the full notes, use the channel to corroborate and pick up anything newer. If no channel is found, proceed from the record and flag it.

## Step 3 — Load the ETRAB methodology + blocker reference

The ETRAB process canvas is Slack canvas **`F0B1M4T3CGK`** (`slack_read_canvas`). It defines the guide role, the weekly-update task template, and the Adoption Blocker reference table. Read it when available; the essentials are embedded below so the skill works even if the read fails.

**Guide role:** *"You are the delivery engine — engage to understand blockers, remove blockers, set the customer up for success."* Weekly updates are captured in a single recurring **"Weekly Agent Updates"** Task on the engagement. **A separate engagement is created per agent.**

**Adoption Blocker reference table** (map customer issues to these; free-text, not word-for-word):

| Adoption Blocker | What to look out for |
|---|---|
| Agent Behavior Configuration | Agent activity dropped; agent quality; widget not surfacing |
| Configuration or Tech Debt | Technical issues blocking scale; stalled launch; broken feature |
| Consumption Challenges / Missing Licensing or Credits | Consumption-model frustration; surplus/unused credits; partner consumption confusion |
| Dependency Issues (Data, BUs, etc.) | Low adoption from broad platform struggles |
| Governance or Change Management | Customer non-responsive; focus shifted away from Agentforce |
| Lack of Executive or Project Owner | Non-responsive to outreach; partner-led stalled adoption |
| Legal/Compliance Challenges | Security/compliance concerns blocking rollout |
| Unskilled Resources | Knowledge gaps; resource/bandwidth constraints delaying rollout |
| Use Case Identification / Unknown Value or Outcomes | Disengaged after deploy; no active usage; value not proven |

**Weekly task Notes template** (global date format DD/MM):
```
DATE: DD/MM
AT RISK?: YES/NO
OVERALL HEALTH: On Track · At Risk · Blocked · No Update Today
CUSTOMER SENTIMENT: Positive · Neutral · Frustrated · Unknown
TODAY'S UPDATE: <what you did / what the customer did>
CUSTOMER BLOCKERS: <from the reference table; free text>
PRODUCT GAP AND ASK: <detailed product gap, if any>
NEXT STEPS: <single next action, e.g. "Review sync config Thu 12/06">
```

## Step 4 — Map blockers → guide actions (the core)

From the notes, extract each concrete customer issue and build a **blocker map** row:

`Issue → ETRAB blocker category → Guide action (hand-to-hand) → Executor`

Rules:
- **Guide first; implement only by exception.** Default to hand-to-hand phrasing — "working session to configure *with* the admin", "reproduce on screen-share", "guide the handoff setup", "define metrics", "escalate / log Product Gap." The Guide may own a build/deploy step directly **only** when it's simple, feasible, and non-complex — and only after asking about scope and agreeing to it ([[feedback-sg-guide-not-implement]]). Don't default to "I will build X."
- If an issue looks like a missing/absent product capability (not just misconfiguration), mark it a **candidate Product Gap** — reproduce first, then escalate; don't burn the engagement assuming it's user error.
- Name the **executor** for each row (customer admin, partner, AE — or the Guide when a simple task is taken on by exception).
- Pull **stakeholders** (champion, admin, partner PM, AE) and any **credit/renewal items** out as their own threads.

## Step 5 — Assemble the adoption plan

Produce these sections (tables welcome; keep it tight and skimmable):

1. **Engagement snapshot** — account, stage/intent/status, window (start→due), agent, why-ETRAB, business driver (renewal/expiry), + early flags (delivery language, date conflicts).
2. **Goal / definition of success** — one paragraph: move from stuck → actively consuming, tied to the business driver.
3. **Blocker map** — the Step-4 table. This is the heart.
4. **Phased plan** — fit phases to the engagement window (e.g. a ~4-week sprint to a renewal): Align & diagnose → unblock the highest-leverage item first → secondary fixes → prove value & set up renewal.
5. **Success metrics** — baseline → target table (use real baseline numbers from the notes when present).
6. **Stakeholders** — name, role, email.
7. **Top risks** — timeline, partner dependency, product-gap uncertainty, etc.
8. **Pre-filled Week-1 weekly-task entry** — the Step-3 template filled from this engagement, in a code block so it pastes cleanly into the OrgCS task (we can't write it for them — OrgCS is read-only).

## Step 6 — Persist (optional)

If the user wants it saved, create a **Google Doc** (`create_doc`) titled `<Account> — ETRAB Adoption Plan` with a plain-text rendering of the plan, and return the link. (Drafts/notes meant for copy-paste: plain text or code blocks, **no `>` blockquotes** — the `▎` marker breaks copy-paste; see [[draft-formatting-no-blockquotes]].)

---

## Output Standards

- Lead with the snapshot + goal, then the **blocker map** (the deliverable), then plan/metrics/stakeholders/risks, then the paste-ready weekly task.
- Every blocker row must have a **guide action** and a **named executor** — default the executor to the customer/partner/AE; the Guide takes one on only by the simple-task exception ([[feedback-sg-guide-not-implement]]).
- Confirm, don't assume, the **renewal/expiry date** when sources disagree — flag it as the first thing to verify.
- Respect CSG/Claude data-handling before putting customer content anywhere external (Google Doc, etc.).
- Read-only on OrgCS; the only writes are the Google Doc and what the user pastes themselves.

## Known Limitations

| Limitation | Status | Workaround |
|---|---|---|
| Channel discovery relies on the `ZC:<id>:<Name>` convention | By design | If no match, build from the record + flag |
| Engagement channels are private | Platform | Slack MCP user must be a member to read |
| Business Challenges is HTML rich-text | — | Strip tags before reading |
| Renewal date may conflict between field and notes | Common | Flag and confirm with the AE — don't pick silently |
| Canvas read can fail (Slack outage) | — | Embedded blocker table + template above keep it working |
| One engagement per agent (ETRAB rule) | By design | If a customer has multiple agents, build a plan per engagement |
