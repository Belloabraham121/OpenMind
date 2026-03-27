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
  if (!session_id) {
    return NextResponse.json({ error: "session_id is required." }, { status: 400 })
  }

  const out = await forwardSubnetJson("/v1/memory/compact", {
    method: "POST",
    jsonBody: { session_id },
  })

  return NextResponse.json(out.data, { status: out.ok ? 200 : out.status })
}
