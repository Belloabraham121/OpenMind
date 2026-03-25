import { NextResponse } from "next/server"
import { recordActivity } from "@/lib/record-activity"
import { forwardSubnetJson } from "@/lib/gateway-proxy"
import { dashboardCollections } from "@/lib/dashboard-db"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
    { userId: session.user._id, externalId: workflow_id },
    {
      $set: { updatedAt: now, label: workflow_id },
      $setOnInsert: {
        userId: session.user._id,
        externalId: workflow_id,
        createdAt: now,
        lastStep: 0,
      },
    },
    { upsert: true },
  )

  await recordActivity({
    userId: session.user._id,
    kind: "checkpoint",
    summary: `resume · ${workflow_id}`,
    metadata: { ok: out.ok, latencyMs, workflow_id },
  })

  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status })
}
