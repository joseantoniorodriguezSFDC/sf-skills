---
name: ae-syncup-channel
description: Create a per-case Slack channel and invite the core AE (plus the CSM if the account is Signature) for an account syncup before engaging the customer on a new OrgCS case. Pulls case + account context from OrgCS and Org62, picks the **core AE** on the account (Prime/Named — falls back to Agentforce/specialist AE only if no core AE exists) and a CSM only when the support plan is Signature, creates a channel named with the case number + account name, invites the team, and posts a kickoff message in the user's preferred language (Spanish by default for ES accounts) with the user's personal calendar link. The channel persists so future ad-hoc context lives in one searchable place, not trapped in a DM.
metadata:
  type: task
  version: "1.1"
  last_updated: "2026-07-14"
  author: "Antonio Magana — Success Guide"
  audience: "Success Guides syncing with the account team on a new case"
---

# AE Syncup Channel — Pre-Customer-Engagement Sync (channel-based)

> ⚙️ **Setup:** replace `<YOUR_BOOKING_LINK>` (your self-service scheduling URL — appended to every kickoff) and `[your name]` in the kickoff opener (Step 7). The OrgCS/Org62 MCP server names below are just aliases — point them at your own connected orgs.

## Purpose

When the Success Guide gets handed a new OrgCS case (or any new ask on an account they don't yet own context for), the right first move is to pull the **AE** (and the **CSM** if Signature) into a 20–30 min syncup **before** reaching back to the customer. Previously this went via DM; the motion moved to giving every case-level syncup its **own Slack channel** so the context survives, is searchable, and other team members can be looped in later.

This skill:

1. Pulls the case + account context from OrgCS.
2. Finds the **core AE** in Org62 (Prime/Named AE on the account). Falls back to an Agentforce/specialist overlay AE only if there is no core AE — see [[feedback-ae-selection]].
3. Detects the support plan tier — pulls a **CSM only when the account is Signature** (Premier accounts NEVER have a CSM — see [[etrab-weekly-note-skill]] and [[feedback-ae-selection]]).
4. Creates a private Slack channel named per the convention below.
5. Invites the AE (+ CSM if applicable) — the user is auto-included as the creator.
6. Posts a kickoff message in the user's preferred language (Spanish by default for ES/LATAM accounts), grounded in the case context.
7. **Always** includes the user's personal calendar link so the AE can self-book.

> The default Google Calendar booking link is **`<YOUR_BOOKING_LINK>`** — append it to every kickoff post. Do not omit.

> **Read-only on Salesforce; two outbound Slack writes (channel create + kickoff message).** OrgCS and Org62 are read-only ([[orgcs-mcp-readonly]], [[sf-mcp-org-mapping]]). The only writes are the channel creation + the kickoff message, and only after the user says "send" / "confirma".

---

## Channel naming convention

Format: `case-<6-digit-suffix>-<account-slug>`

- `<6-digit-suffix>` = last 6 digits of the OrgCS case number (so the channel name stays under Slack's 80-char limit). Example: case `478123456` → suffix `123456`.
- `<account-slug>` = account name, lowercased, ASCII-normalized (drop accents/ñ/diacritics), spaces → hyphens, S.A./S.L./Inc./etc. dropped, trimmed to fit. Examples:
  - `CAFÉ MAÑANA, S.A.` → `cafe-manana`
  - `Grupo Ejemplo` → `grupo-ejemplo`
  - `LOGÍSTICA DEL NORTE, S. DE R.L. DE C.V.` → `logistica-del-norte`

Full examples:
- `case-123456-cafe-manana`
- `case-234567-grupo-ejemplo`

**Why this naming works:** the case-number suffix makes the channel discoverable from the case URL, the account slug makes it discoverable from account chatter, and the `case-` prefix groups them in the Slack sidebar sort. Stay under 80 chars; if the slug pushes over, trim the account portion before the case number.

Channels are **private by default** so the case description (often customer-confidential) stays gated to invited members.

---

## Prerequisites

### 0.1 — OrgCS MCP connected
`claude mcp list` → **`orgcs`** shows `✓ Connected`. If missing/`Needs authentication`, authenticate at `/mcp` via the **orgcs custom domain** (a normal login throws `OAUTH_AUTHORIZATION_BLOCKED`).

### 0.2 — Org62-Sobject-Read MCP connected
Needed to find the real AE + CSM on the account. The OrgCS account often shows a placeholder owner; the real account team lives in Org62.

### 0.3 — Slack MCP connected
For looking up Slack user_ids by email, creating the channel, and posting the kickoff message.

---

## Inputs

| Input | Required | Default | Notes |
|---|---|---|---|
| **Case** | one of (case Id, case URL, case number) | — | The OrgCS case the SG was assigned. |
| **Language** | optional | Spanish for ES/LATAM accounts (BillingCountry ES/MX/AR/CL/CO/PE/etc.), English otherwise | User can override (`"in english please"` / `"en español"`). |
| **Tone** | optional | warm, concise, peer-to-peer | Match the SG's voice — not formal corporate. |
| **Channel privacy** | optional | private | Override only if user explicitly asks for public. |
| **Confirm-before-create** | optional | **always confirm before creating channel + sending kickoff** | Channels are visible to the invitees as soon as they're added. Confirm cast + message before firing. |

---

## Step 1 — Resolve the case

Accept any of:
- Lightning URL like `https://orgcs.lightning.force.com/lightning/r/Case/<15- or 18-char Id>/view`
- Raw 15/18-char Case Id
- Case number (`CaseNumber`)

Query OrgCS:

```soql
SELECT Id, CaseNumber, Subject, Description, Status, Priority,
       Account.Id, Account.Name,
       ContactId, Contact.Name, Contact.Email,
       OwnerId, Owner.Name,
       CreatedDate, LastModifiedDate, Origin, Reason
FROM Case
WHERE Id = '<id>'   -- OR CaseNumber = '<number>'
LIMIT 1
```

> **Field gotcha:** `Type` is **not** a queryable field on `Case` in OrgCS — omit it. (`Origin` and `Reason` are fine.)

Capture: `CaseNumber` (for the channel name + kickoff title), `Account.Name` (for the slug), `Contact.Email` (the contact's email **domain** is used to disambiguate sibling accounts), case subject + description (for the kickoff context line).

## Step 2 — Find the core AE in Org62

Search Org62 by account name (use SOSL — variants/parent/sibling accounts often exist):

```sosl
FIND {"<account name token>"} IN NAME FIELDS
RETURNING Account(Id, Name, OwnerId, Owner.Name, Owner.Email,
                  Industry, BillingCountry, ParentId, Parent.Name)
```

You will often get multiple hits: parent / holding / operating / DUP / sibling entities. **Pick the AE this way:**

1. Start with the account on the case (match by name + parent context).
2. Pull the AE candidates' titles to confirm core vs overlay:
   ```soql
   SELECT Id, Name, Email, Title, Department, IsActive
   FROM User
   WHERE Id IN ('<ownerId1>','<ownerId2>',...)
   ```
3. **Core AE = Title contains "Named Account Executive" or "Prime AE" or similar (Department often `5992 Prime AE`).** That's the person to invite.
4. Only if there is no core AE on the account, fall back to an Agentforce / Data Cloud / specialist overlay AE.
5. **If the contact email domain points to a sibling/operating entity** with a different core AE, still **invite the case-account's core AE first** and **mention the sibling owner in the kickoff message** so they can route. See [[feedback-ae-selection]].

If the parent and sibling have **different** core AEs, surface that to the user before creating the channel and let them confirm which one to invite.

## Step 3 — Find the CSM (only if Signature)

Detect the support plan tier on the account.

**Where the tier lives:** the cleanest read is the active Success Plan tied to the account — the field is `cssf_Catalog_from_Asset_Line_Item_ali__c` on `csc__Playbook__c` (the same one ETRAB uses — see [[etrab-weekly-note-skill]] Step 2). For a case where no engagement exists yet, check the most recent Playbook for the account:

```soql
SELECT Id, csc__Account__r.Name, cssf_Catalog_from_Asset_Line_Item_ali__c,
       LastModifiedDate
FROM csc__Playbook__c
WHERE csc__Account__c = '<accountId>'
ORDER BY LastModifiedDate DESC
LIMIT 5
```

If no Playbook exists for the account, you can also read the support plan from the account record / contracts in Org62 — but if neither surfaces a clear tier, label it `<tier unknown — verify>` and ask the user before inviting a CSM.

**The rule:**
- **Premier accounts NEVER have a CSM.** Do not search for one, do not invite anyone in that role. The SG (and AE) are the customer's coverage. Skip the CSM step entirely.
- **Signature accounts DO have a CSM.** Pull them from the account team or the active Playbook (`cssf_Success_Plan_Name__c` often points to the plan record; the CSM is the assigned resource on that plan). Invite them to the channel alongside the AE.
- **Unknown tier:** surface to the user, default to AE-only invite, and ask whether to also pull a CSM.

## Step 4 — Find Slack user_ids

For each person to invite (AE always; CSM only if Signature):

```
slack_search_users(query: "<email>")
```

Capture `User ID`. If not found, fall back to the full name. If still not found, surface to the user before creating the channel.

## Step 5 — Pick the language

- Default Spanish if the account's `BillingCountry` is **ES** or any Spanish-speaking LATAM country (MX/AR/CL/CO/PE/UY/EC/VE/CR/DO/GT/HN/NI/PA/PY/SV), **or** the contact's email domain is on a Spanish-language site, **or** the case `Description` is in Spanish.
- Default English otherwise.
- The user can always override.

## Step 6 — Build the channel name

Apply the naming convention from the top of this skill. Slug rules:
- Lowercase.
- ASCII-normalize (`á→a`, `é→e`, `í→i`, `ó→o`, `ú→u`, `ñ→n`, `ü→u`).
- Drop suffixes: `S.A.`, `S.A`, `S.L.`, `S.L`, `Inc.`, `Inc`, `LLC`, `Ltd.`, `Ltd`, `S. DE R.L. DE C.V.`, `SAU`, `S.A.B. DE C.V.`, etc.
- Drop trailing commas and dots, drop the period, collapse multiple spaces.
- Replace remaining spaces/punctuation with single hyphens.
- Trim to fit under 80 chars total channel name length (the `case-XXXXXX-` prefix is ~12 chars, leaves ~67 for the slug — usually plenty).

Show the proposed channel name to the user in Step 8 so they can edit if it looks off.

## Step 7 — Draft the kickoff message

The kickoff is the first message posted to the channel after creation. It's the AE syncup ask, restated for a multi-person audience, ending with the calendar link.

Structure (any language):
1. **Opener** — "Hola @AE [+ @CSM if Signature], soy [your name] del equipo de Success Guides de Agentforce. Acabo de crear este canal para el caso <CaseNumber> de <Account> y quería sincronizar con ustedes antes de contactar a <Contact first name>."
2. **Context line** — 1–2 sentences on what the customer is asking for (paraphrased from `Subject`/`Description`, not pasted).
3. **The ask** — 20–30 min syncup *before* you go back to the customer, with 2–3 specific bullets:
   - Contexto de la cuenta — sponsor, sensibilidades, dinámica con el equipo técnico.
   - Pintura comercial — Agentforce / Data Cloud / etc. ya en mesa, o esto sería net-new.
   - Cómo te conviene que me posicione con <Contact>, y si quieres estar en la primera llamada.
4. **Sibling-account note** *(only if applicable)* — "El caso está filado bajo <parent>, pero el dominio del contacto apunta a <sibling>; si <sibling AE> es el owner correcto, los sumo al canal."
5. **Calendar link line** — always include:
   - Spanish: `Si te va más rápido, agendá directamente acá: <YOUR_BOOKING_LINK>`
   - English: `If easier, grab a slot directly here: <YOUR_BOOKING_LINK>`
6. **Closing line** — "Este canal queda activo para que centralicemos contexto del caso. ¡Gracias!" / "Keeping this channel as the home for case context going forward. Thanks!"

**Formatting rules:**
- Plain text, no `>` blockquotes (breaks copy/paste — see [[draft-formatting-no-blockquotes]]).
- Keep it under ~180 words.
- Use `<@USER_ID>` mentions (not @name) so the invitees get pinged on join.
- No emojis unless the SG has used them recently with this AE.

## Step 8 — Show the plan to the user (mandatory confirm step)

Before creating anything, show:

- **Proposed channel name:** `case-XXXXXX-account-slug`
- **Privacy:** private (default)
- **Invitees:** AE name + Slack user_id · (if Signature) CSM name + Slack user_id
- **Tier inferred:** Premier / Signature / unknown
- **Language:** ES / EN
- **Sibling-account caveat:** yes/no
- **Kickoff message draft** (in a fenced block)
- **Calendar link included:** yes (always)

Then ask: **"Confirmo creo el canal con esto, o ajusto algo?"** / "Confirm I create the channel as-is, or tweak anything?"

If the user says "confirma" / "send" / "perfecto, crea el canal" → go to Step 9.
If they ask for edits → revise and re-show.

## Step 9 — Create the channel + post kickoff

Two writes:

```
slack_create_conversation(
  channel_name: "case-XXXXXX-account-slug",
  is_private: true,
  user_ids: ["<AE user_id>"  + (CSM user_id if Signature)]
)
```

Then immediately:

```
slack_send_message(
  channel_id: "<new channel id from step 1>",
  message: "<final kickoff message draft>"
)
```

Return both:
- The Slack channel permalink (so the user can pin it / bookmark it).
- The kickoff message permalink (so the user can audit what was posted).

## Step 10 — Confirm and offer next steps

After both writes succeed, briefly confirm and offer one logical next step (e.g. "Want me to draft a similar channel for the sibling-entity AE?" or "Want me to set a follow-up reminder for 2 business days if no reply?"). Don't add extra work the user didn't ask for.

If the channel-creation succeeded but the invite failed for one user (e.g. user not found, can't DM bots), surface that — the channel is still good, the user can add the missing person manually via Slack UI.

---

## Pitfalls

- **Don't skip Org62.** OrgCS account owner is often a placeholder (`Registration Headquarters`, `sfdcapp_*@salesforce.com`). The real AE is always in Org62.
- **Don't invite the overlay AE instead of core.** Core AE always wins. See [[feedback-ae-selection]].
- **Don't invite a CSM on Premier accounts.** Premier never has a CSM ([[etrab-weekly-note-skill]] Step 7) — don't manufacture one.
- **Don't paste the customer's full `Description`** into the kickoff — paraphrase. The customer may have written it in confidence.
- **Don't assume the case account is the operating account.** ES utilities/holding groups frequently file cases on the parent while the work belongs to a sibling — flag it in the kickoff.
- **Don't create the channel before showing the plan.** Channel creation pings the invitees instantly via Slack; one wrong invitee is socially costly. The Step 8 confirm gate is non-negotiable.
- **Always include the calendar link.** It is a non-negotiable part of every kickoff produced by this skill: `<YOUR_BOOKING_LINK>`.
- **No `Type` field on Case in OrgCS** — see [[headless360-audit-soql-notes]] for similar query gotchas.
- **Stay under Slack's 80-char channel name limit.** Trim the slug, not the case-number suffix (the suffix is the discoverability anchor).

---

## Migration note

This skill replaces a prior DM-based syncup skill (`ae-syncup-dm`). The DM motion is gone — every AE syncup now creates a channel so case-level context survives in a searchable, shareable place. Any syncups sent as DMs under the old skill aren't migrated — they live in DM history; if such a case warrants a channel later, run this skill pointing at the same case Id and it'll create one fresh.
