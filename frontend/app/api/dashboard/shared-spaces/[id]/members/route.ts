import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { authCollections, normalizeEmail } from "@/lib/auth-db"
import {
  addSpaceMember,
  addSpaceWallet,
  getSharedSpaceIfAllowed,
  removeSpaceMember,
  removeSpaceWallet,
} from "@/lib/shared-spaces-db"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

type ActionBody = {
  action?: "add_member_email" | "remove_member" | "add_wallet" | "remove_wallet"
  email?: string
  userId?: string
  wallet?: string
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const space = await getSharedSpaceIfAllowed(spaceId, session.user._id)
  if (!space) {
    return NextResponse.json({ error: "Space not found or access denied." }, { status: 403 })
  }
  if (!space.ownerId.equals(session.user._id)) {
    return NextResponse.json({ error: "Only the space owner can change members." }, { status: 403 })
  }

  let body: ActionBody = {}
  try {
    body = (await request.json()) as ActionBody
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const ownerId = session.user._id

  if (body.action === "add_wallet") {
    const ok = await addSpaceWallet({ spaceId, ownerId, wallet: body.wallet ?? "" })
    if (!ok) return NextResponse.json({ error: "Could not add wallet." }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "remove_wallet") {
    const ok = await removeSpaceWallet({ spaceId, ownerId, wallet: body.wallet ?? "" })
    if (!ok) return NextResponse.json({ error: "Could not remove wallet." }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === "add_member_email") {
    const email = normalizeEmail(body.email)
    if (!email) {
      return NextResponse.json({ error: "Valid email required." }, { status: 400 })
    }
    const { users } = await authCollections()
    const user = await users.findOne({ email })
    if (!user?._id) {
      return NextResponse.json(
        { error: "No registered user with that email. They must sign up first." },
        { status: 404 },
      )
    }
    if (user._id.equals(ownerId)) {
      return NextResponse.json({ error: "Owner is already a member." }, { status: 400 })
    }
    const ok = await addSpaceMember({ spaceId, ownerId, memberUserId: user._id })
    if (!ok) return NextResponse.json({ error: "Could not add member." }, { status: 400 })
    return NextResponse.json({ ok: true, userId: String(user._id) })
  }

  if (body.action === "remove_member") {
    const uid = body.userId?.trim()
    if (!uid) {
      return NextResponse.json({ error: "userId required." }, { status: 400 })
    }
    let memberId: ObjectId
    try {
      memberId = new ObjectId(uid)
    } catch {
      return NextResponse.json({ error: "Invalid userId." }, { status: 400 })
    }
    if (memberId.equals(ownerId)) {
      return NextResponse.json({ error: "Cannot remove owner." }, { status: 400 })
    }
    const ok = await removeSpaceMember({ spaceId, ownerId, memberUserId: memberId })
    if (!ok) return NextResponse.json({ error: "Could not remove member." }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 })
}
