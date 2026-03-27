import { NextResponse } from "next/server"
import { forwardSubnetJson } from "@/lib/gateway-proxy"
import { getGatewayAuth, gatewayUnauthorized } from "@/lib/gateway-auth"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const auth = await getGatewayAuth(request)
  if (auth instanceof NextResponse) return auth
  if (!auth) {
    return gatewayUnauthorized(request)
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const session_id = typeof body.session_id === "string" ? body.session_id : ""
  const shared_space_id = typeof body.shared_space_id === "string" ? body.shared_space_id : ""
  if (!session_id || !shared_space_id) {
    return NextResponse.json(
      { error: "session_id and shared_space_id are required." },
      { status: 400 },
    )
  }

  const out = await forwardSubnetJson("/v1/space/query", {
    method: "POST",
    jsonBody: {
      session_id,
      shared_space_id,
      query: typeof body.query === "string" ? body.query : undefined,
      embedding: Array.isArray(body.embedding) ? body.embedding : undefined,
      top_k: typeof body.top_k === "number" ? body.top_k : 10,
      author: typeof body.author === "string" ? body.author : undefined,
      auth_metadata:
        typeof body.auth_metadata === "object" && body.auth_metadata !== null ? body.auth_metadata : {},
    },
  })

  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status })
}
