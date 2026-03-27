# OpenMind Cursor Plugin (Supermemory-style)

This repository now includes a distributable Cursor plugin layout:

- `.cursor-plugin/plugin.json`
- `rules/openmind-memory-always-on.mdc`
- `hooks/hooks.json`
- `scripts/openmind-session-start.mjs`
- `scripts/openmind-session-end.mjs`
- `scripts/openmind-before-submit-prompt.mjs`
- `scripts/openmind-after-agent-response.mjs`
- `scripts/openmind-after-file-edit.mjs`
- `mcp.json`

## What it does

1. **Session start hook** (`sessionStart`)
   - Calls `POST /api/gateway/memory/query` through your Next.js BFF.
   - Injects relevant memory snippets into conversation context.

2. **Always-on rule**
   - Instructs the agent to:
     - query memory before answering
     - store durable facts after finishing a request

3. **Session end hook** (`sessionEnd`)
   - Stores a redacted transcript excerpt through `POST /api/gateway/memory/store`.

4. **Before each user send** (`beforeSubmitPrompt`)
   - Stores the user’s prompt (redacted, size-capped) as `role: user`, prefix
     **`User prompt (auto-captured):`**. Optional attachment paths are appended as metadata only.
   - Always returns `{ "continue": true }` so the message is never blocked.

5. **After each assistant message** (`afterAgentResponse`)
   - Stores the assistant’s final reply text (redacted, size-capped) as `role: assistant`.
   - Together with `beforeSubmitPrompt`, both sides of each turn appear in Memory Explorer.

6. **After each agent file edit** (`afterFileEdit`)
   - Stores the edited **path** (repo-relative when possible) and **search/replace hunks** from Cursor’s payload as `role: assistant`, prefix **`Code edit (auto-captured):`**.
   - Skips `node_modules`, `.git`, `.next`, and hook secret files. Large patches are truncated per hunk and in total.

Hooks also forward Cursor’s **`generation_id`** and **`conversation_id`** on each store request so the **Memory Explorer** can show one **Composer step** card: your prompt, every file edit in that step, and the assistant reply—instead of three disconnected rows.

This is the same architectural pattern used by "automatic memory" plugins:
**hooks + guidance + MCP tools**.

## Required env vars

Set these in your local environment before using the plugin:

- `OPENMIND_API_KEY` - dashboard API key (`om_live_...`)
- `OPENMIND_BFF_URL` - Next.js app origin, e.g. `http://localhost:3000`
- `OPENMIND_SUBNET_PYTHONPATH` - absolute path to `openmind-subnet` so `python -m gateway.mcp_server` resolves

Example:

```bash
export OPENMIND_API_KEY="om_live_..."
export OPENMIND_BFF_URL="http://localhost:3000"
export OPENMIND_SUBNET_PYTHONPATH="/absolute/path/to/openmind-subnet"
```

## Where Cursor looks for hooks

| Setup | Config file |
|--------|-------------|
| **Open this repo as a workspace** | Project root **`.cursor/hooks.json`** (committed here). Reload on save; restart Cursor if hooks don’t appear. |
| **Installed Cursor plugin** | Plugin’s `hooks/hooks.json` (same commands; paths relative to plugin root). |

The folder `hooks/hooks.json` is the **plugin bundle** copy; day-to-day dev uses **`.cursor/hooks.json`**.

### Verify hooks are running

1. **Cursor → Settings → Hooks** (or **Hooks** output channel): you should see `beforeSubmitPrompt`, `sessionStart`, `sessionEnd`, `afterAgentResponse`, `afterFileEdit` listed for this project.
2. **Trust**: project hooks only run in a **trusted** workspace.
3. **Env for hooks** (pick one):
   - **Recommended:** create **` .cursor/openmind-hook.env`** in this repo (copy from
     **`.cursor/openmind-hook.env.example`**) with `OPENMIND_API_KEY` and `OPENMIND_BFF_URL`.
     It is **gitignored**. Hooks auto-load it via `scripts/load-openmind-hook-env.mjs`.
   - Or put the same file at **`~/.cursor/openmind-hook.env`** to apply to every workspace
     (project file overrides if both exist).
   - Or export vars in your shell and **launch Cursor from that terminal**.
   If hooks still get **401**, the key is not visible to the hook process — use the `.env` file above.
4. **Smoke test `beforeSubmitPrompt`**: send a user message in Agent. Check stderr for
   `ok: stored user prompt…` and Memory Explorer for **`User prompt (auto-captured)`** (same session as your dashboard key).
5. **Smoke test `afterAgentResponse`**: start Agent chat, get a full assistant reply. In the Hooks UI,
   **stdout may show only `{}`** (that is normal — this hook type has no return payload). Check the
   **stderr / log line** from the script: it prints `ok: stored assistant reply…` or a clear
   `skip:` / `store failed:` reason. Then confirm in Memory Explorer an ingest starting with
   **`Assistant reply (auto-captured)`**.
6. **Smoke test `afterFileEdit`**: let Agent change a source file. Check stderr for
   `ok: stored code edit` and Memory Explorer for **`Code edit (auto-captured)`** (path + removed/added snippets).
7. **Smoke test `sessionEnd`**: end/close the composer; check for an ingest with **`Conversation transcript (excerpt`**.

## Notes

- Hook scripts are **fail-open** by design: they never block user workflows if memory service is unavailable.
- `openmind_store` / `openmind_query` now support optional `session_id` in BFF mode, so user namespace can be derived from auth.
- For direct validator mode (no BFF), keep passing `session_id`.

