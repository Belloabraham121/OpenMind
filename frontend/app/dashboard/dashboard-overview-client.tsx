"use client"

import { useCallback, useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import Link from "next/link"
import { ArrowRight, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import type { ActivityItem, OverviewMetric, OverviewResponse } from "@/lib/types/dashboard"

const METRIC_SKELETON_COUNT = 4
const ACTIVITY_SKELETON_ROWS = 6

export function DashboardOverviewClient() {
  const [metrics, setMetrics] = useState<OverviewMetric[] | null>(null)
  const [gatewayHint, setGatewayHint] = useState<string | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [actLoading, setActLoading] = useState(true)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [overviewError, setOverviewError] = useState<string | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)

  const loadOverview = useCallback(async () => {
    setOverviewError(null)
    setOverviewLoading(true)
    try {
      const res = await apiFetch("/api/dashboard/overview")
      if (!res.ok) {
        setOverviewError("Could not load overview.")
        setMetrics(null)
        return
      }
      const data = (await res.json()) as OverviewResponse
      setMetrics(data.metrics)
      if (data.gateway.configured) {
        setGatewayHint(
          data.gateway.reachable
            ? `Gateway: ${data.gateway.status ?? "reachable"}`
            : "Gateway URL set but not reachable.",
        )
      } else {
        setGatewayHint("Set SUBNET_GATEWAY_URL to connect the validator API.")
      }
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const loadActivity = useCallback(async (cursor?: string | null) => {
    setActLoading(true)
    const params = new URLSearchParams({ limit: "12" })
    if (cursor) params.set("cursor", cursor)
    const res = await apiFetch(`/api/dashboard/activity?${params}`)
    if (!res.ok) {
      setActLoading(false)
      return
    }
    const body = (await res.json()) as { items: ActivityItem[]; nextCursor: string | null }
    if (cursor) {
      setActivity((prev) => [...prev, ...body.items])
    } else {
      setActivity(body.items)
    }
    setNextCursor(body.nextCursor)
    setActLoading(false)
  }, [])

  useEffect(() => {
    void loadOverview()
    void loadActivity()
  }, [loadOverview, loadActivity])

  return (
    <>
      <DashboardPageIntro
        title="Overview"
        description={
          gatewayHint
            ? `Operational snapshot from your workspace. ${gatewayHint}`
            : "Operational snapshot of memory health, retrieval performance, and recent agent activity."
        }
      />

      {overviewError && (
        <p className="mb-4 text-sm text-destructive">{overviewError}</p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {overviewLoading
          ? Array.from({ length: METRIC_SKELETON_COUNT }).map((_, i) => (
              <Card key={`metric-skel-${i}`} className="border-foreground/10 shadow-none">
                <CardHeader className="pb-2">
                  <Skeleton className="mb-3 h-3 w-24" />
                  <Skeleton className="h-9 w-16 max-w-24" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-4/5" />
                </CardContent>
              </Card>
            ))
          : metrics?.map((k) => (
              <Card key={k.label} className="border-foreground/10 shadow-none">
                <CardHeader className="pb-2">
                  <CardDescription className="font-mono text-xs uppercase tracking-wide">
                    {k.label}
                  </CardDescription>
                  <CardTitle className="font-display text-3xl tabular-nums">{k.value}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">{k.hint}</CardContent>
              </Card>
            ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="border-foreground/10 shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-display text-xl">Recent activity</CardTitle>
            <CardDescription>Ingest, query, checkpoint, and auth events from your account</CardDescription>
          </CardHeader>
          <CardContent>
            {actLoading && activity.length === 0 ? (
              <ul className="space-y-3 font-mono text-sm" aria-busy="true" aria-label="Loading activity">
                {Array.from({ length: ACTIVITY_SKELETON_ROWS }).map((_, i) => (
                  <li
                    key={`act-skel-${i}`}
                    className="border-b border-border/60 pb-3 last:border-0 last:pb-0"
                  >
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="mt-2 h-4 w-[92%]" />
                  </li>
                ))}
              </ul>
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No events yet. Run a memory search or sign in again to populate this feed.
              </p>
            ) : (
              <ul className="space-y-3 font-mono text-sm">
                {activity.map((row) => (
                  <li
                    key={row.id}
                    className="border-b border-border/60 pb-3 last:border-0 last:pb-0 text-muted-foreground"
                  >
                    {row.summary}
                  </li>
                ))}
              </ul>
            )}
            {nextCursor && (
              <Button
                variant="outline"
                className="mt-4 rounded-full border-foreground/15"
                disabled={actLoading}
                onClick={() => void loadActivity(nextCursor)}
              >
                {actLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">Quick actions</CardTitle>
            <CardDescription>Dashboard tabs wired to gateway-backed APIs</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" className="justify-between rounded-full border-foreground/15" asChild>
              <Link href="/dashboard/explorer">
                Memory Explorer
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between rounded-full border-foreground/15" asChild>
              <Link href="/dashboard/workflows">
                Sessions &amp; Workflows
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between rounded-full border-foreground/15" asChild>
              <Link href="/dashboard/api">
                API &amp; MCP
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
