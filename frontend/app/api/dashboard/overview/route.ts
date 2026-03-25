import { NextResponse } from "next/server"
import { authCollections } from "@/lib/auth-db"
import { dashboardCollections, ensureDashboardForUser } from "@/lib/dashboard-db"
import { forwardSubnetJson } from "@/lib/gateway-proxy"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

function formatChunks(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

function formatLatency(ms: number): string {
  if (ms <= 0) return "—"
  return `${Math.round(ms)} ms`
}

function formatPercent(r: number): string {
  return `${(r * 100).toFixed(1)}%`
}

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDashboardForUser(session.user._id)

  const { sessions } = await authCollections()
  const now = new Date()
  const activeSessions = await sessions.countDocuments({
    userId: session.user._id,
    expiresAt: { $gt: now },
  })

  const { stats, activity } = await dashboardCollections()
  const st = await stats.findOne({ userId: session.user._id })

  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const prevStart = new Date(weekAgo.getTime() - 7 * 24 * 60 * 60 * 1000)
  const [evThisWeek, evPrevWeek] = await Promise.all([
    activity.countDocuments({ userId: session.user._id, createdAt: { $gte: weekAgo } }),
    activity.countDocuments({
      userId: session.user._id,
      createdAt: { $gte: prevStart, $lt: weekAgo },
    }),
  ])

  let eventHint = `${evThisWeek} events (7d)`
  if (evPrevWeek > 0) {
    const delta = Math.round(((evThisWeek - evPrevWeek) / evPrevWeek) * 100)
    eventHint = `${delta >= 0 ? "+" : ""}${delta}% vs prior week · ${evThisWeek} events`
  }

  const queryLatencies = await activity
    .find({
      userId: session.user._id,
      kind: "query",
      "metadata.latencyMs": { $exists: true },
      createdAt: { $gte: weekAgo },
    })
    .project({ "metadata.latencyMs": 1 })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray()

  const latencies = queryLatencies
    .map((d) => Number(d.metadata?.latencyMs))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => a - b)

  const p95FromEvents =
    latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] ?? latencies.at(-1)! : 0

  const storedChunks = st?.storedChunks ?? 0
  const p95Configured = st?.p95RetrievalMs ?? 0
  const p95Display = p95FromEvents > 0 ? p95FromEvents : p95Configured

  const successQueries = await activity.countDocuments({
    userId: session.user._id,
    kind: "query",
    createdAt: { $gte: weekAgo },
    $or: [{ "metadata.ok": true }, { "metadata.ok": { $exists: false } }],
  })
  const failQueries = await activity.countDocuments({
    userId: session.user._id,
    kind: "query",
    createdAt: { $gte: weekAgo },
    "metadata.ok": false,
  })
  const denom = successQueries + failQueries
  const successRateFromEvents = denom > 0 ? successQueries / denom : st?.successRate ?? 0.94

  const baseUrl = process.env.SUBNET_GATEWAY_URL?.trim()
  let gatewayReachable = false
  let gatewayStatus: string | undefined
  if (baseUrl) {
    const gh = await forwardSubnetJson("/v1/health", { method: "GET" })
    gatewayReachable = gh.ok
    const data = gh.data as { status?: string }
    gatewayStatus =
      typeof data?.status === "string" ? data.status : gh.ok ? "ok" : `HTTP ${gh.status}`
  }

  return NextResponse.json({
    metrics: [
      {
        label: "Active sessions",
        value: String(activeSessions),
        hint: eventHint,
      },
      {
        label: "Stored chunks",
        value: formatChunks(storedChunks),
        hint: storedChunks > 0 ? "App + gateway aggregate" : "Lossless tier (baseline)",
      },
      {
        label: "p95 retrieval",
        value: formatLatency(p95Display),
        hint: p95Display > 0 ? "From recent queries" : "Target under 800 ms",
      },
      {
        label: "Success rate",
        value: formatPercent(successRateFromEvents),
        hint: "Query operations (7d)",
      },
    ],
    gateway: {
      configured: Boolean(baseUrl),
      reachable: gatewayReachable,
      status: gatewayStatus,
    },
  })
}
