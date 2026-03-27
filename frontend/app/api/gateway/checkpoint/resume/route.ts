import { NextResponse } from "next/server"
import { recordActivity } from "@/lib/record-activity"
import { forwardSubnetJson } from "@/lib/gateway-proxy"
import { dashboardCollections } from "@/lib/dashboard-db"
import { getGatewayAuth, gatewayUnauthorized } from "@/lib/gateway-auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await getGatewayAuth(request)
  if (auth instanceof NextResponse) return auth
  if (!auth) {
    return gatewayUnauthorized(request)
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const workflow_id = typeof body.workflow_id === "string" ? body.workflow_id : ""
  if (!workflow_id) {
    return NextResponse.json({ error: "workflow_id is required." }, { status: 400 })
  }

  const t0 = Date.now()
  const out = await forwardSubnetJson("/v1/checkpoint/resume", {
    method: "POST",
    jsonBody: { workflow_id },
  })
  const latencyMs = Date.now() - t0

  const now = new Date()
  const { workflows } = await dashboardCollections()
  await workflows.updateOne(
    { userId: auth.userId, externalId: workflow_id },
    {
      $set: { updatedAt: now, label: workflow_id },
      $setOnInsert: {
        userId: auth.userId,
        externalId: workflow_id,
        createdAt: now,
        lastStep: 0,
      },
    },
    { upsert: true },
  )

  await recordActivity({
    userId: auth.userId,
    kind: "checkpoint",
    summary: `resume · ${workflow_id}`,
    metadata: { ok: out.ok, latencyMs, workflow_id },
  })

  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status })
}
