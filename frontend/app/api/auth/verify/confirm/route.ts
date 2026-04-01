import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { authCollections } from "@/lib/auth-db"
import { authWaitlistBlockedResponse, isAuthOpen } from "@/lib/auth-access"

export const runtime = "nodejs"

type Body = {
  userId?: string
  channel?: "email" | "phone"
  code?: string
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
  if (!body.userId || !body.channel || !body.code) {
    return NextResponse.json(
      { error: "userId, channel, and code are required." },
      { status: 400 },
    )
  }
  if (!ObjectId.isValid(body.userId)) {
    return NextResponse.json({ error: "Invalid userId." }, { status: 400 })
  }

  const { users, codes } = await authCollections()
  const userId = new ObjectId(body.userId)
  const purpose = body.channel === "email" ? "verify_email" : "verify_phone"
  const now = new Date()
  const record = await codes.findOne({
    userId,
    purpose,
    code: body.code.trim(),
    expiresAt: { $gt: now },
  })
  if (!record) {
    return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 })
  }

  await users.updateOne(
    { _id: userId },
    {
      $set:
        body.channel === "email"
          ? { emailVerified: true, updatedAt: now }
          : { phoneVerified: true, updatedAt: now },
    },
  )
  await codes.deleteMany({ userId, purpose })

  return NextResponse.json({ ok: true })
}
