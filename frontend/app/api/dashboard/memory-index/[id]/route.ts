import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { dashboardCollections, ensureDashboardForUser } from "@/lib/dashboard-db"
import { getSessionUser } from "@/lib/require-session"
import type { MemoryIngestDetail } from "@/lib/types/dashboard"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDashboardForUser(session.user._id)

  const { id } = await context.params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 })
  }

  const { activity } = await dashboardCollections()
  const row = await activity.findOne({
    _id: oid,
    userId: session.user._id,
    kind: "ingest",
  })

  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 })
  }

  const meta = row.metadata ?? {}
  const stored =
    typeof meta.storedContent === "string" && meta.storedContent.length > 0
      ? meta.storedContent
      : null

  const body: MemoryIngestDetail = {
    id: String(row._id),
    createdAt: row.createdAt.toISOString(),
    summary: row.summary,
    sessionId: typeof meta.sessionId === "string" ? meta.sessionId : null,
    role: typeof meta.role === "string" ? meta.role : null,
    gatewayOk: typeof meta.ok === "boolean" ? meta.ok : null,
    gatewayStatus: typeof meta.gatewayStatus === "number" ? meta.gatewayStatus : null,
    latencyMs: typeof meta.latencyMs === "number" ? meta.latencyMs : null,
    storedContent: stored,
    contentLength: typeof meta.contentLength === "number" ? meta.contentLength : null,
    contentTruncated: meta.contentTruncated === true,
    assetId: typeof meta.assetId === "string" ? meta.assetId : null,
    filename: typeof meta.filename === "string" ? meta.filename : null,
    cursorGenerationId:
      typeof meta.cursorGenerationId === "string" ? meta.cursorGenerationId : null,
    cursorConversationId:
      typeof meta.cursorConversationId === "string" ? meta.cursorConversationId : null,
  }

  return NextResponse.json(body)
}
