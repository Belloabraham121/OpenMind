import { NextResponse } from "next/server"
import { recordActivity } from "@/lib/record-activity"
import { forwardSubnetJson } from "@/lib/gateway-proxy"
import { getSessionUser } from "@/lib/require-session"
import { subnetSessionIdForUser } from "@/lib/subnet-session"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const userId = String(session.user._id)
  const content = typeof body.content === "string" ? body.content : ""
  if (!content.trim()) {
    return NextResponse.json({ error: "content is required." }, { status: 400 })
  }

  const payload = {
    session_id: typeof body.session_id === "string" ? body.session_id : subnetSessionIdForUser(userId),
    content,
    role: typeof body.role === "string" ? body.role : "user",
    tier: typeof body.tier === "string" ? body.tier : "basic",
    event_at: typeof body.event_at === "string" ? body.event_at : undefined,
    multimodal_type: typeof body.multimodal_type === "string" ? body.multimodal_type : undefined,
    embedding: Array.isArray(body.embedding) ? body.embedding : undefined,
    filters: typeof body.filters === "object" && body.filters !== null ? body.filters : {},
    shared_space_id: typeof body.shared_space_id === "string" ? body.shared_space_id : undefined,
    author: typeof body.author === "string" ? body.author : undefined,
    auth_metadata:
      typeof body.auth_metadata === "object" && body.auth_metadata !== null ? body.auth_metadata : {},
  }

  const t0 = Date.now()
  const out = await forwardSubnetJson("/v1/memory/store", {
    method: "POST",
    jsonBody: payload,
  })
  const latencyMs = Date.now() - t0

  const preview = content.slice(0, 120)
  await recordActivity({
    userId: session.user._id,
    kind: "ingest",
    summary: preview + (content.length > 120 ? "…" : ""),
    metadata: { ok: out.ok, latencyMs, gatewayStatus: out.status },
  })

  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status })
}
