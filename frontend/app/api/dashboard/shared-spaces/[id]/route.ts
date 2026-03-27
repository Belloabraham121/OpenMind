import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { deleteSharedSpace } from "@/lib/shared-spaces-db"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id: rawId } = await context.params
  let spaceId: ObjectId
  try {
    spaceId = new ObjectId(rawId)
  } catch {
    return NextResponse.json({ error: "Invalid space id." }, { status: 400 })
  }

  const ok = await deleteSharedSpace({ spaceId, ownerId: session.user._id })
  if (!ok) {
    return NextResponse.json(
      { error: "Space not found or you are not the owner." },
      { status: 404 },
    )
  }

  return NextResponse.json({ ok: true })
}
