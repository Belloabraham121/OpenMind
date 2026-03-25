import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowRight } from "lucide-react"

export default function DashboardOverviewPage() {
  return (
    <>
      <DashboardPageIntro
        title="Overview"
        description="Operational snapshot of memory health, retrieval performance, and recent agent activity. Connect your gateway to replace sample metrics."
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Active sessions",
            value: "128",
            hint: "+12% vs last week",
          },
          {
            label: "Stored chunks",
            value: "842K",
            hint: "Lossless tier",
          },
          {
            label: "p95 retrieval",
            value: "612 ms",
            hint: "Target under 800 ms",
          },
          {
            label: "Success rate",
            value: "94.2%",
            hint: "Incl. RS reconstruction",
          },
        ].map((k) => (
          <Card key={k.label} className="border-foreground/10 shadow-none">
            <CardHeader className="pb-2">
              <CardDescription className="font-mono text-xs uppercase tracking-wide">
                {k.label}
              </CardDescription>
              <CardTitle className="font-display text-3xl tabular-nums">{k.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{k.hint}</CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="border-foreground/10 shadow-none lg:col-span-2">
          <CardHeader>
            <CardTitle className="font-display text-xl">Recent activity</CardTitle>
            <CardDescription>Ingest, query, checkpoint, and share events</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3 font-mono text-sm">
              {[
                "14:02  query    hybrid retrieval · session om-7f3a",
                "13:58  ingest   multimodal pdf · 12 chunks",
                "13:51  checkpoint · workflow wf-uuid-123 step 7",
                "13:44  provenance diff · version a9f2… → b01c…",
              ].map((line) => (
                <li
                  key={line}
                  className="border-b border-border/60 pb-3 last:border-0 last:pb-0 text-muted-foreground"
                >
                  {line}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-foreground/10 shadow-none">
          <CardHeader>
            <CardTitle className="font-display text-xl">Quick actions</CardTitle>
            <CardDescription>MVP dashboard tabs from your IA doc</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" className="justify-between rounded-full border-foreground/15" asChild>
              <Link href="/dashboard/explorer">
                Memory Explorer
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between rounded-full border-foreground/15" asChild>
              <Link href="/dashboard/workflows">
                Sessions &amp; Workflows
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between rounded-full border-foreground/15" asChild>
              <Link href="/dashboard/api">
                API &amp; MCP
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
