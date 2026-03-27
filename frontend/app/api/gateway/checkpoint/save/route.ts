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
  const step = typeof body.step === "number" ? body.step : Number(body.step)
  if (!workflow_id || !Number.isFinite(step)) {
    return NextResponse.json({ error: "workflow_id and step are required." }, { status: 400 })
  }

  const state =
    typeof body.state === "object" && body.state !== null ? (body.state as Record<string, unknown>) : {}

  const t0 = Date.now()
  const out = await forwardSubnetJson("/v1/checkpoint/save", {
    method: "POST",
    jsonBody: { workflow_id, step, state },
  })
  const latencyMs = Date.now() - t0

  const now = new Date()
  const { workflows } = await dashboardCollections()
  await workflows.updateOne(
    { userId: auth.userId, externalId: workflow_id },
    {
      $set: { lastStep: step, updatedAt: now, label: workflow_id },
      $setOnInsert: {
        userId: auth.userId,
        externalId: workflow_id,
        createdAt: now,
      },
    },
    { upsert: true },
  )

  await recordActivity({
    userId: auth.userId,
    kind: "checkpoint",
    summary: `checkpoint save · ${workflow_id} step ${step}`,
    metadata: { ok: out.ok, latencyMs, workflow_id, step },
  })

  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status })
}
