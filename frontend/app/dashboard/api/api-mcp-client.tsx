"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch } from "@/lib/api-client"
import { toast } from "sonner"
import { Copy, Loader2, Trash2 } from "lucide-react"

type ApiKeyRow = {
  id: string
  name: string
  hint: string
  createdAt: string
  lastUsedAt: string | null
  requestCountTotal: number
  requestCountToday: number
}

function origin(): string {
  if (typeof window === "undefined") return ""
  return window.location.origin
}

export function ApiMcpClient() {
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState("")
  const [revealedOnce, setRevealedOnce] = useState<string | null>(null)
  const [quotaPerDay, setQuotaPerDay] = useState<number | null>(null)
  const [defaultMemorySessionId, setDefaultMemorySessionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await apiFetch("/api/auth/api-keys")
    if (!res.ok) {
      setLoading(false)
      toast.error("Could not load API keys.")
      return
    }
    const data = (await res.json()) as { keys: ApiKeyRow[]; quotaPerDay: number | null }
    setKeys(data.keys ?? [])
    setQuotaPerDay(data.quotaPerDay ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    void (async () => {
      const res = await apiFetch("/api/me")
      const data = (await res.json().catch(() => ({}))) as { defaultMemorySessionId?: string }
      if (res.ok && data.defaultMemorySessionId) {
        setDefaultMemorySessionId(data.defaultMemorySessionId)
      }
    })()
  }, [])

  async function createKey() {
    setCreating(true)
    try {
      const res = await apiFetch("/api/auth/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyLabel || "API key" }),
      })
      const data = (await res.json()) as { key?: string; error?: string; message?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Could not create key.")
        return
      }
      if (data.key) {
        setRevealedOnce(data.key)
        try {
          await navigator.clipboard.writeText(data.key)
          toast.success(data.message ?? "Key created and copied.")
        } catch {
          toast.success(data.message ?? "Key created — copy it from below.")
        }
      }
      setNewKeyLabel("")
      await load()
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this API key? MCP clients using it will stop working.")) return
    const res = await apiFetch(`/api/auth/api-keys/${id}`, { method: "DELETE" })
    const data = (await res.json()) as { error?: string }
    if (!res.ok) {
      toast.error(data.error ?? "Could not revoke.")
      return
    }
    toast.success("Key revoked.")
    await load()
  }

  const base = origin()
  const mcpSnippet = `{
  "mcpServers": {
    "openmind": {
      "command": "python",
      "args": [
        "-m",
        "gateway.mcp_server",
        "--bff-url",
        "${base || "http://localhost:3000"}",
        "--api-key",
        "${revealedOnce ?? "om_live_YOUR_KEY_HERE"}"
      ]
    }
  }
}`

  return (
    <>
      <DashboardPageIntro
        title="API & MCP"
        description="Create keys for scripts and MCP. Pass Authorization: Bearer om_live_… to the same /api/gateway/* routes you use from the browser, or run the Python MCP bridge in --bff-url mode."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">API keys</CardTitle>
            <CardDescription>
              Secrets are shown once at creation. Stored as a hash server-side.
              {quotaPerDay != null ? (
                <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                  Daily quota per key: {quotaPerDay.toLocaleString()} requests (UTC) · 429 when exceeded.
                </span>
              ) : (
                <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                  Daily quota: unlimited (set API_KEY_DAILY_QUOTA to enforce).
                </span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="font-mono text-xs uppercase tracking-wide">Base URL</Label>
              <Input readOnly value={base || "…"} className="font-mono text-sm" />
            </div>
            {defaultMemorySessionId ? (
              <div className="space-y-1 rounded-lg border border-foreground/10 bg-muted/20 p-3">
                <Label className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  Default memory session_id (Explorer + MCP)
                </Label>
                <p className="font-mono text-xs break-all">{defaultMemorySessionId}</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Pass this as <code className="rounded bg-muted px-0.5">session_id</code> in{" "}
                  <code className="rounded bg-muted px-0.5">openmind_store</code> /{" "}
                  <code className="rounded bg-muted px-0.5">openmind_query</code> so Memory Explorer
                  sees the same namespace. Custom ids only show in Explorer if you enter them there.
                </p>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="key-name">New key label</Label>
              <Input
                id="key-name"
                value={newKeyLabel}
                onChange={(e) => setNewKeyLabel(e.target.value)}
                placeholder="CI / Claude Desktop"
                className="rounded-lg border-foreground/15"
              />
            </div>
            {revealedOnce && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 font-mono text-xs break-all">
                <span className="text-muted-foreground">Save now: </span>
                {revealedOnce}
              </div>
            )}
            <Button
              className="rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={() => void createKey()}
              disabled={creating}
            >
              {creating ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create API key"
              )}
            </Button>
            <div className="border-t border-border/60 pt-4">
              <p className="mb-2 text-xs font-mono uppercase tracking-wide text-muted-foreground">
                Active keys
              </p>
              {loading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : keys.length === 0 ? (
                <p className="text-sm text-muted-foreground">No keys yet.</p>
              ) : (
                <ul className="space-y-2">
                  {keys.map((k) => (
                    <li
                      key={k.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-foreground/10 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">{k.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {k.hint} · {(k.requestCountTotal ?? 0).toLocaleString()} total ·{" "}
                          {(k.requestCountToday ?? 0).toLocaleString()} today
                          {quotaPerDay != null ? ` / ${quotaPerDay.toLocaleString()}` : ""}
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="shrink-0 text-destructive"
                        aria-label={`Revoke ${k.name}`}
                        onClick={() => void revoke(k.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">MCP (stdio)</CardTitle>
            <CardDescription>
              From repo root <code className="rounded bg-muted px-1">openmind-subnet/</code>, with your venv
              activated:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <pre className="max-h-80 overflow-auto rounded-lg border border-foreground/10 bg-muted/30 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
              {mcpSnippet}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-foreground/15"
              onClick={() => {
                void navigator.clipboard.writeText(mcpSnippet).then(
                  () => toast.success("Config copied."),
                  () => toast.error("Could not copy."),
                )
              }}
            >
              <Copy className="mr-2 size-4" />
              Copy JSON
            </Button>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Use <strong>--bff-url</strong> so traffic goes through this app (subnet URL stays server-side).
              Use <strong>--api-url</strong> only for local validator access without Next.js.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
