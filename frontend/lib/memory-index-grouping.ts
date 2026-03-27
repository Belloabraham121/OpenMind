import type {
  MemoryIndexItem,
  MemoryIndexListEntry,
} from "@/lib/types/dashboard"

const MAX_TURN_GAP_MS = 45 * 60 * 1000

function isAutoUser(summary: string): boolean {
  return summary.includes("User prompt (auto-captured)")
}

function isAutoAssistant(summary: string): boolean {
  return summary.includes("Assistant reply (auto-captured)")
}

function entryLatestMs(e: MemoryIndexListEntry): number {
  if (e.kind === "thread") {
    return e.members.reduce(
      (mx, m) => Math.max(mx, new Date(m.createdAt).getTime()),
      0,
    )
  }
  if (e.kind === "turn") {
    return Math.max(
      new Date(e.assistant.createdAt).getTime(),
      new Date(e.user.createdAt).getTime(),
    )
  }
  return new Date(e.item.createdAt).getTime()
}

/**
 * `items` must be sorted newest-first (e.g. Mongo _id desc).
 * Adjacent assistant-then-user with same session and close timestamps become one turn.
 */
export function groupHookCaptureTurns(
  items: MemoryIndexItem[],
): MemoryIndexListEntry[] {
  const out: MemoryIndexListEntry[] = []
  let i = 0
  while (i < items.length) {
    const a = items[i]!
    const b = items[i + 1]
    if (
      b &&
      a.role === "assistant" &&
      b.role === "user" &&
      a.sessionId &&
      a.sessionId === b.sessionId &&
      isAutoAssistant(a.summary) &&
      isAutoUser(b.summary)
    ) {
      const ta = new Date(a.createdAt).getTime()
      const tb = new Date(b.createdAt).getTime()
      if (ta >= tb && ta - tb <= MAX_TURN_GAP_MS) {
        out.push({ kind: "turn", assistant: a, user: b })
        i += 2
        continue
      }
    }
    out.push({ kind: "single", item: a })
    i += 1
  }
  return out
}

/**
 * Groups Cursor hook ingests that share `cursorGenerationId` into one thread (prompt + edits + reply),
 * then applies legacy user/assistant pairing on the rest. Result sorted newest-first by latest event in each entry.
 */
export function buildMemoryIndexList(items: MemoryIndexItem[]): MemoryIndexListEntry[] {
  const withGen: MemoryIndexItem[] = []
  const withoutGen: MemoryIndexItem[] = []
  for (const it of items) {
    if (it.cursorGenerationId) withGen.push(it)
    else withoutGen.push(it)
  }

  const byGen = new Map<string, MemoryIndexItem[]>()
  for (const it of withGen) {
    const g = it.cursorGenerationId as string
    const arr = byGen.get(g) ?? []
    arr.push(it)
    byGen.set(g, arr)
  }

  const threadEntries: MemoryIndexListEntry[] = []
  for (const [generationId, members] of byGen) {
    const sorted = [...members].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    const conversationId =
      sorted.map((m) => m.cursorConversationId).find((c) => c && c.length > 0) ?? null
    threadEntries.push({ kind: "thread", generationId, conversationId, members: sorted })
  }

  const legacy = groupHookCaptureTurns(withoutGen)
  const merged: MemoryIndexListEntry[] = [...threadEntries, ...legacy]
  merged.sort((a, b) => entryLatestMs(b) - entryLatestMs(a))
  return merged
}
