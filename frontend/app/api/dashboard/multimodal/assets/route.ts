import { NextResponse } from "next/server"
import { listAssets } from "@/lib/multimodal-db"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const rows = await listAssets(session.user._id)
  return NextResponse.json({
    assets: rows.map((a) => ({
      id: String(a._id),
      filename: a.filename,
      mimeType: a.mimeType,
      byteSize: a.byteSize,
      status: a.status,
      chunkCount: a.chunkCount ?? null,
      error: a.error ?? null,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    })),
  })
}
