import { NextResponse } from "next/server"
import {
  createSharedSpace,
  listSharedSpacesForUser,
} from "@/lib/shared-spaces-db"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await listSharedSpacesForUser(session.user._id)
  return NextResponse.json({
    spaces: rows.map((s) => ({
      id: String(s._id),
      name: s.name,
      slug: s.slug,
      isOwner: s.ownerId.equals(session.user._id),
      memberCount: s.memberUserIds.length,
      walletCount: s.memberWallets.length,
      updatedAt: s.updatedAt.toISOString(),
    })),
  })
}

type PostBody = {
  name?: string
  memberWallets?: string[]
}

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: PostBody = {}
  try {
    body = (await request.json()) as PostBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: "name is required." }, { status: 400 })
  }

  const id = await createSharedSpace({
    ownerId: session.user._id,
    name,
    memberWallets: body.memberWallets,
  })

  return NextResponse.json({ id: String(id), ok: true })
}
