# Setting up sf-skills

A step-by-step first run. Budget ~10 minutes. For what each skill *does*, see the
[README](./README.md); this doc is only about getting a fresh clone working for **you**.

These skills come in two layers:

- **Capability layer — the skills.** Shared, versioned, identical for everyone. This repo.
- **Context layer — who you are.** Your workspace email, timezone, Slack id, support org,
  booking link, and a couple of Slack canvases. Personal to you, and *never* in this repo —
  it all lives in one file, `~/.claude/profile.md`.

A freshly cloned skill is fully capable but knows nothing about you. The steps below install
the capability layer, then build your context layer once.

---

## 1. Install the skills

```bash
git clone https://github.com/joseantoniorodriguezSFDC/sf-skills.git /tmp/sf-skills
cp -r /tmp/sf-skills/skills/* ~/.claude/skills/
cp /tmp/sf-skills/profile.template.md ~/.claude/profile.md
```

Then restart Claude Code so it picks up the new skills.

> Prefer to install just one skill? Each skill's folder under `skills/` is self-contained —
> `cp -r /tmp/sf-skills/skills/<name> ~/.claude/skills/<name>`.

---

## 2. Connect the MCP servers

The skills read from MCP servers you connect once. Check what's connected with `claude mcp list`;
each skill's **Prerequisites** section names exactly which it needs. The daily-workflow toolkit uses:

| MCP server | Powers | Notes |
|---|---|---|
| **google-workspace** | Gmail, Calendar, Google Tasks, Docs | Auth via `/mcp`. |
| **slack** | digests, canvases, channel posts | Auth via `/mcp`. |
| **orgcs** (your support org) | case age, engagement nudges, weekly notes | Authenticate at `/mcp` via the **orgcs custom domain** — a normal login throws `OAUTH_AUTHORIZATION_BLOCKED`. Read-only. |
| **Org62-Sobject-Read** | AE/CSM lookup for account-team skills | Internal CRM, read-only. |
| **salesforce-sobject-all** (Hosted MCP) | `agentforce-success-guide` (customer orgs) | Set up via the `sf-hosted-mcp` skill — see the README. |

Anything not connected just means the skills that need it will say so and skip that lane — nothing breaks.

---

## 3. Run `/setup-profile`

In Claude Code:

```
/setup-profile
```

It auto-detects what it can from the MCPs you just connected — `workspace_email` (from Calendar),
`timezone` and `orgcs_username` (from OrgCS), `slack_user_id` (from Slack) — shows you each value
with its source, and writes `~/.claude/profile.md` after you confirm. You never hand-edit a `SKILL.md`,
and `git pull`-ing skill updates never clobbers your settings.

> ⚠️ **Never commit `~/.claude/profile.md`** — it identifies you. The repo ships only the blank
> `profile.template.md`. (Same rule as `~/.claude.json`, which holds your MCP OAuth secrets.)

---

## 4. Create the canvases you don't have yet

Three skills key off things `/setup-profile` **can't** detect, because they're *yours to own* — and a
brand-new user won't have them yet. `/setup-profile` will **offer to create the two canvases for you**
(it runs `slack_create_canvas` with the right starting structure and writes the resulting URL into your
profile). If you'd rather make them by hand, here's what each one is:

| Profile field | Used by | What to create |
|---|---|---|
| `brag_canvas_url` | `brag-book` | A Slack canvas titled e.g. *My Brag Book*. Structure: a **Running Tally** table at the top (type · count · notes), then one table per contribution type — Team Assists, Mentorship, Mock Calls & Shadowing, Sessions & Enablement, Content & Docs Shared, Skills & Certs — with dated rows. |
| `weekly_note_canvas_url` | `etrab-weekly-note` | A Slack canvas titled *ETRAB Weekly — Actionable Items & Stage Recommendations*. Structure: a timestamped header, one section per active engagement (checklist + recommended Stage + rationale), and a Stage-flip summary table. |
| `guide_channel_id` | `brag-book` | Not a canvas — the **channel id** of the team guide channel where you share content. Grab it from the channel's details in Slack. |

Optional reference links (leave blank if you don't have them):

| Profile field | Used by | What it is |
|---|---|---|
| `booking_link` | `post-call-360`, `ae-syncup-channel`, `case-closure-hygiene` | Your self-service scheduling URL — inlined whenever a draft asks the customer/AE for a meeting. |
| `field_guide_canvas_url` | `salesforce-tool-router` | Your "MCP vs CLI vs Skills" companion canvas, if you keep one. |

After the canvases exist, run `/setup-profile` again (or just tell it the URLs) so the fields land in
your profile. Every skill reads them from there.

---

## 5. You're set

Try a first run:

```
catch me up
```

That fires `/daily-driver`, which orchestrates the read-only lanes into one picture. From there,
`/post-call-360` after your next customer call is the highest-leverage motion — one paste of the
Gemini notes becomes a customer email draft, an internal Slack summary, your homework, and a
refreshed next-call canvas.

---

## 6. Optional — turn on the `context-reset` auto-resume hook

`context-reset` is a **utility skill** (installed already by step 1) that beats the slow, sloppy
context you get after a long session: `/context-reset` writes a tight checkpoint, you type `/clear`,
and a fresh window reloads only that checkpoint. It works the moment it's installed.

One optional extra makes the resume **automatic** (no re-typing after `/clear`) and adds a nudge
right after a compaction. It's a one-time hook registration in **your own** config — two files this
repo deliberately **does not ship** because they're personal to you:

**a) Register the SessionStart hook.** Open `~/.claude/settings.json` and add this entry to your
`SessionStart` hooks. If you already have a `SessionStart` matcher (telemetry, aisuite, etc.),
**append** to its `hooks` array — don't replace what's there:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "",
        "hooks": [
          { "type": "command", "command": "$HOME/.claude/skills/context-reset/context-reset-hook.sh" }
        ]
      }
    ]
  }
}
```

**b) (Optional) let Claude raise it before the skill loads.** Add a short "Context health" note to
your `~/.claude/CLAUDE.md` so Claude proactively offers a reset when it notices bloat. The skill's
own "Auto-suggest" section has the exact wording to paste.

> ⚠️ **Never commit `~/.claude/settings.json` or `~/.claude/CLAUDE.md`** — same rule as `profile.md`
> and `~/.claude.json`. They hold your personal hooks and instructions. The repo ships only the
> portable skill + hook script under `skills/context-reset/`; the wiring above stays local to you.

Without the hook, `context-reset` still works — just say "resume" after `/clear` and it picks up the
last checkpoint by hand.

---

## Security note

Two files must **never** be committed to git:

- `~/.claude/profile.md` — identifies you (email, Slack id, org, canvases).
- `~/.claude.json` — holds your MCP OAuth credentials, including Consumer Secrets.

The skills themselves hard-code nothing about you, which is why they're safe to share. Notes,
transcripts, and case data stay scoped to the run that reads them — no customer data belongs in this repo.
