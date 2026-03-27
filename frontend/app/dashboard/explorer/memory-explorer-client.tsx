"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Search, Loader2, ChevronDown, RefreshCw, Database } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MemoryMarkdown } from "@/components/dashboard/memory-markdown"
import { MemoryIngestKnowledgeGraph } from "@/components/dashboard/memory-ingest-knowledge-graph"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"
import type {
  MemoryIndexListEntry,
  MemoryIngestDetail,
  MemoryQueryResultItem,
} from "@/lib/types/dashboard"

const SEMANTIC_SESSION_KEY = "openmind.memoryExplorer.semanticSessionId"

function ingestDetailSectionLabel(d: MemoryIngestDetail): string {
  if (d.summary.includes("User prompt (auto-captured)")) return "Your prompt"
  if (d.summary.includes("Code edit (auto-captured)")) return "Code edit"
  if (d.summary.includes("Assistant reply (auto-captured)")) return "Assistant reply"
  if (d.role === "user") return "User"
  if (d.role === "assistant") return "Assistant"
  return "Stored content"
}

/** Default subnet namespace is identical for most ingests — hide the noisy repeat on list cards. */
function MemoryNamespaceHint({
  sessionId,
  defaultSessionId,
}: {
  sessionId: string | null | undefined
  defaultSessionId: string | null
}) {
  if (!sessionId) {
    return (
      <p className="text-[10px] italic text-muted-foreground">Memory namespace not recorded</p>
    )
  }
  if (defaultSessionId && sessionId === defaultSessionId) {
    return null
  }
  return (
    <p
      className="break-all font-mono text-[10px] leading-snug text-muted-foreground"
      title={sessionId}
    >
      namespace: {sessionId}
    </p>
  )
}

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
    const bodyFull = text
    const previewLen = 400
    const body =
      bodyFull.length > previewLen ? `${bodyFull.slice(0, previewLen)}…` : bodyFull    
    return {
      title,
      body,
      bodyFull,
      score,
      raw: o as Record<string, unknown>,
    }
  })
}

export function MemoryExplorerClient() {
  const [defaultSessionId, setDefaultSessionId] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)

  const [filterText, setFilterText] = useState("")
  const [appliedFilter, setAppliedFilter] = useState("")
  const [sessionExact, setSessionExact] = useState("")
  const [appliedSession, setAppliedSession] = useState("")

  const [indexItems, setIndexItems] = useState<MemoryIndexListEntry[]>([])
  const [indexCursor, setIndexCursor] = useState<string | null>(null)
  const [indexLoading, setIndexLoading] = useState(false)
  const [indexError, setIndexError] = useState<string | null>(null)

  const [semanticOpen, setSemanticOpen] = useState(false)
  const [semanticSession, setSemanticSession] = useState("")
  const [semanticQuery, setSemanticQuery] = useState("")
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [semanticError, setSemanticError] = useState<string | null>(null)
  const [semanticResults, setSemanticResults] = useState<MemoryQueryResultItem[]>([])
  const [semanticDetail, setSemanticDetail] = useState<MemoryQueryResultItem | null>(null)

  const [ingestOpen, setIngestOpen] = useState<
    | null
    | { kind: "single"; id: string }
    | { kind: "turn"; userId: string; assistantId: string }
    | { kind: "thread"; ids: string[] }
  >(null)
  const [ingestDetailSingle, setIngestDetailSingle] =
    useState<MemoryIngestDetail | null>(null)
  const [ingestDetailTurn, setIngestDetailTurn] = useState<{
    user: MemoryIngestDetail
    assistant: MemoryIngestDetail
  } | null>(null)
  const [ingestDetailThread, setIngestDetailThread] = useState<
    MemoryIngestDetail[] | null
  >(null)
  const [ingestDetailLoading, setIngestDetailLoading] = useState(false)
  const [ingestFocusId, setIngestFocusId] = useState<string | null>(null)

  const selectIngestGraphNode = useCallback((id: string) => {
    setIngestFocusId(id)
    requestAnimationFrame(() => {
      document
        .getElementById(`ingest-detail-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" })
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await apiFetch("/api/me")
        const data = (await res.json().catch(() => ({}))) as {
          defaultMemorySessionId?: string
        }
        if (cancelled || !res.ok) return
        const fromApi = data.defaultMemorySessionId ?? ""
        setDefaultSessionId(fromApi || null)
        if (typeof window !== "undefined") {
          const saved = window.localStorage.getItem(SEMANTIC_SESSION_KEY)?.trim()
          setSemanticSession(saved || fromApi)
        } else {
          setSemanticSession(fromApi)
        }
      } finally {
        if (!cancelled) setSessionReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function persistSemanticSession(next: string) {
    setSemanticSession(next)
    if (typeof window === "undefined") return
    const t = next.trim()
    if (!t) {
      window.localStorage.removeItem(SEMANTIC_SESSION_KEY)
      return
    }
    if (defaultSessionId && t === defaultSessionId) {
      window.localStorage.removeItem(SEMANTIC_SESSION_KEY)
      return
    }
    window.localStorage.setItem(SEMANTIC_SESSION_KEY, t)
  }

  const fetchIndexPage = useCallback(
    async (cursor: string | null, append: boolean) => {
      setIndexLoading(true)
      setIndexError(null)
      try {
        const params = new URLSearchParams()
        params.set("limit", "40")
        if (cursor) params.set("cursor", cursor)
        if (appliedFilter.trim()) params.set("q", appliedFilter.trim())
        if (appliedSession.trim()) params.set("session", appliedSession.trim())

        const res = await apiFetch(`/api/dashboard/memory-index?${params.toString()}`)
        const data = (await res.json().catch(() => ({}))) as {
          items?: MemoryIndexListEntry[]
          nextCursor?: string | null
          error?: string
        }

        if (!res.ok) {
          setIndexError(data.error ?? "Could not load memories.")
          if (!append) setIndexItems([])
          return
        }

        const items = data.items ?? []
        setIndexCursor(data.nextCursor ?? null)
        setIndexItems((prev) => (append ? [...prev, ...items] : items))
      } catch {
        setIndexError("Network error.")
        if (!append) setIndexItems([])
      } finally {
        setIndexLoading(false)
      }
    },
    [appliedFilter, appliedSession],
  )

  useEffect(() => {
    if (!sessionReady) return
    void fetchIndexPage(null, false)
  }, [sessionReady, appliedFilter, appliedSession, fetchIndexPage])

  useEffect(() => {
    if (!ingestOpen) {
      setIngestFocusId(null)
      return
    }
    if (ingestOpen.kind === "single" && ingestDetailSingle) {
      setIngestFocusId(ingestDetailSingle.id)
    } else if (ingestOpen.kind === "turn" && ingestDetailTurn) {
      setIngestFocusId(ingestDetailTurn.user.id)
    } else if (ingestOpen.kind === "thread" && ingestDetailThread?.length) {
      setIngestFocusId(ingestDetailThread[0].id)
    }
  }, [ingestOpen, ingestDetailSingle, ingestDetailTurn, ingestDetailThread])

  function applyFilters() {
    setAppliedFilter(filterText.trim())
    setAppliedSession(sessionExact.trim())
  }

  async function loadMore() {
    if (!indexCursor || indexLoading) return
    await fetchIndexPage(indexCursor, true)
  }

  async function runSemanticSearch() {
    const q = semanticQuery.trim()
    if (!q) {
      setSemanticError("Enter a question or keywords for subnet search.")
      return
    }
    setSemanticLoading(true)
    setSemanticError(null)
    try {
      const sid = semanticSession.trim() || defaultSessionId || ""
      const res = await apiFetch("/api/gateway/memory/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: q,
          top_k: 12,
          ...(sid ? { session_id: sid } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const err = (data as { error?: string }).error
        setSemanticError(
          err ??
            (res.status === 503
              ? "Subnet gateway is not configured (SUBNET_GATEWAY_URL)."
              : "Search failed."),
        )
        setSemanticResults([])
        return
      }
      const list = normalizeResults(data)
      setSemanticResults(list)
      if (list.length === 0) {
        setSemanticError(
          "No semantic hits in this session. Try another session, or browse ingests above.",
        )
      }
    } catch {
      setSemanticError("Network error.")
      setSemanticResults([])
    } finally {
      setSemanticLoading(false)
    }
  }

  async function openIngest(entry: MemoryIndexListEntry) {
    setIngestDetailSingle(null)
    setIngestDetailTurn(null)
    setIngestDetailThread(null)
    setIngestDetailLoading(true)

    if (entry.kind === "thread") {
      setIngestOpen({ kind: "thread", ids: entry.members.map((m) => m.id) })
      try {
        const responses = await Promise.all(
          entry.members.map((m) => apiFetch(`/api/dashboard/memory-index/${m.id}`)),
        )
        const details: MemoryIngestDetail[] = []
        for (const res of responses) {
          const data = (await res.json().catch(() => ({}))) as MemoryIngestDetail
          if (res.ok) details.push(data)
        }
        setIngestDetailThread(details.length > 0 ? details : null)
      } finally {
        setIngestDetailLoading(false)
      }
      return
    }

    if (entry.kind === "single") {
      setIngestOpen({ kind: "single", id: entry.item.id })
      try {
        const res = await apiFetch(`/api/dashboard/memory-index/${entry.item.id}`)
        const data = (await res.json().catch(() => ({}))) as MemoryIngestDetail & {
          error?: string
        }
        if (res.ok) setIngestDetailSingle(data)
      } finally {
        setIngestDetailLoading(false)
      }
      return
    }

    setIngestOpen({
      kind: "turn",
      userId: entry.user.id,
      assistantId: entry.assistant.id,
    })
    try {
      const [ru, ra] = await Promise.all([
        apiFetch(`/api/dashboard/memory-index/${entry.user.id}`),
        apiFetch(`/api/dashboard/memory-index/${entry.assistant.id}`),
      ])
      const du = (await ru.json().catch(() => ({}))) as MemoryIngestDetail & { error?: string }
      const da = (await ra.json().catch(() => ({}))) as MemoryIngestDetail & { error?: string }
      if (ru.ok && ra.ok) {
        setIngestDetailTurn({ user: du, assistant: da })
      } else {
        setIngestDetailTurn(null)
      }
    } finally {
      setIngestDetailLoading(false)
    }
  }

  return (
    <>
      <DashboardPageIntro
        title="Memory Explorer"
        description="Browse everything you stored through this app (MCP, API, uploads). Filter by any text or by session id. Use subnet search when you want miner-side semantic retrieval in a chosen session."
      />

      <section className="mb-8 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Database className="size-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold tracking-tight">All stored memories</h2>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Ingests from your activity log. Composer steps group prompt, file edits, and reply.
          Open a card for a knowledge-flow graph and jump between linked parts. Your default memory
          namespace is the same for most rows, so list cards hide that id.
        </p>
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Filter: any text, keywords, or part of a session id…"
              className="h-10 pl-9"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilters()
              }}
              disabled={!sessionReady}
            />
          </div>
          <Input
            placeholder="Exact session id (optional)"
            className="h-10 font-mono text-sm lg:w-72"
            value={sessionExact}
            onChange={(e) => setSessionExact(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyFilters()
            }}
            disabled={!sessionReady}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-10 rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={() => applyFilters()}
              disabled={!sessionReady || indexLoading}
            >
              {indexLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Loading…
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 size-4" />
                  Apply filters
                </>
              )}
            </Button>
            {defaultSessionId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-10 rounded-full"
                onClick={() => {
                  setSessionExact(defaultSessionId)
                  setAppliedSession(defaultSessionId)
                }}
                disabled={!sessionReady}
              >
                Default session only
              </Button>
            ) : null}
          </div>
        </div>

        {indexError && (
          <p className="text-sm text-destructive" role="alert">
            {indexError}
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {indexItems.map((entry) => {
            if (entry.kind === "turn") {
              const { user, assistant } = entry
              const tUser = new Date(user.createdAt).getTime()
              const tAsst = new Date(assistant.createdAt).getTime()
              const timeLabel =
                tUser === tAsst
                  ? new Date(assistant.createdAt).toLocaleString()
                  : `${new Date(user.createdAt).toLocaleString()} → ${new Date(assistant.createdAt).toLocaleString()}`
              const fullText =
                user.hasStoredContent && assistant.hasStoredContent ? (
                  <span className="ml-2 text-emerald-600 dark:text-emerald-400">· full text</span>
                ) : (
                  <span className="ml-2 text-amber-600/90 dark:text-amber-400/90">· preview</span>
                )
              const gwBad =
                user.gatewayOk === false || assistant.gatewayOk === false ? (
                  <span className="ml-2 text-destructive">· gateway issue</span>
                ) : null
              return (
                <Card
                  key={`turn-${user.id}-${assistant.id}`}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer border-foreground/10 shadow-none transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void openIngest(entry)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      void openIngest(entry)
                    }
                  }}
                >
                  <CardHeader className="space-y-1 pb-2">
                    <CardTitle className="text-[11px] font-normal text-muted-foreground">
                      {timeLabel}
                      {gwBad}
                      {fullText}
                    </CardTitle>
                    <MemoryNamespaceHint
                      sessionId={assistant.sessionId}
                      defaultSessionId={defaultSessionId}
                    />
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Turn · prompt + reply · open for flow graph
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap pt-0">
                    <div>
                      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">
                        You
                      </p>
                      {user.summary}
                    </div>
                    <div>
                      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">
                        Assistant
                      </p>
                      {assistant.summary}
                    </div>
                    <span className="block text-[11px] text-muted-foreground/80">
                      Click for graph + full text →
                    </span>
                  </CardContent>
                </Card>
              )
            }

            if (entry.kind === "thread") {
              const { members, generationId, conversationId } = entry
              const first = members[0]
              const last = members[members.length - 1]
              const tA = new Date(first.createdAt).getTime()
              const tB = new Date(last.createdAt).getTime()
              const timeLabel =
                tA === tB
                  ? new Date(last.createdAt).toLocaleString()
                  : `${new Date(first.createdAt).toLocaleString()} → ${new Date(last.createdAt).toLocaleString()}`
              const userLine = members.find((m) => m.summary.includes("User prompt (auto-captured)"))
              const codeN = members.filter((m) =>
                m.summary.includes("Code edit (auto-captured)"),
              ).length
              const asstLine = members.find((m) =>
                m.summary.includes("Assistant reply (auto-captured)"),
              )
              const anyGwBad = members.some((m) => m.gatewayOk === false)
              const allFull = members.every((m) => m.hasStoredContent)

              return (
                <Card
                  key={`thread-${generationId}`}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer border-foreground/10 shadow-none transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => void openIngest(entry)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      void openIngest(entry)
                    }
                  }}
                >
                  <CardHeader className="space-y-1 pb-2">
                    <CardTitle className="text-[11px] font-normal text-muted-foreground">
                      {timeLabel}
                      {anyGwBad ? (
                        <span className="ml-2 text-destructive">· gateway issue</span>
                      ) : null}
                      {allFull ? (
                        <span className="ml-2 text-emerald-600 dark:text-emerald-400">· full text</span>
                      ) : (
                        <span className="ml-2 text-amber-600/90 dark:text-amber-400/90">· preview</span>
                      )}
                    </CardTitle>
                    <MemoryNamespaceHint
                      sessionId={last.sessionId ?? first.sessionId}
                      defaultSessionId={defaultSessionId}
                    />
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Composer step · {members.length} parts
                      {codeN ? ` · ${codeN} edit${codeN === 1 ? "" : "s"}` : ""} · graph inside
                    </p>
                    <p
                      className="font-mono text-[10px] text-muted-foreground/90"
                      title={`generation ${generationId}${conversationId ? ` · conversation ${conversationId}` : ""}`}
                    >
                      step · {generationId.slice(0, 10)}…
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap pt-0">
                    {userLine ? (
                      <div>
                        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">
                          You
                        </p>
                        {userLine.summary}
                      </div>
                    ) : null}
                    {codeN > 0 ? (
                      <p className="text-xs italic text-muted-foreground">
                        {codeN} code edit ingest{codeN === 1 ? "" : "s"} (see details)
                      </p>
                    ) : null}
                    {asstLine ? (
                      <div>
                        <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">
                          Assistant
                        </p>
                        {asstLine.summary}
                      </div>
                    ) : null}
                    <span className="block text-[11px] text-muted-foreground/80">
                      Click for linked flow + bodies →
                    </span>
                  </CardContent>
                </Card>
              )
            }

            const row = entry.item
            return (
              <Card
                key={row.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer border-foreground/10 shadow-none transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => void openIngest(entry)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    void openIngest(entry)
                  }
                }}
              >
                <CardHeader className="space-y-1 pb-2">
                  <CardTitle className="text-[11px] font-normal text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString()}
                    {row.gatewayOk === false ? (
                      <span className="ml-2 text-destructive">· gateway issue</span>
                    ) : null}
                    {row.hasStoredContent ? (
                      <span className="ml-2 text-emerald-600 dark:text-emerald-400">· full text</span>
                    ) : (
                      <span className="ml-2 text-amber-600/90 dark:text-amber-400/90">· preview</span>
                    )}
                  </CardTitle>
                  <MemoryNamespaceHint sessionId={row.sessionId} defaultSessionId={defaultSessionId} />
                  {row.role ? (
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      role: {row.role}
                    </p>
                  ) : null}
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap pt-0">
                  {row.summary}
                  <span className="mt-2 block text-[11px] text-muted-foreground/80">
                    Click for graph + detail →
                  </span>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {!indexLoading && indexItems.length === 0 && !indexError && (
          <p className="text-sm text-muted-foreground">
            No ingests match these filters yet. Store via MCP or the API, then refresh.
          </p>
        )}

        {indexCursor ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            onClick={() => void loadMore()}
            disabled={indexLoading}
          >
            {indexLoading ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Loading…
              </>
            ) : (
              "Load more"
            )}
          </Button>
        ) : null}
      </section>

      <Collapsible open={semanticOpen} onOpenChange={setSemanticOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            className="mb-4 h-auto w-full justify-between rounded-lg border border-foreground/10 px-4 py-3 text-left font-normal hover:bg-muted/40"
          >
            <span className="text-sm font-medium">Semantic search (subnet miners)</span>
            <ChevronDown
              className={`size-4 shrink-0 transition-transform ${semanticOpen ? "rotate-180" : ""}`}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pb-8">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Runs POST /v1/memory/query on your validator. Scoped to one{" "}
            <span className="font-mono">session_id</span> — set below or use your dashboard default.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative min-w-0 flex-1">
              <Input
                placeholder="Question or search phrase…"
                className="h-10"
                value={semanticQuery}
                onChange={(e) => setSemanticQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSemanticSearch()
                }}
                disabled={!sessionReady}
              />
            </div>
            <Input
              placeholder="session_id for this search"
              className="h-10 font-mono text-sm sm:w-80"
              value={semanticSession}
              onChange={(e) => persistSemanticSession(e.target.value)}
              disabled={!sessionReady}
            />
            <Button
              type="button"
              className="h-10 rounded-full bg-foreground text-background hover:bg-foreground/90"
              onClick={() => void runSemanticSearch()}
              disabled={semanticLoading || !sessionReady}
            >
              {semanticLoading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Searching…
                </>
              ) : (
                "Search miners"
              )}
            </Button>
          </div>
          {defaultSessionId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => defaultSessionId && persistSemanticSession(defaultSessionId)}
              disabled={!sessionReady}
            >
              Use dashboard default session
            </Button>
          ) : null}
          {semanticError && (
            <p className="text-sm text-destructive" role="alert">
              {semanticError}
            </p>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            {semanticResults.map((c, i) => (
              <Card
                key={`${c.title}-${i}`}
                role="button"
                tabIndex={0}
                className="cursor-pointer border-foreground/10 shadow-none transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setSemanticDetail(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    setSemanticDetail(c)
                  }
                }}
              >
                <CardHeader>
                  <CardTitle className="font-mono text-sm font-normal text-foreground">
                    {c.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {c.body}
                  <span className="mt-2 block text-[11px] text-muted-foreground/80">
                    Click for full chunk →
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Sheet
        open={ingestOpen !== null}
        onOpenChange={(open) => {
          if (!open) {
            setIngestOpen(null)
            setIngestDetailSingle(null)
            setIngestDetailTurn(null)
            setIngestDetailThread(null)
          }
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <SheetHeader className="border-b border-border/60 px-4 py-4 text-left">
            <SheetTitle className="font-display text-lg">
              {ingestOpen?.kind === "turn"
                ? "Conversation turn"
                : ingestOpen?.kind === "thread"
                  ? "Linked composer step"
                  : "Memory ingest"}
            </SheetTitle>
            <SheetDescription className="text-xs">
              {ingestOpen?.kind === "turn"
                ? "Follow the flow below, or click a node to jump to its full text."
                : ingestOpen?.kind === "thread"
                  ? "Graph shows how prompt, file edits, and reply connect for this step."
                  : "Flow graph (single node) and full stored content."}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 px-4 py-3">
            {ingestDetailLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading…
              </div>
            ) : ingestOpen?.kind === "thread" && ingestDetailThread?.length ? (
              <ScrollArea className="h-[calc(100vh-8rem)] pr-3">
                <div className="flex flex-col gap-6 pb-8 pr-1">
                  <MemoryIngestKnowledgeGraph
                    details={ingestDetailThread}
                    selectedId={ingestFocusId}
                    onSelect={selectIngestGraphNode}
                  />
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-foreground/15 text-[10px] uppercase tracking-wide"
                      >
                        Session &amp; Cursor ids
                        <ChevronDown className="ml-1 size-3" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2 rounded-lg border border-foreground/10 bg-muted/25 px-3 py-2 text-[11px] leading-relaxed">
                      <p className="break-all font-mono text-muted-foreground">
                        <span className="text-muted-foreground/80">session_id · </span>
                        {ingestDetailThread[0]?.sessionId ?? "—"}
                      </p>
                      {ingestDetailThread[0]?.cursorGenerationId ? (
                        <p className="break-all font-mono text-muted-foreground">
                          <span className="text-muted-foreground/80">generation · </span>
                          {ingestDetailThread[0].cursorGenerationId}
                        </p>
                      ) : null}
                      {ingestDetailThread[0]?.cursorConversationId ? (
                        <p className="break-all font-mono text-muted-foreground">
                          <span className="text-muted-foreground/80">conversation · </span>
                          {ingestDetailThread[0].cursorConversationId}
                        </p>
                      ) : null}
                    </CollapsibleContent>
                  </Collapsible>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Full bodies
                  </p>
                  {ingestDetailThread.map((ingestDetail) => (
                    <div
                      key={ingestDetail.id}
                      id={`ingest-detail-${ingestDetail.id}`}
                      className={cn(
                        "scroll-mt-4 flex flex-col gap-3 rounded-lg border border-transparent p-2 transition-colors",
                        ingestFocusId === ingestDetail.id &&
                          "border-primary/20 bg-primary/4 shadow-sm",
                      )}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                        {ingestDetailSectionLabel(ingestDetail)}
                      </p>
                      <dl className="grid gap-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Time</dt>
                          <dd className="font-mono text-foreground">
                            {new Date(ingestDetail.createdAt).toLocaleString()}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Gateway</dt>
                          <dd className="text-foreground">
                            {ingestDetail.gatewayOk === false
                              ? "error"
                              : ingestDetail.gatewayOk === true
                                ? "ok"
                                : "—"}
                            {ingestDetail.gatewayStatus != null
                              ? ` · HTTP ${ingestDetail.gatewayStatus}`
                              : ""}
                            {ingestDetail.latencyMs != null ? ` · ${ingestDetail.latencyMs} ms` : ""}
                          </dd>
                        </div>
                        {ingestDetail.contentLength != null ? (
                          <div>
                            <dt className="text-muted-foreground">Original length</dt>
                            <dd className="text-foreground">
                              {ingestDetail.contentLength.toLocaleString()} chars
                              {ingestDetail.contentTruncated
                                ? " (dashboard cap applied — see below)"
                                : ""}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                      <div>
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Summary (list preview)
                        </p>
                        <p className="mb-3 text-sm text-muted-foreground whitespace-pre-wrap">
                          {ingestDetail.summary}
                        </p>
                        <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Full stored content (Markdown)
                        </p>
                        <div className="max-h-64 overflow-y-auto rounded-md border border-foreground/10 p-3 text-xs">
                          {ingestDetail.storedContent ? (
                            <MemoryMarkdown source={ingestDetail.storedContent} />
                          ) : (
                            <p className="italic text-muted-foreground">
                              No full text was saved for this event. Only the summary above is
                              available.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : ingestOpen?.kind === "turn" && ingestDetailTurn ? (
              <ScrollArea className="h-[calc(100vh-8rem)] pr-3">
                <div className="flex flex-col gap-6 pb-6">
                  <MemoryIngestKnowledgeGraph
                    details={[ingestDetailTurn.user, ingestDetailTurn.assistant]}
                    selectedId={ingestFocusId}
                    onSelect={selectIngestGraphNode}
                  />
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-full border-foreground/15 text-[10px] uppercase tracking-wide"
                      >
                        Session &amp; technical
                        <ChevronDown className="ml-1 size-3" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2 space-y-2 rounded-lg border border-foreground/10 bg-muted/25 px-3 py-2 text-[11px] font-mono leading-relaxed text-muted-foreground">
                      {ingestDetailTurn.user.sessionId ? (
                        <p className="break-all">session_id · {ingestDetailTurn.user.sessionId}</p>
                      ) : null}
                    </CollapsibleContent>
                  </Collapsible>
                  {(["user", "assistant"] as const).map((side) => {
                    const ingestDetail = ingestDetailTurn[side]
                    const label = side === "user" ? "Your prompt" : "Assistant reply"
                    return (
                      <div
                        key={ingestDetail.id}
                        id={`ingest-detail-${ingestDetail.id}`}
                        className={cn(
                          "scroll-mt-4 flex flex-col gap-3 rounded-lg border border-transparent p-2 transition-colors",
                          ingestFocusId === ingestDetail.id &&
                            "border-primary/20 bg-primary/4 shadow-sm",
                        )}
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">
                          {label}
                        </p>
                        <dl className="grid gap-2 text-xs">
                          <div>
                            <dt className="text-muted-foreground">Time</dt>
                            <dd className="font-mono text-foreground">
                              {new Date(ingestDetail.createdAt).toLocaleString()}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Gateway</dt>
                            <dd className="text-foreground">
                              {ingestDetail.gatewayOk === false
                                ? "error"
                                : ingestDetail.gatewayOk === true
                                  ? "ok"
                                  : "—"}
                              {ingestDetail.gatewayStatus != null
                                ? ` · HTTP ${ingestDetail.gatewayStatus}`
                                : ""}
                              {ingestDetail.latencyMs != null
                                ? ` · ${ingestDetail.latencyMs} ms`
                                : ""}
                            </dd>
                          </div>
                          {ingestDetail.contentLength != null ? (
                            <div>
                              <dt className="text-muted-foreground">Original length</dt>
                              <dd className="text-foreground">
                                {ingestDetail.contentLength.toLocaleString()} chars
                                {ingestDetail.contentTruncated
                                  ? " (dashboard cap applied — see below)"
                                  : ""}
                              </dd>
                            </div>
                          ) : null}
                        </dl>
                        <div>
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Summary (list preview)
                          </p>
                          <p className="mb-3 text-sm text-muted-foreground whitespace-pre-wrap">
                            {ingestDetail.summary}
                          </p>
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                            Full stored content (Markdown)
                          </p>
                          <div className="max-h-64 overflow-y-auto rounded-md border border-foreground/10 p-3 text-xs">
                            {ingestDetail.storedContent ? (
                              <MemoryMarkdown source={ingestDetail.storedContent} />
                            ) : (
                              <p className="italic text-muted-foreground">
                                No full text was saved for this event. Only the summary above is
                                available.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </ScrollArea>
            ) : ingestOpen?.kind === "single" && ingestDetailSingle ? (
              <div className="flex h-full flex-col gap-4 overflow-y-auto">
                <MemoryIngestKnowledgeGraph
                  details={[ingestDetailSingle]}
                  selectedId={ingestFocusId}
                  onSelect={selectIngestGraphNode}
                />
                <Collapsible>
                  <CollapsibleTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-full border-foreground/15 text-[10px] uppercase tracking-wide"
                    >
                      Session &amp; technical
                      <ChevronDown className="ml-1 size-3" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-2 space-y-2 rounded-lg border border-foreground/10 bg-muted/25 px-3 py-2 text-[11px] font-mono leading-relaxed text-muted-foreground">
                    {ingestDetailSingle.sessionId ? (
                      <p className="break-all">session_id · {ingestDetailSingle.sessionId}</p>
                    ) : null}
                    {ingestDetailSingle.cursorGenerationId ? (
                      <p className="break-all">generation · {ingestDetailSingle.cursorGenerationId}</p>
                    ) : null}
                  </CollapsibleContent>
                </Collapsible>
                <div
                  id={`ingest-detail-${ingestDetailSingle.id}`}
                  className={cn(
                    "flex min-h-0 flex-1 flex-col gap-3 rounded-lg border border-transparent p-1 transition-colors",
                    ingestFocusId === ingestDetailSingle.id && "border-primary/20 bg-primary/4",
                  )}
                >
                <dl className="grid gap-2 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Time</dt>
                    <dd className="font-mono text-foreground">
                      {new Date(ingestDetailSingle.createdAt).toLocaleString()}
                    </dd>
                  </div>
                  {ingestDetailSingle.role ? (
                    <div>
                      <dt className="text-muted-foreground">role</dt>
                      <dd className="text-foreground">{ingestDetailSingle.role}</dd>
                    </div>
                  ) : null}
                  {ingestDetailSingle.filename ? (
                    <div>
                      <dt className="text-muted-foreground">file</dt>
                      <dd className="break-all text-foreground">{ingestDetailSingle.filename}</dd>
                    </div>
                  ) : null}
                  {ingestDetailSingle.assetId ? (
                    <div>
                      <dt className="text-muted-foreground">asset id</dt>
                      <dd className="break-all font-mono text-foreground">
                        {ingestDetailSingle.assetId}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-muted-foreground">Gateway</dt>
                    <dd className="text-foreground">
                      {ingestDetailSingle.gatewayOk === false
                        ? "error"
                        : ingestDetailSingle.gatewayOk === true
                          ? "ok"
                          : "—"}
                      {ingestDetailSingle.gatewayStatus != null
                        ? ` · HTTP ${ingestDetailSingle.gatewayStatus}`
                        : ""}
                      {ingestDetailSingle.latencyMs != null
                        ? ` · ${ingestDetailSingle.latencyMs} ms`
                        : ""}
                    </dd>
                  </div>
                  {ingestDetailSingle.contentLength != null ? (
                    <div>
                      <dt className="text-muted-foreground">Original length</dt>
                      <dd className="text-foreground">
                        {ingestDetailSingle.contentLength.toLocaleString()} chars
                        {ingestDetailSingle.contentTruncated
                          ? " (dashboard cap applied — see below)"
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                <div className="min-h-0 flex-1">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Summary (list preview)
                  </p>
                  <p className="mb-3 text-sm text-muted-foreground whitespace-pre-wrap">
                    {ingestDetailSingle.summary}
                  </p>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Full stored content (Markdown)
                  </p>
                  <ScrollArea className="h-[min(60vh,520px)] rounded-md border border-foreground/10">
                    <div className="p-3 text-xs">
                      {ingestDetailSingle.storedContent ? (
                        <MemoryMarkdown source={ingestDetailSingle.storedContent} />
                      ) : (
                        <p className="italic text-muted-foreground">
                          No full text was saved for this event (ingest before this feature, or
                          non-text upload). Only the summary above is available.
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-destructive">Could not load this ingest.</p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={semanticDetail !== null}
        onOpenChange={(open) => {
          if (!open) setSemanticDetail(null)
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-4 py-3 text-left">
            <DialogTitle className="font-mono text-sm leading-snug pr-8">
              {semanticDetail?.title ?? "Result"}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[calc(85vh-4rem)]">
            <div className="space-y-3 px-4 py-3">
              <div>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Text (Markdown when applicable)
                </p>
                <div className="text-sm">
                  {(semanticDetail?.bodyFull ?? semanticDetail?.body ?? "").trim() ? (
                    <MemoryMarkdown
                      source={semanticDetail?.bodyFull ?? semanticDetail?.body ?? ""}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </div>
              </div>
              {semanticDetail?.raw && Object.keys(semanticDetail.raw).length > 0 ? (
                <div>
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    Raw fields
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-md border border-foreground/10 bg-muted/30 p-2 font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(semanticDetail.raw, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  )
}
