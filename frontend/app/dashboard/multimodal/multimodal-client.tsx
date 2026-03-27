"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { apiFetch, apiJson } from "@/lib/api-client"
import { Loader2, Upload } from "lucide-react"
import { toast } from "sonner"

type AssetRow = {
  id: string
  filename: string
  mimeType: string
  byteSize: number
  status: string
  chunkCount: number | null
  error: string | null
  createdAt: string
}

export function MultimodalClient() {
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { ok, data } = await apiJson<{ assets: AssetRow[] }>("/api/dashboard/multimodal/assets")
    if (ok && data.assets) setAssets(data.assets)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await apiFetch("/api/dashboard/multimodal/upload", {
        method: "POST",
        body: fd,
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; status?: string }
      if (!res.ok) {
        toast.error(data.error ?? "Upload failed.")
        return
      }
      toast.success(`Uploaded · ${data.status ?? "ok"}`)
      void load()
    } catch {
      toast.error("Network error.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <DashboardPageIntro
        title="Multimodal Library"
        description="Uploads register in Mongo then forward a text-safe payload to /v1/memory/store via the app proxy (set SUBNET_GATEWAY_URL for full ingest)."
      />
      <div className="mb-6">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-foreground/15 px-4 py-2 font-mono text-sm hover:bg-muted/40">
          <Upload className="size-4" />
          {uploading ? "Uploading…" : "Upload file"}
          <input type="file" className="sr-only" onChange={(ev) => void onFile(ev)} disabled={uploading} />
        </label>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading assets…
        </div>
      ) : assets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assets yet. Upload a PDF or image to begin.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((f) => (
            <Card key={f.id} className="border-foreground/10 shadow-none">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="font-mono text-sm break-all">{f.filename}</CardTitle>
                  <Badge variant="secondary" className="shrink-0 rounded-full font-mono text-[10px]">
                    {f.status}
                  </Badge>
                </div>
                <CardDescription className="font-mono text-xs">
                  {f.mimeType} · {f.byteSize} bytes
                  {f.chunkCount != null ? ` · ${f.chunkCount} chunks` : ""}
                  {f.error ? ` · ${f.error}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
