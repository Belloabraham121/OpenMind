"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiFetch, apiJson } from "@/lib/api-client"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

type WorkflowRow = {
  id: string
  externalId: string
  label: string
  lastStep: number
  updatedAt: string
}

type WorkflowDetail = {
  id: string
  externalId: string
  label: string
  lastStep: number
  createdAt: string
  updatedAt: string
}

export function WorkflowsClient() {
  const [rows, setRows] = useState<WorkflowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)
  const [detail, setDetail] = useState<WorkflowDetail | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await apiJson<{ workflows: WorkflowRow[] }>("/api/dashboard/workflows")
    if (ok && data.workflows) setRows(data.workflows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function loadDetail(externalId: string) {
    if (detailFor === externalId) {
      setDetailFor(null)
      setDetail(null)
      return
    }
    setDetailFor(externalId)
    setDetail(null)
    const { ok, data } = await apiJson<{ workflow: WorkflowDetail }>(
      `/api/dashboard/workflows/${encodeURIComponent(externalId)}`,
    )
    if (ok && data.workflow) setDetail(data.workflow)
  }

  async function resume(externalId: string) {
    setBusy(externalId)
    try {
      const res = await apiFetch("/api/gateway/checkpoint/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow_id: externalId }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        toast.error(body.error ?? "Resume request failed.")
        return
      }
      toast.success("Resume sent to gateway.")
      void load()
    } catch {
      toast.error("Network error.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <DashboardPageIntro
        title="Sessions & Workflows"
        description="Workflows sync from checkpoint save/resume calls proxied to /v1/checkpoint/* on your validator gateway."
      />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading workflows…
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">No workflows yet</CardTitle>
            <CardDescription>
              Checkpoint saves from the API create rows here. You can also resume by external id if the gateway
              already knows the workflow.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Example: use your devtools or a script to POST{" "}
            <code className="rounded bg-muted px-1">/api/gateway/checkpoint/save</code> with{" "}
            <code className="rounded bg-muted px-1">workflow_id</code> and <code className="rounded bg-muted px-1">step</code>.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((w) => (
            <Card key={w.id} className="border-foreground/10 shadow-none">
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="font-display text-xl">{w.label}</CardTitle>
                  <CardDescription className="font-mono text-xs">
                    Last step {w.lastStep} · updated {new Date(w.updatedAt).toLocaleString()}
                  </CardDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-foreground/15"
                    onClick={() => void loadDetail(w.externalId)}
                  >
                    {detailFor === w.externalId ? "Hide detail" : "Detail"}
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                    disabled={busy === w.externalId}
                    onClick={() => void resume(w.externalId)}
                  >
                    {busy === w.externalId ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        Resuming…
                      </>
                    ) : (
                      "Resume latest"
                    )}
                  </Button>
                </div>
              </CardHeader>
              {detailFor === w.externalId && detail && (
                <CardContent className="border-t border-border/60 pt-4 font-mono text-xs text-muted-foreground">
                  <pre className="overflow-x-auto rounded-lg bg-muted/30 p-3">
                    {JSON.stringify(detail, null, 2)}
                  </pre>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
