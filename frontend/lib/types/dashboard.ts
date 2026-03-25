export type MeWorkspace = {
  id: string
  name: string
  slug: string
}

export type MeResponse = {
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
  score?: number
  raw?: Record<string, unknown>
}
