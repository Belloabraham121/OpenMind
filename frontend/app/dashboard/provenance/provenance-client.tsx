"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetch, apiJson } from "@/lib/api-client"
import { subnetSessionIdForUser } from "@/lib/subnet-session"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

export function ProvenanceClient() {
  const [sessionId, setSessionId] = useState("")
  const [asOf, setAsOf] = useState("")
  const [versionId, setVersionId] = useState("")
  const [diffSince, setDiffSince] = useState("")
  const [loading, setLoading] = useState(false)
  const [resultText, setResultText] = useState<string | null>(null)
  const [meId, setMeId] = useState<string | null>(null)

  const loadDefaultSession = useCallback(async () => {
    const { ok, data } = await apiJson<{ user?: { id: string } }>("/api/me")
    const userId = data.user?.id
    if (ok && userId) {
      setMeId(userId)
      setSessionId((s) => s || subnetSessionIdForUser(userId))
    }
  }, [])

  useEffect(() => {
    void loadDefaultSession()
  }, [loadDefaultSession])

  async function runVersion() {
    setLoading(true)
    setResultText(null)
    try {
      const sid = sessionId.trim()
      if (!sid) {
        toast.error("session_id is required.")
        return
      }
      const res = await apiFetch("/api/gateway/memory/version", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sid,
          as_of_timestamp: asOf.trim() || undefined,
          version_id: versionId.trim() || undefined,
          diff_since: diffSince.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error((data as { error?: string }).error ?? "Version request failed.")
        setResultText(JSON.stringify(data, null, 2))
        return
      }
      setResultText(JSON.stringify(data, null, 2))
      toast.success("Loaded version response from gateway.")
    } catch {
      toast.error("Network error.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <DashboardPageIntro
        title="Provenance & Time Travel"
        description="POST /api/gateway/memory/version proxies to the validator. Session id defaults to om-{userId} from your account."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2 md:col-span-2 lg:col-span-1">
          <Label htmlFor="sess" className="font-mono text-xs uppercase tracking-wide">
            session_id
          </Label>
          <Input
            id="sess"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder={meId ? subnetSessionIdForUser(meId) : "om-…"}
            className="rounded-lg border-foreground/15 font-mono text-sm"
          />
          <Button type="button" variant="outline" size="sm" className="rounded-full text-xs" onClick={() => void loadDefaultSession()}>
            Fill from account
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="as-of" className="font-mono text-xs uppercase tracking-wide">
            as_of_timestamp
          </Label>
          <Input
            id="as-of"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            placeholder="2026-03-16T11:42:00Z"
            className="rounded-lg border-foreground/15 font-mono text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="version" className="font-mono text-xs uppercase tracking-wide">
            version_id
          </Label>
          <Input
            id="version"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            placeholder="a9f2c1…"
            className="rounded-lg border-foreground/15 font-mono text-sm"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="diff" className="font-mono text-xs uppercase tracking-wide">
            diff_since
          </Label>
          <Input
            id="diff"
            value={diffSince}
            onChange={(e) => setDiffSince(e.target.value)}
            placeholder="version hash or ISO timestamp"
            className="rounded-lg border-foreground/15 font-mono text-sm"
          />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90"
            onClick={() => void runVersion()}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Requesting…
              </>
            ) : (
              "Run time-travel / diff"
            )}
          </Button>
        </div>
      </div>
      <Card className="border-foreground/10 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-xl">Gateway response</CardTitle>
        </CardHeader>
        <CardContent>
          {resultText ? (
            <pre className="max-h-[480px] overflow-auto rounded-lg border border-foreground/10 bg-muted/30 p-4 font-mono text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap">
              {resultText}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">
              Submit to see `version_diff`, `provenance_path`, and `results` from the subnet.
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
