import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { authCollections } from "@/lib/auth-db"
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants"
import {
  createSessionToken,
  hashToken,
  sessionExpiresAt,
  setSessionCookie,
} from "@/lib/auth-session"

export const runtime = "nodejs"

export async function POST() {
  const cookieStore = await cookies()
  const currentToken = cookieStore.get(AUTH_COOKIE_NAME)?.value
  if (!currentToken) {
    return NextResponse.json({ error: "No active session." }, { status: 401 })
  }

  const { sessions } = await authCollections()
  const existing = await sessions.findOne({ tokenHash: hashToken(currentToken) })
  if (!existing || existing.expiresAt < new Date()) {
    return NextResponse.json({ error: "Session expired." }, { status: 401 })
  }

  const newToken = createSessionToken()
  await sessions.updateOne(
    { _id: existing._id },
    {
      $set: {
        tokenHash: hashToken(newToken),
        expiresAt: sessionExpiresAt(),
      },
    },
  )
  await setSessionCookie(newToken)
  return NextResponse.json({ ok: true })
}
