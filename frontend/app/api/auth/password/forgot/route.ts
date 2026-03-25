import { NextResponse } from "next/server"
import {
  authCollections,
  createSixDigitCode,
  normalizeEmail,
  normalizePhone,
} from "@/lib/auth-db"

export const runtime = "nodejs"

type Body = {
  identifier?: string
}

export async function POST(request: Request) {
  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const identifier = body.identifier?.trim() ?? ""
  const email = normalizeEmail(identifier)
  const phone = normalizePhone(identifier)
  if (!email && !phone) {
    return NextResponse.json(
      { error: "Provide a valid email or phone." },
      { status: 400 },
    )
  }

  const { users, codes } = await authCollections()
  const user = await users.findOne(email ? { email } : { phone: phone! })

  // Do not leak account existence.
  if (!user) {
    return NextResponse.json({ ok: true })
  }

  const code = createSixDigitCode()
  const now = new Date()
  await codes.insertOne({
    userId: user._id!,
    purpose: "password_reset",
    code,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  })

  return NextResponse.json({
    ok: true,
    devCode: process.env.NODE_ENV === "production" ? undefined : code,
  })
}
