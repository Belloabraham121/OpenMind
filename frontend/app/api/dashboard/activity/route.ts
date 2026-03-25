import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { dashboardCollections, ensureDashboardForUser } from "@/lib/dashboard-db"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

function padTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}

export async function GET(request: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  await ensureDashboardForUser(session.user._id)

  const { searchParams } = new URL(request.url)
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number(searchParams.get("limit")) || DEFAULT_LIMIT),
  )
  const cursor = searchParams.get("cursor")

  const { activity } = await dashboardCollections()

  const filter: Record<string, unknown> = { userId: session.user._id }
  if (cursor) {
    try {
      filter._id = { $lt: new ObjectId(cursor) }
    } catch {
      return NextResponse.json({ error: "Invalid cursor." }, { status: 400 })
    }
  }

  const rows = await activity.find(filter).sort({ _id: -1 }).limit(limit + 1).toArray()
  const items = rows.slice(0, limit).map((row) => ({
    id: String(row._id),
    kind: row.kind,
    summary: `${padTime(row.createdAt)}  ${row.kind.slice(0, 12).padEnd(12)} ${row.summary}`,
    createdAt: row.createdAt.toISOString(),
  }))

  const nextCursor = rows.length > limit ? String(rows[limit - 1]._id) : null

  return NextResponse.json({ items, nextCursor })
}
