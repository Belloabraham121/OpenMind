import { loadOpenmindHookEnv } from "./load-openmind-hook-env.mjs"
import { cursorHookStoreFields } from "./cursor-hook-store-fields.mjs"

/**
 * Cursor hook: afterFileEdit
 * Persists agent file edits (path + search/replace snippets) to OpenMind.
 *
 * Input (Cursor): base fields + { "file_path": "<abs>", "edits": [{ "old_string", "new_string" }, ...] }
 *
 * Stderr: status for Hooks panel. Does not block edits.
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
  console.error(`[openmind-hook afterFileEdit] ${msg}`)
}

function shouldSkipPath(absPath) {
  if (typeof absPath !== "string" || !absPath) return true
  const norm = absPath.replace(/\\/g, "/")
  if (norm.includes("/node_modules/")) return true
  if (norm.includes("/.git/") || norm.endsWith("/.git")) return true
  if (norm.includes("/.next/")) return true
  if (norm.endsWith("openmind-hook.env")) return true
  return false
}

/** Prefer repo-relative path for readability. */
function displayPath(absPath, workspaceRoots) {
  if (typeof absPath !== "string") return ""
  const norm = absPath.replace(/\\/g, "/")
  if (!Array.isArray(workspaceRoots)) return absPath
  let best = ""
  for (const root of workspaceRoots) {
    if (typeof root !== "string" || !root) continue
    const r = root.replace(/\\/g, "/").replace(/\/$/, "")
    if (norm === r) return "."
    if (norm.startsWith(r + "/")) {
      const rel = norm.slice(r.length + 1)
      if (!best || rel.length < best.length) best = rel
    }
  }
  return best || absPath
}

const MAX_EDITS = 40
/** Per old/new string; dashboard activity cap is ~150k total stored body. */
const MAX_SNIPPET_CHARS = 24_000
const MAX_TOTAL_CHARS = 140_000

function trimSnippet(text) {
  if (typeof text !== "string") return "(missing)"
  if (text.length <= MAX_SNIPPET_CHARS) return text
  return `${text.slice(0, MAX_SNIPPET_CHARS)}\n\n… [truncated ${text.length - MAX_SNIPPET_CHARS} chars]`
}

function buildContent(input) {
  const abs = typeof input.file_path === "string" ? input.file_path.trim() : ""
  const rel = displayPath(abs, input.workspace_roots)
  const edits = Array.isArray(input.edits) ? input.edits : []

  const lines = []
  lines.push("Code edit (auto-captured):", "")
  lines.push(`- **File:** \`${rel.replace(/`/g, "'")}\``)
  lines.push("")

  if (edits.length === 0) {
    lines.push(
      "*No `edits` array in hook payload — file may have been created or patched without search/replace snippets.*",
    )
  } else {
    const slice = edits.slice(0, MAX_EDITS)
    slice.forEach((ed, i) => {
      if (!ed || typeof ed !== "object") return
      const oldS = typeof ed.old_string === "string" ? ed.old_string : ""
      const newS = typeof ed.new_string === "string" ? ed.new_string : ""
      lines.push(`### Edit ${i + 1}`, "")
      lines.push("**Removed:**", "")
      lines.push("```")
      lines.push(trimSnippet(redactSecrets(oldS)))
      lines.push("```", "")
      lines.push("**Added:**", "")
      lines.push("```")
      lines.push(trimSnippet(redactSecrets(newS)))
      lines.push("```", "")
    })
    if (edits.length > MAX_EDITS) {
      lines.push(`*… and ${edits.length - MAX_EDITS} more edits not included (cap ${MAX_EDITS}).*`, "")
    }
  }

  let body = lines.join("\n")
  if (body.length > MAX_TOTAL_CHARS) {
    body = `${body.slice(0, MAX_TOTAL_CHARS)}\n\n[truncated: total ingest cap]`
  }
  return redactSecrets(body)
}

async function main() {
  loadOpenmindHookEnv()
  const input = await readStdinJson()

  const apiKey = process.env.OPENMIND_API_KEY?.trim()
  if (!apiKey) {
    logErr(
      "skip: OPENMIND_API_KEY missing — use .cursor/openmind-hook.env (see OPENMIND_CURSOR_PLUGIN.md)",
    )
    return
  }

  const absPath = typeof input.file_path === "string" ? input.file_path : ""
  if (!absPath.trim()) {
    logErr("skip: no file_path")
    return
  }

  if (shouldSkipPath(absPath)) {
    logErr(`skip: path policy (${displayPath(absPath, input.workspace_roots) || absPath})`)
    return
  }

  const edits = Array.isArray(input.edits) ? input.edits : []
  const content = buildContent(input)
  const bffUrl = (process.env.OPENMIND_BFF_URL ?? "http://localhost:3000")
    .trim()
    .replace(/\/$/, "")

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
      const rel = displayPath(absPath, input.workspace_roots)
      const n = edits.length
      logErr(
        `ok: stored code edit (${n} patch(es)) ${rel || absPath} → POST /api/gateway/memory/store`,
      )
    }
  } catch (e) {
    logErr(`store error: ${e instanceof Error ? e.message : String(e)}`)
  }
}

main().catch((e) => {
  logErr(`fatal: ${e instanceof Error ? e.message : String(e)}`)
})
