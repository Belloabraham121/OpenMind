/**
 * Load OPENMIND_* for Cursor hooks from a small dotenv file (no extra deps).
 * Order: ~/.cursor/openmind-hook.env then <project>/.cursor/openmind-hook.env (project wins).
 *
 * Cursor sets CURSOR_PROJECT_DIR to the workspace root when running hooks.
 */
import fs from "node:fs"
import path from "node:path"

function applyEnvFile(filePath) {
  let text = ""
  try {
    text = fs.readFileSync(filePath, "utf8")
  } catch {
    return
  }
  for (const line of text.split("\n")) {
    const s = line.trim()
    if (!s || s.startsWith("#")) continue
    const eq = s.indexOf("=")
    if (eq < 1) continue
    const key = s.slice(0, eq).trim()
    let val = s.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

export function loadOpenmindHookEnv() {
  const home = process.env.HOME?.trim()
  const root = (process.env.CURSOR_PROJECT_DIR || process.cwd()).trim()
  const files = []
  if (home) files.push(path.join(home, ".cursor", "openmind-hook.env"))
  files.push(path.join(root, ".cursor", "openmind-hook.env"))
  for (const p of files) {
    if (p && fs.existsSync(p)) applyEnvFile(p)
  }
}
