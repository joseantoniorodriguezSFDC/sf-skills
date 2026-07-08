export const meta = {
  name: 'agentforce-360-prep',
  description: 'Async Headless 360 coaching prep: discover, audit, and observe every agent in a Salesforce org, then synthesize a customer-facing briefing',
  whenToUse: 'Run from agentforce-success-guide PREP mode only — after the org has been confirmed interactively and the agent list collected. Not for live customer calls.',
  phases: [
    { title: 'Discover', detail: 'topics + actions per agent' },
    { title: 'Audit', detail: '5-check health audit per agent' },
    { title: 'Observe', detail: 'production session health per agent (if STDM available)' },
    { title: 'Synthesize', detail: 'org-wide Headless 360 briefing' },
  ],
}

// ---------------------------------------------------------------------------
// Contract (passed in by the skill as `args`, after interactive org confirmation):
//   args.agents    : [{ id, developerName, masterLabel, status, type }]
//   args.hasStdm   : boolean  — was ssot__AiAgentSession__dlm queryable?
//   args.orgAlias  : string   — for labelling / context only
//   args.org       : string   — confirmed username from getUserInfo (sanity context)
//
// The MCP server `salesforce-sobject-all` is single-org and stateful. This
// workflow does NOT select or switch orgs — it trusts the caller's confirmed
// org. All stages issue read-only SOQL, which is safe to run concurrently.
// ---------------------------------------------------------------------------

const AGENT_MAP = {
  type: 'object',
  required: ['topics'],
  properties: {
    topics: {
      type: 'array',
      items: {
        type: 'object',
        required: ['masterLabel', 'developerName', 'actions'],
        properties: {
          masterLabel: { type: 'string' },
          developerName: { type: 'string' },
          actions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
}

const AUDIT_RESULT = {
  type: 'object',
  required: ['checks', 'blockers', 'warnings'],
  properties: {
    checks: {
      type: 'object',
      required: ['status', 'einsteinAgentUser', 'permissionSets', 'betaPerms', 'objectPerms'],
      properties: {
        status: { type: 'string', enum: ['pass', 'fail', 'warn', 'n/a'] },
        einsteinAgentUser: { type: 'string', enum: ['pass', 'fail', 'warn', 'n/a'] },
        permissionSets: { type: 'string', enum: ['pass', 'fail', 'warn', 'n/a'] },
        betaPerms: { type: 'string', enum: ['pass', 'fail', 'warn', 'n/a'] },
        objectPerms: { type: 'string', enum: ['pass', 'fail', 'warn', 'n/a'] },
      },
    },
    blockers: { type: 'array', items: { type: 'string' }, description: 'each with its exact remediation step' },
    warnings: { type: 'array', items: { type: 'string' } },
  },
}

const HEALTH = {
  type: 'object',
  required: ['available', 'summary'],
  properties: {
    available: { type: 'boolean', description: 'false when STDM/Data Cloud session data was not available' },
    summary: { type: 'string', description: 'coaching-language summary of production session health' },
    topFailureTopics: { type: 'array', items: { type: 'string' } },
  },
}

const BRIEFING = {
  type: 'object',
  required: ['headline', 'perAgent', 'orgWide'],
  properties: {
    headline: { type: 'string', description: 'one-line state of the org for the SG to open the call with' },
    perAgent: {
      type: 'array',
      items: {
        type: 'object',
        required: ['agent', 'status', 'blockers', 'coachingNote'],
        properties: {
          agent: { type: 'string' },
          status: { type: 'string' },
          blockers: { type: 'array', items: { type: 'string' } },
          coachingNote: { type: 'string' },
        },
      },
    },
    orgWide: { type: 'string', description: 'cross-agent themes and the Headless 360 talking points to lead with' },
  },
}

const agents = (args && args.agents) || []
const hasStdm = !!(args && args.hasStdm)

if (!agents.length) {
  log('No agents passed in — nothing to prep. Run Discover (Domain 1) first and pass the agent list as args.agents.')
  return { headline: 'No agents found in the org.', perAgent: [], orgWide: '' }
}

log(`Prepping ${agents.length} agent(s) on ${args.orgAlias || 'the confirmed org'}${hasStdm ? '' : ' (STDM unavailable — Observe stage will be skipped)'}`)

// Pipeline: each agent flows Discover -> Audit -> Observe independently (no barrier).
// Each stage accumulates onto the prior result so the final array carries everything.
const enriched = await pipeline(
  agents,

  // Stage 1 — Discover (Domain 1, steps 2-3): topics per agent, actions per topic.
  (a) => agent(
    `You are prepping a Headless 360 coaching briefing for one Agentforce agent.\n` +
    `Use the salesforce-sobject-all MCP server (soqlQuery tool) against the already-confirmed org.\n` +
    `Agent: ${a.masterLabel} (${a.developerName}), Id ${a.id}, Status ${a.status}.\n` +
    `1. Query BotTopic WHERE BotDefinitionId = '${a.id}' ORDER BY SortOrder ASC.\n` +
    `2. For each topic, query BotTopicDefinition WHERE BotTopicId = '<topicId>'.\n` +
    `Return the topic/action map.`,
    { phase: 'Discover', label: `discover:${a.developerName}`, schema: AGENT_MAP }
  ).then((map) => ({ agent: a, map })),

  // Stage 2 — Audit (Domain 2): the 5-check sequence, in order (checks 2->3->5 share the Einstein user Id).
  (prev) => agent(
    `Run the Domain 2 Audit from the agentforce-success-guide skill for agent ${prev.agent.developerName} (Id ${prev.agent.id}) ` +
    `using the salesforce-sobject-all MCP server. Run the five checks IN ORDER:\n` +
    `1. Agent status (BotDefinition.Status).\n` +
    `2. Einstein Agent User exists and IsActive (Service agents).\n` +
    `3. Required permission sets on that user (needs the user Id from check 2).\n` +
    `4. The four MCP beta perms in OrganizationFeaturePreference ` +
    `(AgentforceMcpSupportPilot, MCPService, ModelContextProtocolSupport, ApiCatalogMcpPilot).\n` +
    `5. Object/field perms (Case, Contact, Account) on the user's permission sets.\n` +
    `Silent-failure cases (missing object read, missing perm set) are blockers. Give each blocker its exact remediation step.`,
    { phase: 'Audit', label: `audit:${prev.agent.developerName}`, schema: AUDIT_RESULT }
  ).then((audit) => ({ ...prev, audit })),

  // Stage 3 — Observe (Domain 3): delegate to observing-agentforce. Skipped org-wide when STDM is absent.
  (prev) => (hasStdm
    ? agent(
        `Summarize production session health for Agentforce agent ${prev.agent.developerName} in coaching language ` +
        `(session quality, top failure topics, misroute rate). Set available=true.`,
        { phase: 'Observe', label: `observe:${prev.agent.developerName}`, agentType: 'observing-agentforce', schema: HEALTH }
      ).then((health) => ({ ...prev, health }))
    : Promise.resolve({ ...prev, health: { available: false, summary: 'STDM/Data Cloud session data not available in this org.' } }))
)

// Barrier is correct here: the org-wide briefing genuinely needs every agent at once.
const clean = enriched.filter(Boolean)
log(`Synthesizing briefing across ${clean.length} agent(s)`)

return await agent(
  `Synthesize a customer-facing Headless 360 coaching briefing from the per-agent discover/audit/observe results below. ` +
  `Translate technical findings into coaching language, lead with blockers, and surface cross-agent themes plus the ` +
  `Headless 360 talking points the Success Guide should open with. Results:\n${JSON.stringify(clean)}`,
  { phase: 'Synthesize', label: 'synthesize:briefing', schema: BRIEFING }
)
