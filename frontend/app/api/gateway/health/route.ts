import { NextResponse } from "next/server"
import { forwardSubnetJson, getSubnetGatewayBaseUrl } from "@/lib/gateway-proxy"
import { getGatewayAuth, gatewayUnauthorized } from "@/lib/gateway-auth"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const auth = await getGatewayAuth(request)
  if (auth instanceof NextResponse) return auth
  if (!auth) {
    return gatewayUnauthorized(request)
  }

  const configured = Boolean(getSubnetGatewayBaseUrl())
  if (!configured) {
    return Response.json(
      {
        configured: false,
        error: "SUBNET_GATEWAY_URL is not set.",
      },
      { status: 503 },
    )
  }

  const out = await forwardSubnetJson("/v1/health", { method: "GET" })
  return Response.json(
    { configured: true, ...(out.data as object) },
    { status: out.ok ? 200 : out.status },
  )
}
