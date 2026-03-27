"use client"

import { useId } from "react"

const MAX_DEPTH = 14
const STRING_PREVIEW = 2000

type Props = {
  value: unknown
  depth?: number
  /**
   * Objects/arrays on the path from root to here. Same object may appear again in other
   * branches (shared refs) — we only mark [circular] if it appears while still an ancestor.
   */
  path?: WeakSet<object>
}

function JsonScalar({ value }: { value: string | number | boolean | null | undefined }) {
  if (value === null) return <span className="text-amber-600/90 dark:text-amber-400/90">null</span>
  if (value === undefined) return <span className="text-muted-foreground italic">undefined</span>
  if (typeof value === "boolean") {
    return <span className="text-emerald-600 dark:text-emerald-400">{String(value)}</span>
  }
  if (typeof value === "number") {
    return <span className="tabular-nums text-sky-700 dark:text-sky-300">{value}</span>
  }
  const s = value
  if (s.length > STRING_PREVIEW) {
    return (
      <span className="break-all text-foreground">
        {s.slice(0, STRING_PREVIEW)}
        <span className="text-muted-foreground">
          … ({(s.length - STRING_PREVIEW).toLocaleString()} more chars)
        </span>
      </span>
    )
  }
  return <span className="whitespace-pre-wrap break-all text-foreground">{s}</span>
}

/**
 * Recursive tree view for JSON-like values. Shared references across siblings render each time;
 * only true cycles (A → … → A on the active path) show [circular].
 */
export function JsonStructureView({ value, depth = 0, path }: Props) {
  const uid = useId()
  const branchPath = path ?? new WeakSet<object>()

  if (depth > MAX_DEPTH) {
    return <span className="text-destructive text-xs">… max depth</span>
  }

  if (value === null || value === undefined) {
    return <JsonScalar value={value === null ? null : undefined} />
  }

  const t = typeof value
  if (t === "string" || t === "number" || t === "boolean") {
    return <JsonScalar value={value as string | number | boolean} />
  }

  if (Array.isArray(value)) {
    if (branchPath.has(value)) {
      return <span className="text-destructive text-xs">[circular]</span>
    }
    if (value.length === 0) {
      return <span className="font-mono text-xs text-muted-foreground">[]</span>
    }
    branchPath.add(value)
    try {
      return (
        <ul className="list-none space-y-2 border-l border-foreground/15 pl-3">
          {value.map((item, i) => (
            <li key={`${uid}-${i}`} className="text-sm">
              <span className="mr-2 inline-block min-w-8 font-mono text-[10px] text-muted-foreground">
                [{i}]
              </span>
              <JsonStructureView value={item} depth={depth + 1} path={branchPath} />
            </li>
          ))}
        </ul>
      )
    } finally {
      branchPath.delete(value)
    }
  }

  if (t === "object") {
    const obj = value as Record<string, unknown>
    if (branchPath.has(obj)) {
      return <span className="text-destructive text-xs">[circular]</span>
    }
    branchPath.add(obj)
    try {
      const keys = Object.keys(obj)
      if (keys.length === 0) {
        return <span className="font-mono text-xs text-muted-foreground">{"{}"}</span>
      }
      return (
        <dl className="space-y-3 border-l border-foreground/15 pl-3">
          {keys.map((k) => (
            <div key={k}>
              <dt className="font-mono text-xs font-medium leading-snug text-foreground">{k}</dt>
              <dd className="mt-1 pl-0 sm:pl-2">
                <JsonStructureView value={obj[k]} depth={depth + 1} path={branchPath} />
              </dd>
            </div>
          ))}
        </dl>
      )
    } finally {
      branchPath.delete(obj)
    }
  }

  return <span className="text-muted-foreground text-xs">{String(value)}</span>
}
