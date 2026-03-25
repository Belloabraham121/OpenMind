import { DashboardPageIntro } from "@/components/dashboard/dashboard-page-intro"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function MultimodalPage() {
  return (
    <>
      <DashboardPageIntro
        title="Multimodal Library"
        description="Images and PDFs with OCR text, visual embeddings, and source-to-chunk mapping. Pipeline status becomes observable here."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { name: "brief.pdf", status: "Indexed", meta: "OCR + CLIP · 12 chunks" },
          { name: "diagram.png", status: "Processing", meta: "Visual hash pending" },
          { name: "scan-02.pdf", status: "Queued", meta: "Layout-aware ingest" },
        ].map((f) => (
          <Card key={f.name} className="border-foreground/10 shadow-none">
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="font-mono text-sm">{f.name}</CardTitle>
                <Badge variant="secondary" className="rounded-full font-mono text-[10px]">
                  {f.status}
                </Badge>
              </div>
              <CardDescription>{f.meta}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </>
  )
}
