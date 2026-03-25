import { forwardSubnetJson, getSubnetGatewayBaseUrl } from "@/lib/gateway-proxy"
import { getSessionUser } from "@/lib/require-session"

export const runtime = "nodejs"

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
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
