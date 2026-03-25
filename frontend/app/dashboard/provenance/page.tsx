import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ProvenancePage() {
  return (
    <>
      <DashboardPageIntro
        title="Provenance & Time Travel"
        description="Reconstruct memory at a timestamp or version hash, diff against a baseline, and export audit trails for compliance."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="as-of" className="font-mono text-xs uppercase tracking-wide">
            as_of_timestamp
          </Label>
          <Input
            id="as-of"
            defaultValue="2026-03-16T11:42:00Z"
            className="rounded-lg border-foreground/15 font-mono text-sm"
          />
        </div>
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="version" className="font-mono text-xs uppercase tracking-wide">
            version_id
          </Label>
          <Input
            id="version"
            placeholder="a9f2c1…"
            className="rounded-lg border-foreground/15 font-mono text-sm"
          />
        </div>
        <div className="flex items-end md:col-span-1">
          <Button className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90">
            Reconstruct view
          </Button>
        </div>
      </div>
      <Card className="border-foreground/10 shadow-none">
        <CardHeader>
          <CardTitle className="font-display text-xl">Version diff (sample)</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg border border-foreground/10 bg-muted/30 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
            {`+ chunk: vendor_shortlist_v2
~ chunk: budget_state (scope: workflow wf-uuid-123)
- chunk: draft_email_unsent
provenance_path: root → … → b01c4e`}
          </pre>
        </CardContent>
      </Card>
    </>
  )
}
