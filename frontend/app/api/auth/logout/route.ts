import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { authCollections } from "@/lib/auth-db"
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants"
import { clearSessionCookie, hashToken } from "@/lib/auth-session"
import { recordActivity } from "@/lib/record-activity"

export const runtime = "nodejs"

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
  if (token) {
    const { sessions } = await authCollections()
    const row = await sessions.findOne({ tokenHash: hashToken(token) })
    if (row) {
      await recordActivity({
        userId: row.userId,
        kind: "auth_logout",
        summary: "Signed out",
      })
    }
    await sessions.deleteOne({ tokenHash: hashToken(token) })
  }
  await clearSessionCookie()
  return NextResponse.json({ ok: true })
}
