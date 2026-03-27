import { NextResponse } from "next/server"
import { dashboardCollections, ensureDashboardForUser } from "@/lib/dashboard-db"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function GET(
  _request: Request,
  context: { params: Promise<{ externalId: string }> },
) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDashboardForUser(session.user._id)
  const { externalId } = await context.params
  const id = decodeURIComponent(externalId || "").trim()
  if (!id) {
    return NextResponse.json({ error: "Invalid workflow id." }, { status: 400 })
  }

  const { workflows } = await dashboardCollections()
  const w = await workflows.findOne({ userId: session.user._id, externalId: id })
  if (!w) {
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 })
  }

  return NextResponse.json({
    workflow: {
      id: String(w._id),
      externalId: w.externalId,
      label: w.label ?? w.externalId,
      lastStep: w.lastStep ?? 0,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    },
  })
}
