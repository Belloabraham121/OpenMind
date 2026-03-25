"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { dashboardAccountNav, dashboardMainNav } from "@/components/dashboard/nav"
import { cn } from "@/lib/utils"
import { Activity } from "lucide-react"

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="border-b border-sidebar-border/80">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-2 py-1.5 outline-none ring-sidebar-ring focus-visible:ring-2"
        >
          <span className="font-display text-lg tracking-tight text-sidebar-foreground">
            OpenMind
          </span>
          <span className="font-mono text-[10px] text-sidebar-foreground/60">
            AI
          </span>
        </Link>
        <p className="px-2 pb-1 text-xs text-sidebar-foreground/60">
          Memory OS dashboard
        </p>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Product</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardMainNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.href === "/dashboard"
                        ? pathname === "/dashboard"
                        : pathname === item.href ||
                          pathname.startsWith(`${item.href}/`)
                    }
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        <SidebarGroup>
          <SidebarGroupLabel>Account</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {dashboardAccountNav.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/80">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2 py-2 text-xs text-sidebar-foreground/80",
            "group-data-[collapsible=icon]:hidden",
          )}
        >
          <Activity className="size-4 shrink-0 text-sidebar-foreground" />
          <span>
            Demo UI — wire to gateway & subnet APIs when ready.
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
