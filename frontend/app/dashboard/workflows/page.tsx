import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function WorkflowsPage() {
  return (
    <>
      <DashboardPageIntro
        title="Sessions & Workflows"
        description="Long-running agent runs with durable checkpoints. Resume from the latest step or a specific snapshot without restarting context."
      />
      <Card className="border-foreground/10 shadow-none">
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="font-display text-xl">wf-uuid-123</CardTitle>
            <CardDescription>Owner · demo@openmind.ai · Last active 2m ago</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="rounded-full border-foreground/15">
              View checkpoints
            </Button>
            <Button size="sm" className="rounded-full bg-foreground text-background hover:bg-foreground/90">
              Resume latest
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <ol className="relative ms-3 border-l border-foreground/15 pl-6 font-mono text-sm text-muted-foreground">
            {[
              "Step 5 — tool_results persisted",
              "Step 6 — decision: rejected option A",
              "Step 7 — checkpoint (state.variables.budget = 5000)",
            ].map((step, i) => (
              <li key={step} className="mb-6 last:mb-0">
                <span className="absolute -left-[7px] top-1.5 size-3 rounded-full bg-foreground/20" />
                <span className="text-[10px] uppercase tracking-widest text-foreground/50">
                  {i + 5}
                </span>
                <p className="mt-1 text-foreground/80">{step}</p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  )
}
