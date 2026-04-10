import { loadOpenmindHookEnv } from "./load-openmind-hook-env.mjs"
import { cursorHookStoreFields } from "./cursor-hook-store-fields.mjs"

/**
 * Cursor hook: beforeSubmitPrompt
 * Persists the user's prompt right after send, before the agent runs.
 *
 * Input: { "prompt": "<text>", "attachments": [...] }
 * Output: { "continue": true } (never blocks submission)
 */

function redactSecrets(s) {
  if (typeof s !== "string") return ""
  return s
    .replace(/om_live_[A-Za-z0-9_-]{6,}/g, "om_live_[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-[REDACTED]")
    .replace(/AIza[0-9A-Za-z_-]{10,}/g, "AIza[REDACTED]")
}

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
  console.error(`[openmind-hook beforeSubmitPrompt] ${msg}`)
}

const MAX_CHARS = 150_000
const MAX_RECALL_SNIPPET_CHARS = 500
const MAX_RECALL_SNIPPETS = 4
const RECALL_TOP_K_SMART = 12
const RECALL_TOP_K_FALLBACK = 18

function isMemoryRecallPrompt(prompt) {
  if (typeof prompt !== "string") return false
  // Only check the first 300 chars to avoid false positives when users paste
  // JSON blobs, logs, or other quoted text that happens to contain recall phrases.
  const p = prompt.slice(0, 300).toLowerCase().trim()
  if (!p) return false

  const patterns = [
    /\bdo you remember\b/,
    /\bremember (our|the) (chat|conversation|discussion)\b/,
    /\bwhat did we (discuss|talk about|decide)\b/,
    /\b(previous|earlier|last) (chat|conversation|discussion)\b/,
    /\bfrom (our|the) (previous|earlier|last) (chat|conversation)\b/,
    /\bearlier you said\b/,
    /\bwe (already|previously) (discussed|talked|decided)\b/,
    /\bcan you recap\b/,
    /\brecap (what|our)\b/,
  ]

  return patterns.some((re) => re.test(p))
}

function extractSnippetFromMemoryItem(item) {
  if (!item || typeof item !== "object") return ""
  const o = item
  const content =
    typeof o.content === "string"
      ? o.content
      : typeof o.text === "string"
        ? o.text
        : typeof o.snippet === "string"
          ? o.snippet
          : typeof o.chunk === "string"
            ? o.chunk
            : ""
  if (content) return content
  try {
    return JSON.stringify(o)
  } catch {
    return ""
  }
}

function buildRecallQuery(prompt) {
  if (typeof prompt !== "string") return ""
  let q = prompt
    .replace(/\bdo you remember\b/gi, "")
    .replace(/\bcan you remember\b/gi, "")
    .replace(/\b(our|the|this)\s+(chat|conversation|discussion)\b/gi, "")
    .replace(/\b(previous|earlier|last)\b/gi, "")
    .replace(/\bwhat did we (discuss|talk about|decide)\b/gi, "")
    .replace(/\?+/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!q) q = prompt.trim()
  return `${q} decisions constraints files hooks mcp openmind`
}

function snippetsFromSmartResult(result0) {
  if (!result0 || typeof result0 !== "object") return []
  const out = []

  const anchor = result0.anchor
  if (anchor && typeof anchor === "object") {
    const s = extractSnippetFromMemoryItem(anchor).replace(/\s+/g, " ").trim()
    if (s) out.push(`- [anchor] ${s.slice(0, MAX_RECALL_SNIPPET_CHARS)}`)
  }

  const facts = Array.isArray(result0.facts) ? result0.facts : []
  for (const f of facts) {
    const s = extractSnippetFromMemoryItem(f).replace(/\s+/g, " ").trim()
    if (s) out.push(`- [fact] ${s.slice(0, MAX_RECALL_SNIPPET_CHARS)}`)
    if (out.length >= MAX_RECALL_SNIPPETS) break
  }

  if (out.length < MAX_RECALL_SNIPPETS) {
    const sources = Array.isArray(result0.sources) ? result0.sources : []
    for (const s0 of sources) {
      const s = extractSnippetFromMemoryItem(s0).replace(/\s+/g, " ").trim()
      if (s) out.push(`- [source] ${s.slice(0, MAX_RECALL_SNIPPET_CHARS)}`)
      if (out.length >= MAX_RECALL_SNIPPETS) break
    }
  }

  return out.slice(0, MAX_RECALL_SNIPPETS)
}

function snippetsFromResults(results) {
  if (!Array.isArray(results)) return []
  return results
    .slice(0, MAX_RECALL_SNIPPETS)
    .map((r, i) => {
      const s = extractSnippetFromMemoryItem(r)
      const cleaned = s.replace(/\s+/g, " ").trim()
      return cleaned
        ? `- ${cleaned.slice(0, MAX_RECALL_SNIPPET_CHARS)}`
        : `- [memory item ${i + 1} unavailable]`
    })
    .filter(Boolean)
}

async function runRecallQuery({ bffUrl, apiKey, query, smart, top_k }) {
  const queryRes = await fetch(`${bffUrl}/api/gateway/memory/query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      top_k,
      smart,
    }),
  })
  const queryData = await queryRes.json().catch(() => ({}))
  return { queryRes, queryData }
}

function attachmentSummary(input) {
  const list = input.attachments
  if (!Array.isArray(list) || list.length === 0) return ""
  const paths = list
    .map((a) => {
      if (!a || typeof a !== "object") return null
      return typeof a.file_path === "string" ? a.file_path : null
    })
    .filter(Boolean)
  if (!paths.length) return ""
  return `\n\nAttachments (${paths.length}): ${paths.slice(0, 12).join(", ")}${
    paths.length > 12 ? " …" : ""
  }`
}

async function main() {
  loadOpenmindHookEnv()
  const input = await readStdinJson()

  const apiKey = process.env.OPENMIND_API_KEY?.trim()
  if (!apiKey) {
    logErr(
      "skip: OPENMIND_API_KEY missing — use .cursor/openmind-hook.env (see OPENMIND_CURSOR_PLUGIN.md)",
    )
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }

  const rawPrompt = typeof input.prompt === "string" ? input.prompt : ""
  const prompt = rawPrompt.trim()
  if (!prompt) {
    logErr("skip: empty prompt")
    process.stdout.write(JSON.stringify({ continue: true }))
    return
  }

  const bffUrl = (process.env.OPENMIND_BFF_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "")

  const body =
    prompt.length > MAX_CHARS
      ? `${prompt.slice(0, MAX_CHARS)}\n\n[truncated for ingest cap]`
      : prompt

  const attachNote = attachmentSummary(input)
  const content = redactSecrets(`User prompt (auto-captured):\n\n${body}${attachNote}`)
  let additional_context = ""

  if (isMemoryRecallPrompt(prompt)) {
    try {
      const recallQuery = buildRecallQuery(prompt)
      const primary = await runRecallQuery({
        bffUrl,
        apiKey,
        query: recallQuery,
        top_k: RECALL_TOP_K_SMART,
        smart: true,
      })

      if (!primary.queryRes.ok) {
        logErr(
          `query failed: HTTP ${primary.queryRes.status} ${primary.queryRes.statusText}`,
        )
      } else {
        const smartResults = Array.isArray(primary.queryData?.results)
          ? primary.queryData.results
          : []
        const smartResult0 =
          smartResults.length > 0 && smartResults[0] && typeof smartResults[0] === "object"
            ? smartResults[0]
            : null
        let snippets = snippetsFromSmartResult(smartResult0)

        if (!snippets.length) {
          const fallback = await runRecallQuery({
            bffUrl,
            apiKey,
            query: recallQuery,
            top_k: RECALL_TOP_K_FALLBACK,
            smart: false,
          })
          if (fallback.queryRes.ok) {
            const fallbackResults = Array.isArray(fallback.queryData?.results)
              ? fallback.queryData.results
              : []
            snippets = snippetsFromResults(fallbackResults)
            if (snippets.length) {
              logErr(
                `ok: smart recall empty; fallback recall returned ${snippets.length} snippets`,
              )
            } else {
              logErr("ok: recall ran (smart + fallback), no relevant snippets found")
            }
          } else {
            logErr(
              `fallback query failed: HTTP ${fallback.queryRes.status} ${fallback.queryRes.statusText}`,
            )
          }
        }

        if (snippets.length) {
          additional_context = [
            "Relevant OpenMind memories (read-only):",
            ...snippets,
            "",
            "Use these memories only when relevant. If anything conflicts with the current user message, trust the latest user instruction.",
          ].join("\n")
          logErr(`ok: recalled ${snippets.length} memory snippets for prompt`)
        }
      }
    } catch (e) {
      logErr(`query error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  try {
    const res = await fetch(`${bffUrl}/api/gateway/memory/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        content,
        role: "user",
        multimodal_type: "text",
        ...cursorHookStoreFields(input),
      }),
    })
    const resText = await res.text().catch(() => "")
    if (!res.ok) {
      logErr(
        `store failed: HTTP ${res.status} ${res.statusText} — ${resText.slice(0, 240).replace(/\s+/g, " ")}`,
      )
    } else {
      logErr(`ok: stored user prompt via POST /api/gateway/memory/store (${body.length} chars raw)`)
    }
  } catch (e) {
    logErr(`store error: ${e instanceof Error ? e.message : String(e)}`)
  }

  process.stdout.write(
    JSON.stringify({
      continue: true,
      additional_context,
      additional_instructions: additional_context,
    }),
  )
}

main().catch((e) => {
  logErr(`fatal: ${e instanceof Error ? e.message : String(e)}`)
  process.stdout.write(JSON.stringify({ continue: true }))
})
