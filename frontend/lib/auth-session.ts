import { cookies } from "next/headers"
import crypto from "node:crypto"
import { AUTH_COOKIE_NAME } from "@/lib/auth-constants"

const SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS ?? "7")

export function createSessionToken(): string {
  return crypto.randomBytes(48).toString("hex")
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

export function sessionExpiresAt(): Date {
  const now = Date.now()
  return new Date(now + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}
