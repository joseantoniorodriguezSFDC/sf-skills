---
name: sf-feature-research
description: "Research skill for Success Guides and Success Architects. TRIGGER when: user wants to find documentation, Trailhead content, release notes, or internal Slack resources for any Salesforce feature or product area. Accepts a feature name or keyword as input and returns a synthesized report covering official docs, Trailhead, recent web content, and internal Slack threads/demos/recordings. DO NOT TRIGGER when: user is auditing a live Salesforce org (use agentforce-success-guide), building agents (use developing-agentforce), or observing agent sessions (use observing-agentforce)."
metadata:
  type: research
  version: "1.0"
  last_updated: "2026-05-26"
  author: "Jose Antonio Rodriguez — Success Guide, Agentforce Service"
  audience: "Success Guides and Success Architects researching Salesforce features"
---

# Salesforce Feature Research Skill

## Purpose

Research any Salesforce feature end-to-end in a single command. This skill runs four search tracks in parallel and synthesizes findings into a structured report:

1. **Trailhead** — official learning content (modules, trails, projects)
2. **Salesforce Help** — official documentation, setup guides, developer references
3. **Web** — recent release notes, blog posts, and Salesforce Help articles with dates
4. **Slack** — internal threads, demos, recordings, and enablement materials from SEs, SAs, and enablement teams

---

## Input

The user provides a feature name or keyword. Examples:
- "Agentforce Service Agent"
- "Einstein Copilot"
- "Slack MCP"
- "Data Cloud"
- "Headless 360"

If no feature is specified, ask: `Which Salesforce feature would you like to research?`

---

## Execution

Run all four tracks **in parallel**. Do not wait for one to complete before starting the others.

---

### Track 1 — Trailhead Search

Use `WebFetch` to retrieve results from a Google site search:

```
https://www.google.com/search?q=site:trailhead.salesforce.com+"<FEATURE_NAME>"
```

From the results, extract:
- Page title
- URL
- Content type (module / trail / project / superbadge)
- Last updated date if visible

Present as a table:

| Title | Type | URL | Last Updated |
|---|---|---|---|
| ... | ... | ... | ... |

If zero results, try a broader variant:
```
https://www.google.com/search?q=site:trailhead.salesforce.com+<KEYWORD>
```

---

### Track 2 — Salesforce Help / Official Docs Search

Use `WebFetch` to retrieve results:

```
https://www.google.com/search?q=site:help.salesforce.com+"<FEATURE_NAME>"
```

Also search the Salesforce developer docs and release notes:

```
https://www.google.com/search?q=site:developer.salesforce.com+"<FEATURE_NAME>"
```

From the results, extract:
- Page title
- URL
- Document type (Help article / Developer doc / API reference / Release note)
- Last updated or published date

Present as a table:

| Title | Type | URL | Last Updated |
|---|---|---|---|
| ... | ... | ... | ... |

If the Salesforce Docs MCP tool (`salesforce_docs_search`) is available, also run:

```
salesforce_docs_search(query="<FEATURE_NAME> setup configuration")
salesforce_docs_search(query="<FEATURE_NAME> developer guide")
```

Merge MCP results with the web search results, deduplicating by URL.

---

### Track 3 — Broad Web Search (Release Notes & Blog Posts)

Use `WebFetch` to run a broad recent-web search:

```
https://www.google.com/search?q=salesforce+"<FEATURE_NAME>"+release+notes+OR+blog+OR+"what's+new"&tbs=qdr:y
```

The `tbs=qdr:y` filter limits results to the past year.

Also search specifically for Salesforce release notes:

```
https://www.google.com/search?q=site:salesforce.com+"<FEATURE_NAME>"+("Spring '25" OR "Summer '25" OR "Winter '26" OR "Spring '26")
```

Extract:
- Title
- URL
- Source (Salesforce blog / release notes / partner site / analyst)
- Published or last updated date

Present as a table:

| Title | Source | URL | Published |
|---|---|---|---|
| ... | ... | ... | ... |

Flag the three most recent items with `🆕`.

---

### Track 4 — Internal Slack Search

Run all four Slack searches **in parallel**:

**4a — Threads and discussions:**
```
slack_search_public_and_private(
  query="<FEATURE_NAME>",
  limit=10,
  include_context=true
)
```

**4b — Demos and recordings:**
```
slack_search_public_and_private(
  query="<FEATURE_NAME> demo OR recording OR walkthrough",
  limit=10,
  include_context=true
)
```

**4c — Enablement and resources:**
```
slack_search_public_and_private(
  query="<FEATURE_NAME> enablement OR training OR deck OR playbook",
  limit=10,
  include_context=true
)
```

**4d — Files only (decks, docs, videos):**
```
slack_search_public_and_private(
  query="<FEATURE_NAME>",
  content_types="files",
  limit=10
)
```

After collecting results, also find the most relevant channels:
```
slack_search_channels(query="<FEATURE_NAME>")
```

Present Slack results as two sections:

**Key Channels:**

| Channel | Description |
|---|---|
| #channel-name | ... |

**Top Threads & Resources:**

| Date | Channel | From | Summary | Link |
|---|---|---|---|---|
| ... | ... | ... | One-line summary of what was shared | [link] |

Prioritize results that contain:
- Links to demos, recordings, or Google Drive files
- Content from SEs, SAs, or enablement teams
- Deck or playbook attachments
- Recent content (last 90 days first)

---

## Output Format

After all four tracks complete, present a single synthesized report:

```
Research Report: <FEATURE_NAME>
Generated: <today's date>
═══════════════════════════════════════════════════════

## Trailhead
<table of results or "No modules found — check trailhead.salesforce.com manually">

## Official Documentation
<table of results>

## Recent Web (Release Notes & Blog Posts)
<table of results — most recent first>

## Internal Slack Resources

### Relevant Channels
<channel list>

### Threads & Files
<table of threads, demos, recordings>

═══════════════════════════════════════════════════════
## Summary
<3-5 bullet synthesis of what was found:>
• Most relevant Trailhead content: ...
• Key documentation: ...
• What's new (most recent release): ...
• Best internal resource: ...
• Gaps: anything NOT found that the user should know is missing
```

---

## Error Handling

| Situation | Action |
|---|---|
| WebFetch returns no Google results | Try without quotes: `site:trailhead.salesforce.com <keyword>` |
| Salesforce Docs MCP not available | Skip Track 2 MCP step, note in output |
| Slack returns 0 results | Broaden: remove quotes, try individual words |
| Google rate-limits the fetch | Wait 5 seconds and retry once |
| Feature name is ambiguous | Ask user to clarify (e.g., "Do you mean Agentforce Copilot or Einstein Copilot?") |

---

## Usage Examples

```
/sf-feature-research Agentforce Service Agent
/sf-feature-research Einstein Copilot
/sf-feature-research Slack MCP integration
/sf-feature-research Data Cloud unification
/sf-feature-research Headless 360
```

The skill also responds to natural-language triggers:
- "What's out there on [feature]?"
- "Find me everything on [feature] — docs, Trailhead, Slack"
- "Research [feature] for a customer call"
- "What are people saying internally about [feature]?"

---

## Notes for Success Guides

- Always cite the **date** on documentation — Salesforce docs shift significantly between releases. Stale docs are a common source of customer confusion.
- The Slack track is often the highest-signal source for field teams: demos recorded by SEs, playbooks from enablement, and real objection-handling threads are not in any official doc.
- If a feature shows up in Slack but has no Trailhead content, that's a signal it's very new or still in beta — flag it for the customer.
- Use the output of this skill as prep material before a coaching call, then hand off to `/agentforce-success-guide` for the live org session.
