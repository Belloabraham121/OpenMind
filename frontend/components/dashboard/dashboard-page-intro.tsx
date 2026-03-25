import { Badge } from "@/components/ui/badge"

type DashboardPageIntroProps = {
  title: string
  description: string
  badge?: string
}

export function DashboardPageIntro({
  title,
  description,
  badge = "Sample data",
}: DashboardPageIntroProps) {
  return (
    <div className="mb-8 max-w-3xl">
      <Badge
        variant="outline"
        className="mb-4 rounded-full border-foreground/20 font-mono text-[10px] uppercase tracking-wider"
      >
        {badge}
      </Badge>
      <h1 className="font-display text-3xl tracking-tight md:text-4xl">{title}</h1>
      <p className="mt-3 text-lg leading-relaxed text-muted-foreground">{description}</p>
    </div>
  )
}
