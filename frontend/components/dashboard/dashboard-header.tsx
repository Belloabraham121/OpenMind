"use client"

import { useRouter } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { dashboardAccountNav, dashboardMainNav } from "@/components/dashboard/nav"
import { ChevronRight, LogOut } from "lucide-react"
import Link from "next/link"

const titleByPath: Record<string, string> = [...dashboardMainNav, ...dashboardAccountNav].reduce(
  (acc, item) => {
    acc[item.href] = item.title
    return acc
  },
  {} as Record<string, string>,
)

function resolveTitle(pathname: string): string {
  if (titleByPath[pathname]) return titleByPath[pathname]
  const match = [...dashboardMainNav, ...dashboardAccountNav]
    .filter((item) => item.href !== "/dashboard")
    .find((item) => pathname.startsWith(item.href))
  return match?.title ?? "Dashboard"
}

type DashboardHeaderProps = {
  pathname: string
}

export function DashboardHeader({ pathname }: DashboardHeaderProps) {
  const router = useRouter()
  const title = resolveTitle(pathname)

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" })
    router.push("/login")
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/80 bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="-ml-1 rounded-full" />
      <Separator orientation="vertical" className="mr-2 h-6" />
      <Breadcrumb className="hidden flex-1 md:flex">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/dashboard" className="font-mono text-xs text-muted-foreground">
                OpenMind
              </Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="size-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage className="font-medium">{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex flex-1 items-center md:hidden">
        <span className="font-display text-lg tracking-tight">{title}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="hidden rounded-full border-foreground/15 font-mono text-xs md:inline-flex"
        asChild
      >
        <Link href="/">Marketing site</Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label="Account menu"
          >
            <Avatar className="size-8 border border-border">
              <AvatarFallback className="bg-foreground/5 font-mono text-xs">
                OM
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <span className="text-xs text-muted-foreground">Signed in (demo)</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={logout} className="gap-2 text-destructive">
            <LogOut className="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
