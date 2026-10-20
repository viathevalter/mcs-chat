import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "@/lib/supabase/config"

export const maxDuration = 30

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
})

function formatPollPreview(msgType: string, rawText: string): string {
  const clean = (rawText || '').trim()
  const isTech = !clean || clean.startsWith('[') || clean.startsWith('http') || clean.startsWith('{"URL"')
  const t = (msgType || '').toLowerCase()
  if (t.includes('image')) return isTech ? '📷 Foto' : `📷 ${clean}`
  if (t.includes('audio') || t.includes('ptt')) return isTech ? '🎵 Áudio' : `🎵 ${clean}`
  if (t.includes('video')) return isTech ? '🎥 Vídeo' : `🎥 ${clean}`
  if (t.includes('document')) return isTech ? '📄 Documento' : `📄 ${clean}`
  if (t.includes('sticker')) return '🏷️ Figurinha'
  return clean || 'Nova mensagem'
}

export async function POST() {
  try {
    const { data: channels } = await supabase
      .from('chat_channels')
      .select('id, name, instance_name, company_name, channel_type, department_id, phone_number, api_url, instance_token, api_token, status')
      .eq('is_active', true)

    if (!channels || channels.length === 0) {
      return NextResponse.json({ success: true, updated: 0 })
    }

    let totalUpdated = 0

    await Promise.all(
      channels.map(async (ch: any) => {
        const tk = (ch.instance_token || ch.api_token || '').trim()
        const baseUrl = (ch.api_url || 'https://mcs-chat.uazapi.com').replace(/\/$/, '')
        if (!tk) return

        try {
          const res = await fetch(`${baseUrl}/chat/find`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', token: tk },
            body: JSON.stringify({
              limit: 20,
              offset: 0,
              wa_isGroup: false
            }),
            cache: 'no-store'
          })

          if (!res.ok) return
          const payload = await res.json().catch(() => ({}))
          const batch: any[] = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.chats)
            ? payload.chats
            : Array.isArray(payload?.data)
            ? payload.data
            : []

          const individuals = batch
            .map((item: any) => {
              const jid = item.wa_chatid || item.id || ''
              const cleanPhone = jid.replace(/@.*$/, '').replace(/\D/g, '')
              const rawTs = Number(item.wa_lastMsgTimestamp || 0)
              const tsMs = rawTs > 0 ? (rawTs < 1e12 ? rawTs * 1000 : rawTs) : 0
              return { item, cleanPhone, tsMs }
            })
            .filter(
              (x: any) =>
                x.cleanPhone.length >= 8 &&
                x.tsMs > 0 &&
                !x.item.wa_isGroup &&
                !(x.item.wa_chatid || '').includes('@g.us') &&
                !(x.item.wa_chatid || '').includes('broadcast')
            )

          if (individuals.length === 0) return

          const phones = individuals.map((x: any) => x.cleanPhone)
          const { data: existingConvs } = await supabase
            .from('chat_conversations')
            .select('id, contact_phone, last_message_at, last_message_text, status, unread_count')
            .eq('channel_id', ch.id)
            .in('contact_phone', phones)

          const convMap = new Map<string, any>()
          for (const ec of existingConvs || []) {
            convMap.set(ec.contact_phone, ec)
          }

          for (const { item, cleanPhone, tsMs } of individuals) {
            const existing = convMap.get(cleanPhone)
            const previewText = formatPollPreview(item.wa_lastMessageType, item.wa_lastMessageTextVote || '')

            // Determinar direção (outbound vs inbound)
            const sender = String(item.wa_lastMessageSender || '').trim()
            const chatJid = String(item.wa_chatid || '').trim()
            const chatLid = String(item.wa_chatlid || '').trim()
            const ownerPhone = String(item.owner || ch.phone_number || '').replace(/\D/g, '')
            let direction: 'inbound' | 'outbound' = 'inbound'
            if (sender) {
              if (ownerPhone && sender.includes(ownerPhone) && cleanPhone !== ownerPhone) {
                direction = 'outbound'
              } else if (sender !== chatJid && sender !== chatLid && sender.replace(/\D/g, '') !== cleanPhone) {
                direction = 'outbound'
              }
            }

            if (existing) {
              const dbTs = existing.last_message_at ? new Date(existing.last_message_at).getTime() : 0
              const isNewer = tsMs > dbTs + 2000
              const isMissingText = !existing.last_message_text && previewText

              if (isNewer || isMissingText) {
                const newIso = new Date(tsMs).toISOString()
                await supabase
                  .from('chat_conversations')
                  .update({
                    status: isNewer ? 'open' : existing.status,
                    last_message_at: isNewer ? newIso : existing.last_message_at,
                    last_message_text: previewText,
                    last_message_preview: previewText.slice(0, 140),
                    last_message_direction: direction,
                    unread_count: isNewer && direction === 'inbound'
                      ? Math.max(Number(existing.unread_count || 0) + 1, Number(item.wa_unreadCount || 1))
                      : existing.unread_count,
                    contact_avatar_url: item.imagePreview || item.image || undefined,
                    updated_at: new Date().toISOString()
                  })
                  .eq('id', existing.id)
                totalUpdated++
              }
            }
          }
        } catch {}
      })
    )

    return NextResponse.json({ success: true, updated: totalUpdated })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
