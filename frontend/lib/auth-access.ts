import { NextResponse } from "next/server"
import { AUTH_WAITLIST_MESSAGE } from "@/lib/auth-access-message"

export { AUTH_WAITLIST_MESSAGE }

/** Set `AUTH_OPEN=true` in the environment to allow login, register, and related auth routes (e.g. local development). */
export function isAuthOpen(): boolean {
  return process.env.AUTH_OPEN === "true"
}

export function authWaitlistBlockedResponse() {
  return NextResponse.json({ error: AUTH_WAITLIST_MESSAGE }, { status: 403 })
}
