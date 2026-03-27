import { NextResponse } from "next/server"
import { forwardSubnetJson, getSubnetGatewayBaseUrl } from "@/lib/gateway-proxy"
import { getSessionUser } from "@/lib/require-session"
import type {
  NetworkChallengeMode,
  NetworkMinerRow,
  NetworkQualityResponse,
} from "@/lib/types/dashboard"

export const runtime = "nodejs"

type GatewayChallengeMode = {
  id?: number
  key?: string
  label?: string
  description?: string
}

type GatewayMiner = {
  uid?: number
  hotkey_preview?: string
  ema_score?: number
}

type GatewayQualityPayload = {
  configured?: boolean
  validator_step?: number
  metagraph_n?: number
  sample_size?: number
  leaderboard?: GatewayMiner[]
  challenge_modes?: GatewayChallengeMode[]
  current_challenge?: GatewayChallengeMode | null
}

type GatewayHealthPayload = {
  validator_step?: number
  metagraph_n?: number
}

const DEMO_MINERS: Omit<NetworkMinerRow, "rank">[] = [
  {
    uid: 42,
    hotkeyPreview: "5F8s7…a2k1",
    emaScore: 0.874,
    retrieval: 0.91,
    fidelity: 0.98,
    reconstruction: 0.89,
    latencyP95Ms: 540,
  },
  {
    uid: 17,
    hotkeyPreview: "5DHx9…m7pq",
    emaScore: 0.821,
    retrieval: 0.88,
    fidelity: 0.97,
    reconstruction: 0.84,
    latencyP95Ms: 610,
  },
  {
    uid: 23,
    hotkeyPreview: "5Ct2L…v3r8",
    emaScore: 0.763,
    retrieval: 0.84,
    fidelity: 0.95,
    reconstruction: 0.79,
    latencyP95Ms: 720,
  },
  {
    uid: 31,
    hotkeyPreview: "5Gm4N…j9w2",
    emaScore: 0.701,
    retrieval: 0.79,
    fidelity: 0.93,
    reconstruction: 0.76,
    latencyP95Ms: 890,
  },
]

const FALLBACK_MODES: NetworkChallengeMode[] = [
  {
    id: 0,
    key: "retrieval",
    label: "Retrieval recall",
    description: "Ground-truth chunk recall against validator-held probes.",
  },
  {
    id: 1,
    key: "storage",
    label: "Storage fidelity",
    description: "Structured memory results present for durability probes.",
  },
  {
    id: 2,
    key: "versioning",
    label: "Version & checkpoint",
    description: "Version and checkpoint consistency signals.",
  },
  {
    id: 3,
    key: "extraction",
    label: "Reconstruction (extraction)",
    description: "Fact extraction quality in retrieval responses over memory miners have already ingested.",
  },
  {
    id: 4,
    key: "temporal",
    label: "Temporal accuracy",
    description: "Whether returned chunks preserve temporal / stored-episode signals from real user traffic.",
  },
]

function mapMode(m: GatewayChallengeMode): NetworkChallengeMode {
  return {
    id: typeof m.id === "number" ? m.id : 0,
    key: typeof m.key === "string" ? m.key : "unknown",
    label: typeof m.label === "string" ? m.label : "Challenge",
    description: typeof m.description === "string" ? m.description : "",
  }
}

function withRanks(rows: Omit<NetworkMinerRow, "rank">[]): NetworkMinerRow[] {
  return rows.map((r, i) => ({ ...r, rank: i + 1 }))
}

function modeAtStep(step: number, modes: NetworkChallengeMode[]): NetworkChallengeMode {
  if (modes.length === 0) return FALLBACK_MODES[0]!
  const idx = ((step % modes.length) + modes.length) % modes.length
  return modes[idx]!
}

export async function GET() {
  const session = await getSessionUser()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const gatewayConfigured = Boolean(getSubnetGatewayBaseUrl())
  let gatewayReachable: boolean | null = null
  let payload: GatewayQualityPayload | null = null
  let healthBody: GatewayHealthPayload | null = null

  if (gatewayConfigured) {
    const [healthRes, qualityResFirst] = await Promise.all([
      forwardSubnetJson("/v1/health", { method: "GET" }),
      forwardSubnetJson("/v1/subnet/quality", { method: "GET" }),
    ])
    let qualityRes = qualityResFirst
    if (!qualityRes.ok && qualityRes.status === 404) {
      qualityRes = await forwardSubnetJson("/v1/network/quality", { method: "GET" })
    }
    gatewayReachable = healthRes.ok
    if (healthRes.ok && healthRes.data && typeof healthRes.data === "object") {
      healthBody = healthRes.data as GatewayHealthPayload
    }
    if (qualityRes.ok && qualityRes.data && typeof qualityRes.data === "object") {
      payload = qualityRes.data as GatewayQualityPayload
    }
  }

  const challengeModes =
    payload?.challenge_modes?.length && Array.isArray(payload.challenge_modes)
      ? payload.challenge_modes.map(mapMode)
      : FALLBACK_MODES

  const validatorStepFromQuality =
    typeof payload?.validator_step === "number" ? payload.validator_step : null
  const validatorStepFromHealth =
    typeof healthBody?.validator_step === "number" ? healthBody.validator_step : null
  const validatorStep = validatorStepFromQuality ?? validatorStepFromHealth

  const metagraphNFromQuality =
    typeof payload?.metagraph_n === "number" ? payload.metagraph_n : null
  const metagraphNFromHealth =
    typeof healthBody?.metagraph_n === "number" ? healthBody.metagraph_n : null
  const metagraphN = metagraphNFromQuality ?? metagraphNFromHealth

  const currentChallengeFromPayload =
    payload?.current_challenge != null ? mapMode(payload.current_challenge) : null
  const currentChallenge =
    currentChallengeFromPayload ??
    (validatorStep !== null ? modeAtStep(validatorStep, challengeModes) : null)

  const sampleSize = typeof payload?.sample_size === "number" ? payload.sample_size : null

  const lb = payload?.leaderboard
  const useLive =
    payload?.configured === true &&
    gatewayReachable === true &&
    Array.isArray(lb) &&
    lb.length > 0

  let miners: NetworkMinerRow[]
  let source: NetworkQualityResponse["source"]
  let outcomesNote: string

  if (useLive) {
    miners = withRanks(
      lb!.map((row) => ({
        uid: typeof row.uid === "number" ? row.uid : -1,
        hotkeyPreview: typeof row.hotkey_preview === "string" ? row.hotkey_preview : "—",
        emaScore: typeof row.ema_score === "number" ? row.ema_score : 0,
        retrieval: null,
        fidelity: null,
        reconstruction: null,
        latencyP95Ms: null,
      })),
    )
    source = "gateway"
    outcomesNote =
      "Sorted by composite reward EMA from the validator (openmind.scoring). Per-probe retrieval, fidelity, and reconstruction breakdowns are not exposed on this endpoint yet — those columns appear when viewing demo data."
  } else {
    miners = withRanks(DEMO_MINERS)
    source = "demo"
    outcomesNote =
      gatewayConfigured && gatewayReachable
        ? "Validator reports no scored miners yet (empty leaderboard). Showing sample miners until forward passes populate EMA scores."
        : "Sample miners for layout preview. Point SUBNET_GATEWAY_URL at a running validator gateway for live EMA scores."
  }

  const body: NetworkQualityResponse = {
    source,
    gatewayConfigured,
    gatewayReachable,
    validatorStep,
    metagraphN,
    sampleSize,
    currentChallenge,
    challengeModes,
    miners,
    outcomesNote,
  }

  return NextResponse.json(body)
}
