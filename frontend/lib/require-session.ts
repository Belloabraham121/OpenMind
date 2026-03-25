import { cookies } from "next/headers"
import type { ObjectId } from "mongodb"
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants"
import { authCollections, type UserDoc } from "@/lib/auth-db"
import { hashToken } from "@/lib/auth-session"

export type SessionUser = {
  user: UserDoc & { _id: ObjectId }
  session: { userId: ObjectId; expiresAt: Date }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
  if (!token) return null

  const { sessions, users } = await authCollections()
  const session = await sessions.findOne({ tokenHash: hashToken(token) })
  if (!session || session.expiresAt < new Date()) return null

  const user = await users.findOne({ _id: session.userId })
  if (!user?._id) return null

  return {
    user: user as UserDoc & { _id: ObjectId },
    session: { userId: session.userId, expiresAt: session.expiresAt },
  }
}
