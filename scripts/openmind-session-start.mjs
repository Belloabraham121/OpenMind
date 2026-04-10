import { loadOpenmindHookEnv } from "./load-openmind-hook-env.mjs"

/**
 * Cursor hook: sessionStart
 *
 * Fires once when a new conversation opens.  Makes a single smart recall
 * to fetch the session anchor (compressed summary) and injects a compact
 * context hint (~50-100 tokens).  The AI then knows what topics exist in
 * memory and can call openmind_query via MCP for deeper recall on demand.
 */

async function readStdinJson() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString("utf8").trim()
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function logErr(msg) {
  console.error(`[openmind-hook sessionStart] ${msg}`)
}

function buildAnchorContext(smartResult) {
  if (!smartResult || typeof smartResult !== "object") return ""

  const anchor = smartResult.anchor
  const facts = Array.isArray(smartResult.facts) ? smartResult.facts : []
  const factCount = smartResult.fact_count ?? facts.length
  const sourceCount = smartResult.source_count ?? 0

  const lines = []

  if (anchor && typeof anchor === "object") {
    const intent = typeof anchor.intent === "string" && anchor.intent
      ? anchor.intent
      : null
    const keyFacts = Array.isArray(anchor.key_facts) ? anchor.key_facts : []
    const keyDecisions = Array.isArray(anchor.key_decisions) ? anchor.key_decisions : []

    if (intent) {
      lines.push(`- ${intent}`)
    }

    if (keyFacts.length) {
      lines.push(`- Key topics: ${keyFacts.slice(0, 5).join("; ")}`)
    }

    if (keyDecisions.length) {
      lines.push(`- Decisions: ${keyDecisions.slice(0, 3).join("; ")}`)
    }

    lines.push(`- ${factCount} facts stored, ${sourceCount} sources available`)
  } else if (factCount > 0) {
    const recentTopics = facts
      .slice(0, 5)
      .map((f) => (typeof f.content === "string" ? f.content : ""))
      .filter(Boolean)
      .map((c) => c.slice(0, 60))
    if (recentTopics.length) {
      lines.push(`- Recent: ${recentTopics.join("; ")}`)
    }
    lines.push(`- ${factCount} facts stored`)
  }

  return lines.join("\n")
}

async function main() {
  loadOpenmindHookEnv()
  await readStdinJson()

  const apiKey = process.env.OPENMIND_API_KEY?.trim()
  if (!apiKey) {
    logErr("skip: OPENMIND_API_KEY missing")
    process.stdout.write(JSON.stringify({}))
    return
  }

  const bffUrl = (process.env.OPENMIND_BFF_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "")

  let additional_context = ""
  try {
    const res = await fetch(`${bffUrl}/api/gateway/memory/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: "session context summary",
        top_k: 5,
        smart: true,
      }),
    })

    if (!res.ok) {
      logErr(`query failed: HTTP ${res.status}`)
    } else {
      const data = await res.json().catch(() => ({}))
      const results = Array.isArray(data?.results) ? data.results : []
      const smartResult = results.length > 0 ? results[0] : null

      const anchorBlock = buildAnchorContext(smartResult)

      if (anchorBlock) {
        additional_context = [
          "Relevant OpenMind memories (read-only):",
          anchorBlock,
          "",
          "Use these memories when relevant. If anything conflicts with the current user message, trust the latest user instruction.",
        ].join("\n")
        logErr(`ok: injected anchor context (${additional_context.length} chars)`)
      } else {
        logErr("ok: no anchor or facts found in memory")
      }
    }
  } catch (e) {
    logErr(`query error: ${e instanceof Error ? e.message : String(e)}`)
  }

  process.stdout.write(JSON.stringify({ additional_context }))
}

main().catch((e) => {
  logErr(`fatal: ${e instanceof Error ? e.message : String(e)}`)
  process.stdout.write(JSON.stringify({}))
})

