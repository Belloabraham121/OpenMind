import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import {
  authCollections,
  ensureAuthIndexes,
  normalizeEmail,
  normalizePhone,
} from "@/lib/auth-db"
import {
  createSessionToken,
  hashToken,
  sessionExpiresAt,
  setSessionCookie,
} from "@/lib/auth-session"
import { recordActivity } from "@/lib/record-activity"
import { authWaitlistBlockedResponse, isAuthOpen } from "@/lib/auth-access"

export const runtime = "nodejs"

type Body = {
  identifier?: string
  password?: string
}

export async function POST(request: Request) {
  if (!isAuthOpen()) {
    return authWaitlistBlockedResponse()
  }

  await ensureAuthIndexes()

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const identifier = body.identifier?.trim() ?? ""
  const password = body.password ?? ""
  const email = normalizeEmail(identifier)
  const phone = normalizePhone(identifier)

  if ((!email && !phone) || password.length < 8) {
    return NextResponse.json(
      { error: "Use a valid email or phone and password." },
      { status: 400 },
    )
  }

  const { users, sessions } = await authCollections()
  const user = await users.findOne(email ? { email } : { phone: phone! })
  if (!user) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 })
  }

  const isValid = await bcrypt.compare(password, user.passwordHash)
  if (!isValid) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 })
  }

  const token = createSessionToken()
  await sessions.insertOne({
    userId: user._id!,
    tokenHash: hashToken(token),
    createdAt: new Date(),
    expiresAt: sessionExpiresAt(),
  })
  await setSessionCookie(token)

  await recordActivity({
    userId: user._id!,
    kind: "auth_login",
    summary: "Signed in",
  })

  return NextResponse.json({
    ok: true,
    user: {
      id: String(user._id),
      email: user.email ?? null,
      phone: user.phone ?? null,
      emailVerified: user.emailVerified,
      phoneVerified: user.phoneVerified,
    },
  })
}
