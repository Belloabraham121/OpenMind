"use client"

import { Fragment } from "react"
import { Bot, ChevronRight, FileCode2, MessageSquareQuote, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import type { MemoryIngestDetail } from "@/lib/types/dashboard"

function sectionKind(d: MemoryIngestDetail): "user" | "assistant" | "code" | "other" {
  if (d.summary.includes("User prompt (auto-captured)")) return "user"
  if (d.summary.includes("Assistant reply (auto-captured)")) return "assistant"
  if (d.summary.includes("Code edit (auto-captured)")) return "code"
  return "other"
}

function sectionTitle(d: MemoryIngestDetail): string {
  if (sectionKind(d) === "user") return "Your prompt"
  if (sectionKind(d) === "assistant") return "Assistant reply"
  if (sectionKind(d) === "code") return "Code edit"
  return d.role === "user" ? "User" : d.role === "assistant" ? "Assistant" : "Ingest"
}

/** Summary line often contains `- **File:** `path` — extract for graph subtitle. */
function codeEditPathHint(summary: string): string | undefined {
  const m = summary.match(/\*\*File:\*\*\s*`([^`]+)`/)
  if (m?.[1]) return m[1].length > 42 ? `${m[1].slice(0, 40)}…` : m[1]
  return undefined
}

function previewSnippet(d: MemoryIngestDetail, max = 52): string {
  const s = d.summary.trim()
  if (!s) return "…"
  return s.length > max ? `${s.slice(0, max)}…` : s
}

const iconWrap =
  "flex size-8 shrink-0 items-center justify-center rounded-md border border-foreground/15 bg-background"

export type MemoryIngestKnowledgeGraphProps = {
  details: MemoryIngestDetail[]
  selectedId: string | null
  onSelect: (id: string) => void
  className?: string
}

/**
 * Horizontal flow of ingest “nodes” (prompt → edits → reply). Click a node to jump to its body below.
 */
export function MemoryIngestKnowledgeGraph({
  details,
  selectedId,
  onSelect,
  className,
}: MemoryIngestKnowledgeGraphProps) {
  if (!details.length) return null

  return (
    <div
      className={cn(
        "rounded-xl border border-foreground/10 bg-linear-to-br from-muted/40 via-background to-muted/30 p-3 shadow-none",
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Knowledge flow
        </p>
        <span className="text-[10px] text-muted-foreground/80">{details.length} linked</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-y-2">
        {details.map((d, i) => {
          const kind = sectionKind(d)
          const icon =
            kind === "user" ? (
              <MessageSquareQuote className="size-4 text-foreground/80" aria-hidden />
            ) : kind === "code" ? (
              <FileCode2 className="size-4 text-foreground/80" aria-hidden />
            ) : kind === "assistant" ? (
              <Bot className="size-4 text-foreground/80" aria-hidden />
            ) : (
              <Sparkles className="size-4 text-foreground/80" aria-hidden />
            )
          const sub = kind === "code" ? codeEditPathHint(d.summary) : undefined
          const active = selectedId === d.id

          return (
            <Fragment key={d.id}>
              {i > 0 ? (
                <ChevronRight
                  className="mx-0.5 size-4 shrink-0 text-muted-foreground/45"
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(d.id)}
                title={previewSnippet(d, 200)}
                className={cn(
                  "flex max-w-44 min-w-0 flex-col gap-1 rounded-lg border px-2 py-2 text-left transition-colors",
                  "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/25"
                    : "border-foreground/10 bg-background/80",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={iconWrap}>{icon}</span>
                  <span className="truncate text-[11px] font-medium leading-tight text-foreground">
                    {sectionTitle(d)}
                  </span>
                </div>
                {sub ? (
                  <span className="truncate pl-10 font-mono text-[10px] text-muted-foreground">
                    {sub}
                  </span>
                ) : (
                  <span className="line-clamp-2 pl-10 text-[10px] leading-snug text-muted-foreground">
                    {previewSnippet(d)}
                  </span>
                )}
              </button>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
