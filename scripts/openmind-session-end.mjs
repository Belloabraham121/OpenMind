import fs from "node:fs/promises"
import { loadOpenmindHookEnv } from "./load-openmind-hook-env.mjs"

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

function tail(text, n) {
  if (typeof text !== "string") return ""
  if (text.length <= n) return text
  return text.slice(-n)
}

async function main() {
  loadOpenmindHookEnv()
  const input = await readStdinJson()

  const apiKey = process.env.OPENMIND_API_KEY?.trim()
  if (!apiKey) {
    process.stdout.write(JSON.stringify({}))
    return
  }

  const bffUrl = (process.env.OPENMIND_BFF_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "")
  const transcriptPath = input.transcript_path ?? process.env.CURSOR_TRANSCRIPT_PATH
  if (typeof transcriptPath !== "string" || !transcriptPath.trim()) {
    process.stdout.write(JSON.stringify({}))
    return
  }

  const transcript = await fs.readFile(transcriptPath).catch(() => "")
  if (!transcript) {
    process.stdout.write(JSON.stringify({}))
    return
  }

  const excerpt = tail(transcript, 12000)
  const content = redactSecrets(
    `Conversation transcript (excerpt, auto-stored on session end):\n\n${excerpt}`,
  )
  if (!content.trim()) {
    process.stdout.write(JSON.stringify({}))
    return
  }

  try {
    await fetch(`${bffUrl}/api/gateway/memory/store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        content,
        role: "assistant",
        multimodal_type: "text",
      }),
    })
  } catch {
    // Fail-open by design.
  }

  process.stdout.write(JSON.stringify({}))
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}))
})

