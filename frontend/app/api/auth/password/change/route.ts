import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import bcrypt from "bcryptjs"
import { authCollections } from "@/lib/auth-db"
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants"
import { hashToken } from "@/lib/auth-session"

export const runtime = "nodejs"

type Body = {
  currentPassword?: string
  newPassword?: string
}

export async function POST(request: Request) {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  }

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.currentPassword || !body.newPassword) {
    return NextResponse.json(
      { error: "currentPassword and newPassword are required." },
      { status: 400 },
    )
  }
  if (body.newPassword.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters." },
      { status: 400 },
    )
  }

  const { sessions, users } = await authCollections()
  const session = await sessions.findOne({ tokenHash: hashToken(token) })
  if (!session || session.expiresAt < new Date()) {
    return NextResponse.json({ error: "Session expired." }, { status: 401 })
  }

  const user = await users.findOne({ _id: session.userId })
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 })
  }

  const ok = await bcrypt.compare(body.currentPassword, user.passwordHash)
  if (!ok) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 },
    )
  }

  const passwordHash = await bcrypt.hash(body.newPassword, 12)
  await users.updateOne(
    { _id: user._id },
    { $set: { passwordHash, updatedAt: new Date() } },
  )

  return NextResponse.json({ ok: true })
}
