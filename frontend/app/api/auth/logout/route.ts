import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME } from "@/lib/auth-session"

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    maxAge: 0,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
  return res
}
