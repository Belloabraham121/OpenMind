import { NextResponse } from "next/server"
import { ObjectId } from "mongodb"
import { revokeApiKey } from "@/lib/auth-api-keys"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

type Params = { id: string }

export async function DELETE(_request: Request, context: { params: Promise<Params> }) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  let oid: ObjectId
  try {
    oid = new ObjectId(id)
  } catch {
    return NextResponse.json({ error: "Invalid key id." }, { status: 400 })
  }

  const ok = await revokeApiKey(session.user._id, oid)
  if (!ok) {
    return NextResponse.json({ error: "Key not found or already revoked." }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
