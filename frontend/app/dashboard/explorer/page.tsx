import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Search } from "lucide-react"

export default function MemoryExplorerPage() {
  return (
    <>
      <DashboardPageIntro
        title="Memory Explorer"
        description="Semantic and graph-aware search across encrypted shards. Filters for session, modality, tier, and time range ship next."
      />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Ask across your agent memory…"
            className="h-11 rounded-full border-foreground/15 pl-10"
          />
        </div>
        <Button className="h-11 rounded-full bg-foreground text-background hover:bg-foreground/90">
          Search
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          {
            title: "Chunk om-91b · score 0.94",
            body: "“Budget approved for vendor B after RS durability check passed…” — with graph path vendor → decision → checkpoint.",
          },
          {
            title: "Chunk om-90a · score 0.89",
            body: "OCR + visual embedding from uploaded brief.pdf, page 3. Linked to workflow wf-uuid-123.",
          },
        ].map((c) => (
          <Card key={c.title} className="border-foreground/10 shadow-none">
            <CardHeader>
              <CardTitle className="font-mono text-sm font-normal text-foreground">{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground leading-relaxed">{c.body}</CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
