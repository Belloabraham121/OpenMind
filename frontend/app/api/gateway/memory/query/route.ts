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
  const payload = {
    session_id: typeof body.session_id === "string" ? body.session_id : subnetSessionIdForUser(userId),
    query: typeof body.query === "string" ? body.query : "",
    top_k: typeof body.top_k === "number" ? body.top_k : 10,
    smart: body.smart !== false,
    filters: typeof body.filters === "object" && body.filters !== null ? body.filters : {},
    tier: typeof body.tier === "string" ? body.tier : "basic",
    embedding: Array.isArray(body.embedding) ? body.embedding : undefined,
    multimodal_type: typeof body.multimodal_type === "string" ? body.multimodal_type : undefined,
  }

  const t0 = Date.now()
  const out = await forwardSubnetJson("/v1/memory/query", {
    method: "POST",
    jsonBody: payload,
  })
  const latencyMs = Date.now() - t0

  await recordActivity({
    userId: session.user._id,
    kind: "query",
    summary:
      typeof payload.query === "string" && payload.query.length > 0
        ? payload.query.slice(0, 160)
        : "Hybrid retrieval",
    metadata: { ok: out.ok, latencyMs, gatewayStatus: out.status },
  })

  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status })
}
