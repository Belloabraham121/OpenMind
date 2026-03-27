import { loadOpenmindHookEnv } from "./load-openmind-hook-env.mjs"
import { cursorHookStoreFields } from "./cursor-hook-store-fields.mjs"

/**
 * Cursor hook: afterAgentResponse
 * Persists each completed assistant message to OpenMind via the Next.js BFF.
 *
 * Input (Cursor): { "text": "<assistant final text>", ... }
 *
 * Env: OPENMIND_API_KEY, OPENMIND_BFF_URL (optional, default http://localhost:3000)
 *
 * Stdout: always "{}" (this hook type has no structured output in Cursor).
 * Stderr: one status line so the Hooks panel is not blank (see below).
 */

function redactSecrets(s) {
  if (typeof s !== "string") return ""
  // Only match known secret shapes. Avoid a broad "long word" rule — it destroys Markdown,
  // code samples, and technical text in assistant replies.
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
  console.error(`[openmind-hook afterAgentResponse] ${msg}`)
}

const MAX_CHARS = 150_000

async function main() {
  loadOpenmindHookEnv()
  const input = await readStdinJson()
  const apiKey = process.env.OPENMIND_API_KEY?.trim()
  if (!apiKey) {
    logErr(
      "skip: OPENMIND_API_KEY is not set in the environment that runs hooks (set it and launch Cursor from that shell, or use macOS env for the Cursor app).",
    )
    process.stdout.write("{}")
    return
  }

  const rawText = typeof input.text === "string" ? input.text : ""
  const text = rawText.trim()
  if (!text || text.length < 3) {
    logErr("skip: empty assistant text")
    process.stdout.write("{}")
    return
  }

  const bffUrl = (process.env.OPENMIND_BFF_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "")

  const body =
    text.length > MAX_CHARS
      ? `${text.slice(0, MAX_CHARS)}\n\n[truncated for ingest cap]`
      : text

  const content = redactSecrets(`Assistant reply (auto-captured):\n\n${body}`)

  try {
    const res = await fetch(`${bffUrl}/api/gateway/memory/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        content,
        role: "assistant",
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
      logErr(`ok: stored assistant reply via POST /api/gateway/memory/store (${body.length} chars raw)`)
    }
  } catch (e) {
    logErr(`store error: ${e instanceof Error ? e.message : String(e)}`)
  }

  process.stdout.write("{}")
}

main().catch((e) => {
  logErr(`fatal: ${e instanceof Error ? e.message : String(e)}`)
  process.stdout.write("{}")
})
