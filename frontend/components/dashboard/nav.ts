import type { LucideIcon } from "lucide-react"
import {
  Activity,
  Code2,
  CreditCard,
  ImageIcon,
  LayoutDashboard,
  Network,
  Search,
  Settings,
  Share2,
  Shield,
  History,
  GitBranch,
} from "lucide-react"

export type DashboardNavItem = {
  title: string
  href: string
  icon: LucideIcon
}

export const dashboardMainNav: DashboardNavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { title: "Memory Explorer", href: "/dashboard/explorer", icon: Search },
  { title: "Sessions & Workflows", href: "/dashboard/workflows", icon: GitBranch },
  { title: "Provenance", href: "/dashboard/provenance", icon: History },
  { title: "Shared Spaces", href: "/dashboard/shared", icon: Share2 },
  { title: "Multimodal", href: "/dashboard/multimodal", icon: ImageIcon },
  { title: "Durability", href: "/dashboard/durability", icon: Shield },
  { title: "Network Quality", href: "/dashboard/network", icon: Network },
  { title: "API & MCP", href: "/dashboard/api", icon: Code2 },
]

export const dashboardAccountNav: DashboardNavItem[] = [
  { title: "Billing", href: "/dashboard/billing", icon: CreditCard },
  { title: "Settings", href: "/dashboard/settings", icon: Settings },
]
