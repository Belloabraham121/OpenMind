export type MeWorkspace = {
  id: string
  name: string
  slug: string
}

export type MeResponse = {
  defaultMemorySessionId?: string
  user: {
    id: string
    email: string | null
    phone: string | null
    emailVerified: boolean
    phoneVerified: boolean
  }
  workspaces: MeWorkspace[]
  primaryWorkspaceId: string | null
}

export type OverviewMetric = {
  label: string
  value: string
  hint: string
}

export type OverviewResponse = {
  metrics: OverviewMetric[]
  gateway: {
    configured: boolean
    reachable: boolean
    status?: string
  }
}

export type ActivityItem = {
  id: string
  kind: string
  summary: string
  createdAt: string
}

export type ActivityResponse = {
  items: ActivityItem[]
  nextCursor: string | null
}

export type MemoryQueryResultItem = {
  title: string
  body: string
  /** Full normalized text for detail dialogs. */
  bodyFull?: string
  score?: number
  raw?: Record<string, unknown>
}

/** Ingest events recorded when storing via /api/gateway/memory/store (and related). */
export type MemoryIndexItem = {
  id: string
  createdAt: string
  sessionId: string | null
  summary: string
  role: string | null
  gatewayOk: boolean | null
  gatewayStatus: number | null
  /** True when full text was persisted (new ingests); older rows open to summary only. */
  hasStoredContent: boolean
  /** Cursor Composer step id — links user prompt, file edits, and assistant reply in one card. */
  cursorGenerationId: string | null
  cursorConversationId: string | null
}

/** List row after grouping adjacent hook captures (user + assistant) in Memory Explorer. */
export type MemoryIndexTurn = {
  kind: "turn"
  assistant: MemoryIndexItem
  user: MemoryIndexItem
}

/** Same Composer generation: prompt + code edits + reply (when hooks send cursor_generation_id). */
export type MemoryIndexThread = {
  kind: "thread"
  generationId: string
  conversationId: string | null
  /** Chronological order (oldest first) for display. */
  members: MemoryIndexItem[]
}

export type MemoryIndexSingle = {
  kind: "single"
  item: MemoryIndexItem
}

export type MemoryIndexListEntry = MemoryIndexTurn | MemoryIndexThread | MemoryIndexSingle

export type MemoryIndexResponse = {
  items: MemoryIndexListEntry[]
  nextCursor: string | null
}

export type MemoryIngestDetail = {
  id: string
  createdAt: string
  summary: string
  sessionId: string | null
  role: string | null
  gatewayOk: boolean | null
  gatewayStatus: number | null
  latencyMs: number | null
  storedContent: string | null
  contentLength: number | null
  contentTruncated: boolean
  assetId: string | null
  filename: string | null
  cursorGenerationId?: string | null
  cursorConversationId?: string | null
}
