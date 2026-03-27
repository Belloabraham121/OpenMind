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
        tier: "basic",
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

  process.stdout.write(JSON.stringify({ continue: true }))
}

main().catch((e) => {
  logErr(`fatal: ${e instanceof Error ? e.message : String(e)}`)
  process.stdout.write(JSON.stringify({ continue: true }))
})
