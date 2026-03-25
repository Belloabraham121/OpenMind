import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

export default function DurabilityPage() {
  return (
    <>
      <DashboardPageIntro
        title="Durability & Storage"
        description="Replication and RS(10,4) health for premium tiers. Repair queues and coverage heatmaps land when miners expose telemetry."
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">Basic tier</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">3–5 full copies · lower latency</p>
            <Progress value={88} className="h-2" />
            <p className="font-mono text-xs text-muted-foreground">Coverage 88% · sample</p>
          </CardContent>
        </Card>
        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">Premium RS(10,4)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Tolerates loss of parity shards · verifier reconstruction checks
            </p>
            <Progress value={72} className="h-2" />
            <p className="font-mono text-xs text-muted-foreground">Repairs in flight · sample</p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
