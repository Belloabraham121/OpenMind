import { NextResponse } from "next/server"
import { ensureDashboardForUser, dashboardCollections } from "@/lib/dashboard-db"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDashboardForUser(session.user._id)
  const { workflows } = await dashboardCollections()
  const list = await workflows
    .find({ userId: session.user._id })
    .sort({ updatedAt: -1 })
    .limit(50)
    .toArray()

  return NextResponse.json({
    workflows: list.map((w) => ({
      id: String(w._id),
      externalId: w.externalId,
      label: w.label ?? w.externalId,
      lastStep: w.lastStep ?? 0,
      updatedAt: w.updatedAt.toISOString(),
    })),
  })
}
