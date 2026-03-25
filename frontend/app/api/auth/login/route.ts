import { NextResponse } from "next/server"
import { AUTH_COOKIE_NAME } from "@/lib/auth-session"

type Body = {
  email?: string
  password?: string
}

export async function POST(request: Request) {
  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const email = body.email?.trim() ?? ""
  const password = body.password ?? ""

  if (!email.includes("@") || password.length < 8) {
    return NextResponse.json(
      {
        error:
          "Use a valid email and a password with at least 8 characters (demo gate).",
      },
      { status: 400 },
    )
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(AUTH_COOKIE_NAME, "1", {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
  return res
}
