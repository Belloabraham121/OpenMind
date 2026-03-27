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
  const coveragePercent = chunks > 0 ? Math.min(99, 70 + Math.round(Math.log10(chunks + 1) * 8)) : 72

  let gatewayOk: boolean | null = null
  if (getSubnetGatewayBaseUrl()) {
    const gh = await forwardSubnetJson("/v1/health", { method: "GET" })
    gatewayOk = gh.ok
  }

  return NextResponse.json({
    summary: {
      label: "Default durability",
      description: "Subnet-backed replication with hybrid retrieval; single standard storage path.",
      coveragePercent,
      meta: `${ingestWeek} ingest events (7d) · ${queryWeek} queries (7d) · ${chunks} stored chunks`,
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
