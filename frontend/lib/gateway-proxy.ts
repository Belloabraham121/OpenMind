/**
 * Server-only: forwards authenticated dashboard traffic to the validator-integrated
 * FastAPI gateway (openmind-subnet/gateway). Never expose wallet or subnet creds to the browser.
 */
export function getSubnetGatewayBaseUrl(): string | null {
  const raw = process.env.SUBNET_GATEWAY_URL?.trim().replace(/^['"]|['"]$/g, "") ?? ""
  if (!raw) return null
  return raw.replace(/\/$/, "")
}

export async function forwardSubnetJson(
  path: string,
  init: RequestInit & { jsonBody?: unknown } = {},
): Promise<{ ok: boolean; status: number; data: unknown; rawText?: string }> {
  const base = getSubnetGatewayBaseUrl()
  if (!base) {
    return { ok: false, status: 503, data: { error: "Subnet gateway URL is not configured." } }
  }

  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`
  const headers = new Headers(init.headers)
  if (!headers.has("Content-Type") && init.jsonBody !== undefined) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(url, {
    ...init,
    headers,
    body:
      init.jsonBody !== undefined
        ? JSON.stringify(init.jsonBody)
        : (init.body as BodyInit | null | undefined),
  })

  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    data = { error: "Invalid JSON from gateway", raw: text.slice(0, 500) }
  }

  return { ok: res.ok, status: res.status, data, rawText: text }
}
