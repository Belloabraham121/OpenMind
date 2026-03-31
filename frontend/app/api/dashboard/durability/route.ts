import { NextResponse } from "next/server"
import { dashboardCollections, ensureDashboardForUser } from "@/lib/dashboard-db"
import { forwardSubnetJson, getSubnetGatewayBaseUrl } from "@/lib/gateway-proxy"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDashboardForUser(session.user._id)
  const { stats, activity } = await dashboardCollections()
  const st = await stats.findOne({ userId: session.user._id })

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [ingestWeek, queryWeek] = await Promise.all([
    activity.countDocuments({ userId: session.user._id, kind: "ingest", createdAt: { $gte: weekAgo } }),
    activity.countDocuments({ userId: session.user._id, kind: "query", createdAt: { $gte: weekAgo } }),
  ])

  const chunks = st?.storedChunks ?? 0

  let gatewayOk: boolean | null = null
  let coveragePercent = 0
  let durabilityMeta = "No validator durability telemetry yet."
  if (getSubnetGatewayBaseUrl()) {
    const [gh, dd] = await Promise.all([
      forwardSubnetJson("/v1/health", { method: "GET" }),
      forwardSubnetJson("/v1/subnet/durability", { method: "GET" }),
    ])
    gatewayOk = gh.ok
    if (dd.ok && dd.data && typeof dd.data === "object") {
      const payload = dd.data as {
        durability_score?: unknown
        window_samples?: unknown
      }
      const score = Number(payload.durability_score)
      const samples = Number(payload.window_samples)
      if (Number.isFinite(score)) {
        coveragePercent = Math.max(0, Math.min(100, Math.round(score)))
        durabilityMeta = Number.isFinite(samples)
          ? `Validator challenge-derived durability score (${samples} samples)`
          : "Validator challenge-derived durability score"
      }
    }
  }

  return NextResponse.json({
    summary: {
      label: "Default durability",
      description: "Validator-derived durability from live storage/version/reconstruction challenges.",
      coveragePercent,
      meta: `${durabilityMeta} · ${ingestWeek} ingest events (7d) · ${queryWeek} queries (7d) · ${chunks} stored chunks`,
    },
    repairQueue: [
      {
        id: "rq-1",
        label: "Shard verification sweep",
        status: gatewayOk === false ? "degraded" : "nominal",
        detail:
          gatewayOk === false
            ? "Gateway unreachable — check SUBNET_GATEWAY_URL"
            : gatewayOk === true
              ? "Validator health OK"
              : "Gateway not configured",
      },
    ],
    storedChunks: chunks,
    gatewayConfigured: Boolean(getSubnetGatewayBaseUrl()),
    gatewayReachable: gatewayOk,
  })
}
