"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, Shield, Building2, Key, MessageCircle, Activity } from 'lucide-react'

const sidebarNavItems = [
  {
    title: "Membros da Equipe",
    href: "/inbox/admin/users",
    icon: Users,
  },
  {
    title: "Departamentos",
    href: "/inbox/admin/departments",
    icon: Building2,
  },
  {
    title: "Cargos e Acessos",
    href: "/inbox/admin/roles",
    icon: Shield,
  },
  {
    title: "Canais de Atendimento",
    href: "/inbox/admin/channels",
    icon: MessageCircle,
  },
  {
    title: "Gateways e Chaves",
    href: "/inbox/admin/integrations",
    icon: Key,
  },
  {
    title: "Registro de Auditoria",
    href: "/inbox/admin/audit",
    icon: Activity,
  },
]

export function AdminNav() {
  const pathname = usePathname()

  return (
    <nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1.5">
      {sidebarNavItems.map((item) => {
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
            {item.title}
         </Link>
         )
      })}
    </nav>
  )
}
