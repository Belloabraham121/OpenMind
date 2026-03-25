"use client"

import { useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search, Loader2 } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import type { MemoryQueryResultItem } from "@/lib/types/dashboard"

function normalizeResults(data: unknown): MemoryQueryResultItem[] {
  if (!data || typeof data !== "object") return []
  const r = (data as { results?: unknown }).results
  if (!Array.isArray(r)) return []
  return r.map((item, i) => {
    if (!item || typeof item !== "object") {
      return { title: `Result ${i + 1}`, body: String(item) }
    }
    const o = item as Record<string, unknown>
    let text =
      typeof o.content === "string"
        ? o.content
        : typeof o.text === "string"
          ? o.text
          : typeof o.snippet === "string"
            ? o.snippet
            : JSON.stringify(o)
    const score = typeof o.score === "number" ? o.score : undefined
    const id = typeof o.id === "string" ? o.id : typeof o.chunk_id === "string" ? o.chunk_id : `chunk-${i}`
    const title =
      score != null ? `${id} · score ${score.toFixed(2)}` : `${id} · memory hit`
    return { title, body: text.slice(0, 1200), score, raw: o as Record<string, unknown> }
  })
}

export function MemoryExplorerClient() {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<MemoryQueryResultItem[]>([])

  async function runSearch() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch("/api/gateway/memory/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, top_k: 8 }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = (data as { error?: string }).error
        setError(
          err ??
            (res.status === 503
              ? "Subnet gateway is not configured (SUBNET_GATEWAY_URL)."
              : "Search failed."),
        )
        setResults([])
        return
      }
      const list = normalizeResults(data)
      setResults(list)
      if (list.length === 0) {
        setError("No hits returned. Store memory first or check your validator gateway.")
      }
    } catch {
      setError("Network error.")
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <DashboardPageIntro
        title="Memory Explorer"
        description="Search runs through the app proxy to POST /v1/memory/query on your subnet gateway (authenticated, never exposed to browsers)."
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ask across your agent memory…"
            className="h-11 rounded-full border-foreground/15 pl-10"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch()
            }}
          />
        </div>
        <Button
          className="h-11 rounded-full bg-foreground text-background hover:bg-foreground/90"
          onClick={() => void runSearch()}
          disabled={loading || !query.trim()}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Searching…
            </>
          ) : (
            "Search"
          )}
        </Button>
      </div>
      {error && (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {results.map((c, i) => (
          <Card key={`${c.title}-${i}`} className="border-foreground/10 shadow-none">
            <CardHeader>
              <CardTitle className="font-mono text-sm font-normal text-foreground">{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
              {c.body}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
