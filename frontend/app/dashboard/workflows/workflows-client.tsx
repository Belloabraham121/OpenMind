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

export function WorkflowsClient() {
  const [rows, setRows] = useState<WorkflowRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await apiJson<{ workflows: WorkflowRow[] }>("/api/dashboard/workflows")
    if (ok && data.workflows) setRows(data.workflows)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
