"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { apiJson } from "@/lib/api-client"
import type { NetworkChallengeMode, NetworkQualityResponse } from "@/lib/types/dashboard"
import { cn } from "@/lib/utils"
import { Loader2, Radio, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Matches validator main-loop sleep (~12s); poll often enough to catch step changes quickly. */
const POLL_MS = 4000

/** Mirrors ``ALPHA_*`` weights in openmind-subnet/openmind/scoring.py (Σ = 15). */
const EMISSION_PILLARS = [
  {
    key: "retrieval",
    label: "Retrieval",
    description: "Recall on validator-held probes; beats random chunk baselines.",
    alpha: 3,
    fractionOfReward: 3 / 15,
  },
  {
    key: "fidelity",
    label: "Fidelity",
    description: "Storage presence, versioning, and checkpoint signals — memory that stays true to expectations.",
    alpha: 6,
    fractionOfReward: 6 / 15,
  },
  {
    key: "reconstruction",
    label: "Reconstruction",
    description: "Extraction quality and temporal accuracy — structured rebuild of facts and time.",
    alpha: 5,
    fractionOfReward: 5 / 15,
  },
  {
    key: "latency",
    label: "Latency",
    description: "Responsiveness penalty — rewards sub-second miner replies where possible.",
    alpha: 1,
    fractionOfReward: 1 / 15,
  },
] as const

function formatScore(n: number | null): string {
  if (n === null) return "—"
  return n.toFixed(2)
}

function formatLat(n: number | null): string {
  if (n === null) return "—"
  return `${Math.round(n)} ms`
}

function ChallengeCard({ mode, active }: { mode: NetworkChallengeMode; active: boolean }) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2.5 text-sm transition-colors",
        active
          ? "border-primary/40 bg-primary/5"
          : "border-foreground/10 bg-muted/20",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-muted-foreground">mode {mode.id}</span>
        {active ? (
          <Badge variant="secondary" className="text-[10px]">
            current
          </Badge>
        ) : null}
      </div>
      <div className="mt-1 font-medium text-foreground">{mode.label}</div>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{mode.description}</p>
    </div>
  )
}

export function NetworkQualityClient() {
  const [data, setData] = useState<NetworkQualityResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const loadSeq = useRef(0)

  const load = useCallback(async (silent = false) => {
    const seq = ++loadSeq.current
    if (silent) setRefreshing(true)
    else setLoading(true)
    const { ok, data: d } = await apiJson<NetworkQualityResponse>("/api/dashboard/network-quality")
    if (seq !== loadSeq.current) return
    if (ok && d) {
      setData(d)
      setLastUpdated(new Date())
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void load(false)
  }, [load])

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return
      void load(true)
    }
    const id = window.setInterval(tick, POLL_MS)
    const onVis = () => {
      if (document.visibilityState === "visible") void load(true)
    }
    document.addEventListener("visibilitychange", onVis)
    return () => {
      window.clearInterval(id)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [load])

  const showAxisColumns = data?.source === "demo" || data?.miners.some((m) => m.retrieval !== null)

  return (
    <>
      <DashboardPageIntro
        title="Network Quality"
        description="Miner leaderboard and validator challenge outcomes. Emissions follow benchmark-beating utility on retrieval, fidelity, and reconstruction."
      />
      {loading || !data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant={data.source === "gateway" ? "default" : "outline"}>
                {data.source === "gateway" ? "Live EMA" : "Demo data"}
              </Badge>
              {data.gatewayConfigured ? (
                <span>
                  Gateway: {data.gatewayReachable ? "reachable" : "unreachable"}
                </span>
              ) : (
                <span>Gateway not configured</span>
              )}
              {data.validatorStep !== null ? (
                <span className="font-mono text-xs">
                  validator step {data.validatorStep}
                  {data.metagraphN !== null ? ` · n=${data.metagraphN}` : ""}
                  {data.sampleSize !== null ? ` · sample ${data.sampleSize}` : ""}
                </span>
              ) : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={refreshing}
              onClick={() => void load(true)}
            >
              <RefreshCw className={cn("mr-1.5 size-3.5", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-foreground/10 shadow-none">
              <CardHeader>
                <CardTitle className="font-display text-xl">Emission mix</CardTitle>
                <CardDescription>
                  Composite reward groups the ALPHA weights in{" "}
                  <span className="font-mono text-xs">openmind/scoring.py</span> — utility on retrieval,
                  fidelity-shaped storage/version/checkpoint probes, reconstruction via extraction + temporal
                  signals, plus latency.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {EMISSION_PILLARS.map((p) => (
                  <div key={p.key}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{p.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        α={p.alpha} · {(p.fractionOfReward * 100).toFixed(1)}% of weight sum
                      </span>
                    </div>
                    <Progress value={p.fractionOfReward * 100} className="mt-1.5 h-1.5" />
                    <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-foreground/10 shadow-none">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="font-display text-xl">Validator focus</CardTitle>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Radio
                      className={cn("size-3.5 text-primary", refreshing && "animate-pulse")}
                      aria-hidden
                    />
                    <span className="font-mono">Live · ~{Math.round(POLL_MS / 1000)}s</span>
                    {lastUpdated ? (
                      <span className="tabular-nums text-[10px] opacity-80">
                        · {lastUpdated.toLocaleTimeString()}
                      </span>
                    ) : null}
                  </div>
                </div>
                <CardDescription>
                  Challenges rotate each forward step (mode = step mod 5). Miners are sampled from the
                  metagraph and scored into an exponential moving average.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.currentChallenge ? (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm transition-colors duration-300">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium uppercase tracking-wide text-primary">
                        This step
                      </div>
                      {data.validatorStep !== null ? (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          step {data.validatorStep} → mode {data.currentChallenge.id}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 font-display text-lg">{data.currentChallenge.label}</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {data.currentChallenge.description}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {data.gatewayConfigured
                      ? data.gatewayReachable
                        ? "Validator step not reported yet. Once the gateway exposes step, the active challenge mode appears here (step mod 5)."
                        : "Subnet gateway unreachable — verify SUBNET_GATEWAY_URL and that the validator process is listening."
                      : "Set SUBNET_GATEWAY_URL to your validator gateway URL so health and quality endpoints can report step and challenge mode."}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-foreground/10 shadow-none">
            <CardHeader>
              <CardTitle className="font-display text-xl">Challenge rotation</CardTitle>
              <CardDescription>
                Five validator modes — retrieval recall, storage fidelity, version/checkpoint, extraction
                quality, temporal accuracy.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {data.challengeModes.map((m) => (
                  <ChallengeCard
                    key={m.key}
                    mode={m}
                    active={data.currentChallenge?.id === m.id}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-foreground/10 shadow-none">
            <CardHeader className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <CardTitle className="font-display text-xl">Miner leaderboard</CardTitle>
                <CardDescription>
                  Ranked by validator EMA when live; sample rows otherwise. Hotkeys truncated for display.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-mono text-xs">#</TableHead>
                    <TableHead className="font-mono text-xs">UID</TableHead>
                    <TableHead className="font-mono text-xs">Hotkey</TableHead>
                    <TableHead className="font-mono text-xs">EMA</TableHead>
                    {showAxisColumns ? (
                      <>
                        <TableHead className="font-mono text-xs">Retrieval</TableHead>
                        <TableHead className="font-mono text-xs">Fidelity</TableHead>
                        <TableHead className="font-mono text-xs">Recon.</TableHead>
                        <TableHead className="font-mono text-xs">p95</TableHead>
                      </>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.miners.map((m) => (
                    <TableRow key={`${m.uid}-${m.rank}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{m.rank}</TableCell>
                      <TableCell className="font-mono text-sm">{m.uid}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {m.hotkeyPreview}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{m.emaScore.toFixed(3)}</TableCell>
                      {showAxisColumns ? (
                        <>
                          <TableCell className="text-muted-foreground">{formatScore(m.retrieval)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatScore(m.fidelity)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatScore(m.reconstruction)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatLat(m.latencyP95Ms)}</TableCell>
                        </>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="mt-3 text-xs text-muted-foreground">{data.outcomesNote}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
