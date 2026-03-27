import { NextResponse } from "next/server"
import { insertAssetPlaceholder, patchAssetStatus } from "@/lib/multimodal-db"
import { recordActivity } from "@/lib/record-activity"
import { forwardSubnetJson } from "@/lib/gateway-proxy"
import { getSessionUser } from "@/lib/require-session"
import { subnetSessionIdForUser } from "@/lib/subnet-session"
import { MAX_ACTIVITY_STORED_CONTENT } from "@/lib/memory-ingest-limits"

export const runtime = "nodejs"

const MAX_BYTES = 20 * 1024 * 1024

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field." }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())
  if (buf.length === 0) {
    return NextResponse.json({ error: "Empty file." }, { status: 400 })
  }
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: `File too large (max ${MAX_BYTES} bytes).` }, { status: 400 })
  }

  const mimeType = file.type || "application/octet-stream"
  const assetId = await insertAssetPlaceholder({
    userId: session.user._id,
    filename: file.name || "upload",
    mimeType,
    byteSize: buf.length,
  })

  const textLike = mimeType.startsWith("text/") || mimeType === "application/json"
  const contentRaw = textLike ? buf.toString("utf8") : `[binary ${mimeType} ${buf.length} bytes]`
  const content = contentRaw.slice(0, 50_000)

  const out = await forwardSubnetJson("/v1/memory/store", {
    method: "POST",
    jsonBody: {
      session_id: subnetSessionIdForUser(String(session.user._id)),
      content: `multimodal:${file.name}\n${content}`,
      tier: "basic",
      multimodal_type: mimeType.includes("pdf") ? "pdf" : mimeType.startsWith("image/") ? "image" : "text",
    },
  })

  if (out.ok) {
    await patchAssetStatus(assetId, session.user._id, {
      status: "indexed",
      chunkCount: Array.isArray((out.data as { results?: unknown }).results)
        ? (out.data as { results: unknown[] }).results.length
        : 1,
    })
  } else {
    await patchAssetStatus(assetId, session.user._id, {
      status: "failed",
      error: typeof (out.data as { error?: string })?.error === "string"
        ? (out.data as { error: string }).error
        : `Gateway HTTP ${out.status}`,
    })
  }

  const ingestPayload = `multimodal:${file.name}\n${content}`
  const truncated = ingestPayload.length > MAX_ACTIVITY_STORED_CONTENT
  await recordActivity({
    userId: session.user._id,
    kind: "ingest",
    summary: `multimodal upload · ${file.name}`,
    metadata: {
      assetId: String(assetId),
      ok: out.ok,
      sessionId: subnetSessionIdForUser(String(session.user._id)),
      storedContent: ingestPayload.slice(0, MAX_ACTIVITY_STORED_CONTENT),
      contentLength: ingestPayload.length,
      contentTruncated: truncated,
      filename: file.name || "upload",
    },
  })

  const row = out.ok ? "indexed" : "failed"
  return NextResponse.json(
    {
      id: String(assetId),
      status: row,
      gatewayOk: out.ok,
    },
    { status: 201 },
  )
}
