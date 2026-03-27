import fs from "node:fs/promises"
import { loadOpenmindHookEnv } from "./load-openmind-hook-env.mjs"

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

  let seed = "Relevant user goals and prior decisions."
  if (typeof transcriptPath === "string" && transcriptPath.trim()) {
    const txt = await fs.readFile(transcriptPath).catch(() => "")
    if (txt) seed = tail(txt, 4000)
  }

  let additional_context = ""
  try {
    const res = await fetch(`${bffUrl}/api/gateway/memory/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query: seed,
        top_k: 6,
        smart: true,
      }),
    })

    const data = await res.json().catch(() => ({}))
    const results = Array.isArray(data?.results) ? data.results : []

    const snippets = results
      .slice(0, 4)
      .map((r, i) => {
        const s = extractSnippetFromMemoryItem(r)
        const cleaned = s.replace(/\s+/g, " ").trim()
        return cleaned ? `- ${cleaned.slice(0, 500)}` : `- [memory item ${i + 1} unavailable]`
      })
      .filter(Boolean)

    if (snippets.length) {
      additional_context = [
        "Relevant OpenMind memories (read-only):",
        ...snippets,
        "",
        "Use these memories when relevant. If anything conflicts with the current user message, trust the latest user instruction.",
      ].join("\n")
    }
  } catch {
    // Fail-open by design.
  }

  process.stdout.write(JSON.stringify({ additional_context }))
}

main().catch(() => {
  process.stdout.write(JSON.stringify({}))
})

