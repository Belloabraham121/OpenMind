import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { authCollections, createSixDigitCode } from "@/lib/auth-db"
import { authWaitlistBlockedResponse, isAuthOpen } from "@/lib/auth-access"

export const runtime = "nodejs"

type Body = {
  userId?: string
  channel?: "email" | "phone"
}

export async function POST(request: Request) {
  if (!isAuthOpen()) {
    return authWaitlistBlockedResponse()
  }

  let body: Body = {}
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  if (!body.userId || !body.channel) {
    return NextResponse.json(
      { error: "userId and channel are required." },
      { status: 400 },
    )
  }
  if (!ObjectId.isValid(body.userId)) {
    return NextResponse.json({ error: "Invalid userId." }, { status: 400 })
  }

  const { users, codes } = await authCollections()
  const user = await users.findOne({ _id: new ObjectId(body.userId) })
  if (!user) {
    return NextResponse.json({ error: "User not found." }, { status: 404 })
  }

  const purpose = body.channel === "email" ? "verify_email" : "verify_phone"
  const code = createSixDigitCode()
  const now = new Date()

  await codes.insertOne({
    userId: user._id!,
    purpose,
    code,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
  })

  return NextResponse.json({
    ok: true,
    // Until provider integration, return code for local testing.
    devCode: process.env.NODE_ENV === "production" ? undefined : code,
  })
}
