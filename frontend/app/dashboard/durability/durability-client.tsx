"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { apiJson } from "@/lib/api-client"
import { Loader2 } from "lucide-react"

type Summary = {
  label: string
  description: string
  coveragePercent: number
  meta: string
}

type Repair = {
  id: string
  label: string
  status: string
  detail: string
}

type DurabilityPayload = {
  summary: Summary
  repairQueue: Repair[]
  storedChunks: number
  gatewayConfigured: boolean
  gatewayReachable: boolean | null
}

export function DurabilityClient() {
  const [data, setData] = useState<DurabilityPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data: d } = await apiJson<DurabilityPayload>("/api/dashboard/durability")
    if (ok && d) setData(d)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <DashboardPageIntro
        title="Durability & Storage"
        description="Coverage comes from validator challenge outcomes and reflects live subnet durability telemetry."
      />
      {loading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            Stored chunks (control plane):{" "}
            <span className="font-mono text-foreground">{data.storedChunks}</span>
            {data.gatewayConfigured ? (
              <> · Gateway: {data.gatewayReachable ? "reachable" : "unreachable"}</>
            ) : (
              <> · Gateway not configured</>
            )}
          </p>
          <Card className="border-foreground/10 shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-xl">{data.summary.label}</CardTitle>
              <CardDescription>{data.summary.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{data.summary.meta}</p>
              <Progress value={data.summary.coveragePercent} className="h-2" />
              <p className="font-mono text-xs text-muted-foreground">Coverage {data.summary.coveragePercent}%</p>
            </CardContent>
          </Card>
          <Card className="border-foreground/10 shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-xl">Repair & verification queue</CardTitle>
              <CardDescription>Gateway/validator status signals while repair telemetry matures</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.repairQueue.map((r) => (
                <div
                  key={r.id}
                  className="rounded-lg border border-foreground/10 px-4 py-3 text-sm"
                >
                  <div className="font-medium">{r.label}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {r.status} — {r.detail}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
