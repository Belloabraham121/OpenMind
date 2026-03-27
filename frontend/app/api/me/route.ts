import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { ensureAuthIndexes } from "@/lib/auth-db"
import { dashboardCollections, ensureDashboardForUser, updateWorkspaceName } from "@/lib/dashboard-db"
import { getSessionUser } from "@/lib/require-session"
import { subnetSessionIdForUser } from "@/lib/subnet-session"

export const runtime = "nodejs"

type PatchBody = {
  workspaceId?: string
  workspaceName?: string
}

export async function GET() {
  try {
    await ensureAuthIndexes()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Database unavailable." },
      { status: 503 },
    )
  }

  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { workspace } = await ensureDashboardForUser(session.user._id)
  const primaryWorkspaceId = workspace._id ? String(workspace._id) : null

  const { workspaces: wsCol } = await dashboardCollections()
  const list = await wsCol.find({ userId: session.user._id }).sort({ createdAt: 1 }).toArray()

  const userId = String(session.user._id)
  return NextResponse.json({
    /** Subnet memory namespace for this user when no custom session_id is passed (API + MCP default). */
    defaultMemorySessionId: subnetSessionIdForUser(userId),
    user: {
      id: userId,
      email: session.user.email ?? null,
      phone: session.user.phone ?? null,
      emailVerified: session.user.emailVerified,
      phoneVerified: session.user.phoneVerified,
    },
    workspaces: list.map((w) => ({
      id: String(w._id),
      name: w.name,
      slug: w.slug,
    })),
    primaryWorkspaceId,
  })
}

export async function PATCH(request: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: PatchBody = {}
  try {
    body = (await request.json()) as PatchBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const workspaceId = body.workspaceId?.trim()
  const workspaceName = body.workspaceName?.trim()
  if (!workspaceId || !workspaceName) {
    return NextResponse.json({ error: "workspaceId and workspaceName are required." }, { status: 400 })
  }

  let wid: ObjectId
  try {
    wid = new ObjectId(workspaceId)
  } catch {
    return NextResponse.json({ error: "Invalid workspaceId." }, { status: 400 })
  }

  const result = await updateWorkspaceName(session.user._id, wid, workspaceName)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
