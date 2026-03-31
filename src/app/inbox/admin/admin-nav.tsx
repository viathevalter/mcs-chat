"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, Shield, Building2, Key, MessageCircle, Activity, Zap } from 'lucide-react'

const sidebarNavItemsKeys = [
  {
    translationKey: 'teamMembers',
    href: "/inbox/admin/users",
    icon: Users,
  },
  {
    translationKey: 'departments',
    href: "/inbox/admin/departments",
    icon: Building2,
  },
  {
    translationKey: 'roles',
    href: "/inbox/admin/roles",
    icon: Shield,
  },
  {
    translationKey: 'quickReplies',
    href: "/inbox/admin/quick-replies",
    icon: Zap,
  },
  {
    translationKey: 'channels',
    href: "/inbox/admin/channels",
    icon: MessageCircle,
  },
  {
    translationKey: 'integrations',
    href: "/inbox/admin/integrations",
    icon: Key,
  },
  {
    translationKey: 'audit',
    href: "/inbox/admin/audit",
    icon: Activity,
  },
]

import { useI18n } from "@/contexts/i18n-context"

export function AdminNav() {
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1.5">
      {sidebarNavItemsKeys.map((item) => {
         const Icon = item.icon
         const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
         return (
         <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
               isActive
               ? "bg-emerald-50 text-emerald-700 font-bold"
               : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
         >
            <Icon className="h-4 w-4" />
            {t('admin', item.translationKey as any)}
         </Link>
         )
      })}
    </nav>
  )
}
