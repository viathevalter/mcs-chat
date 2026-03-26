import { redirect } from 'next/navigation'

export default function AdminIndexPage() {
  redirect('/inbox/admin/channels')
}
