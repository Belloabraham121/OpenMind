import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { ObjectId } from "mongodb"
import { authCollections } from "@/lib/auth-db"
import { authWaitlistBlockedResponse, isAuthOpen } from "@/lib/auth-access"

export const runtime = "nodejs"

type Body = {
  userId?: string
  code?: string
  newPassword?: string
}

export async function POST(request: Request) {
  if (!isAuthOpen()) {
    return authWaitlistBlockedResponse()
  }

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body.userId || !body.code || !body.newPassword) {
    return NextResponse.json(
      { error: "userId, code, and newPassword are required." },
      { status: 400 },
    )
  }
  if (body.newPassword.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 },
    )
  }
  if (!ObjectId.isValid(body.userId)) {
    return NextResponse.json({ error: "Invalid userId." }, { status: 400 })
  }

  const { users, codes, sessions } = await authCollections()
  const userId = new ObjectId(body.userId)
  const code = await codes.findOne({
    userId,
    purpose: "password_reset",
    code: body.code.trim(),
    expiresAt: { $gt: new Date() },
  })
  if (!code) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 })
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 12)
  await users.updateOne(
    { _id: userId },
    { $set: { passwordHash, updatedAt: new Date() } },
  )
  await codes.deleteMany({ userId, purpose: "password_reset" })
  await sessions.deleteMany({ userId })

  return NextResponse.json({ ok: true })
}
