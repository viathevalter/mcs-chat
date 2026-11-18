import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi, classifyWhatsAppSendError } from '@/lib/whatsapp/evolution-api'

function normalizePhoneForCheck(rawPhone?: string | null): string {
  if (!rawPhone) return ''
  const firstSegment = String(rawPhone).split(/[\/;,]| - |\*\*\*/)[0] || ''
  const trimmed = firstSegment.trim()
  const hasExplicitCountryCode = trimmed.startsWith('+') || trimmed.startsWith('00')
  let clean = trimmed.replace(/\D/g, '')
  if (!clean) return ''
  if (clean.startsWith('00')) clean = clean.replace(/^00+/, '')
  if (hasExplicitCountryCode) return clean
  if (clean.length === 9 && (clean.startsWith('6') || clean.startsWith('7'))) return '34' + clean
  if (clean.length === 9 && clean.startsWith('9')) return '351' + clean
  if (clean.length === 10 && clean.startsWith('3')) return '57' + clean
  return clean
}

export async function POST(request: Request) {
  try {
    const { phone, channelId, conversationId, fastCheck = false, alternatePhones = [] } = await request.json()

    const normalizedPhone = normalizePhoneForCheck(phone)
    if (!normalizedPhone) {
      return NextResponse.json({ error: 'Missing phone' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get channel (or fallback to any connected channel if channelId is missing)
    let channel: any = null
    if (channelId) {
      const { data: found } = await supabase
        .from('chat_channels')
        .select('*')
        .eq('id', channelId)
        .maybeSingle()
      if (found) channel = found
    }

    if (!channel) {
      const { data: fallbackCh } = await supabase
        .from('chat_channels')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle()
      channel = fallbackCh
    }

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found or inactive' }, { status: 404 })
    }

    const instanceName = channel.instance_name || channel.name
    const apiUrl = channel.api_url || 'https://mcs-chat.uazapi.com'
    const apiToken = channel.instance_token || channel.api_token
    const provider = channel.provider || 'uazapi'

    // Call evolutionApi to check the number
    let result = await evolutionApi.checkNumber({
      number: normalizedPhone,
      instanceName,
      apiUrl,
      apiToken,
      provider,
      fastCheck: Boolean(fastCheck)
    })

    // Brazilian 9th digit fallback logic
    if (!result.exists && normalizedPhone.startsWith('55')) {
      let altPhone = null
      if (normalizedPhone.length === 12) {
        altPhone = normalizedPhone.slice(0, 4) + '9' + normalizedPhone.slice(4)
      } else if (normalizedPhone.length === 13 && normalizedPhone[4] === '9') {
        altPhone = normalizedPhone.slice(0, 4) + normalizedPhone.slice(5)
      }

      if (altPhone) {
        const altResult = await evolutionApi.checkNumber({
          number: altPhone,
          instanceName,
          apiUrl,
          apiToken,
          provider,
          fastCheck: Boolean(fastCheck)
        })
        if (altResult.exists) {
          result = altResult
        }
      }
    }

    // Check alternate phones (e.g. telefones_adicionais / secondary worker numbers) if provided
    const validAlternates: Array<{ phone: string; displayName?: string }> = []
    if (!result.exists && Array.isArray(alternatePhones) && alternatePhones.length > 0) {
      const uniqueAlts = Array.from(
        new Set(
          alternatePhones
            .map((p: string) => normalizePhoneForCheck(p))
            .filter((p: string) => p.length >= 8 && p !== normalizedPhone && p.slice(-8) !== normalizedPhone.slice(-8))
        )
      )
      for (const altP of uniqueAlts.slice(0, 4)) {
        const altRes = await evolutionApi.checkNumber({
          number: altP,
          instanceName,
          apiUrl,
          apiToken,
          provider,
          fastCheck: true
        })
        if (altRes.exists) {
          validAlternates.push({
            phone: altRes.formattedNumber || altP,
            displayName: altRes.displayName
          })
        }
      }
    }

    const classification = !result.exists
      ? classifyWhatsAppSendError(result.rawError || 'is not on WhatsApp', normalizedPhone)
      : null

    // Se o número tem WhatsApp ativo e uma conversa foi informada, limpar qualquer erro antigo travado nela
    let clearedStaleErrors = false
    if (result.exists && conversationId) {
      try {
        const { data: failedRows } = await supabase
          .from('chat_messages')
          .select('id, status, translations')
          .eq('conversation_id', conversationId)
          .or('status.eq.failed,status.eq.error')

        if (failedRows && failedRows.length > 0) {
          for (const row of failedRows) {
            const nextTrans = { ...(row.translations || {}) }
            delete nextTrans._error_code
            delete nextTrans._error_pt
            delete nextTrans._error_es
            delete nextTrans._error_badge_pt
            delete nextTrans._error_badge_es
            delete nextTrans._error_phone
            delete nextTrans._error_alt_phones
            await supabase
              .from('chat_messages')
              .update({ status: 'sent', translations: nextTrans })
              .eq('id', row.id)
          }
          clearedStaleErrors = true
        }

        const { data: convRow } = await supabase
          .from('chat_conversations')
          .select('id, last_message_text, last_message_preview')
          .eq('id', conversationId)
          .maybeSingle()

        if (
          convRow &&
          (/^(🚫|⚠️|❌)/.test(convRow.last_message_text || '') ||
            /^(🚫|⚠️|❌)/.test(convRow.last_message_preview || ''))
        ) {
          const cleanText = String(convRow.last_message_text || '').replace(/^(🚫|⚠️|❌)[^:]+:\s*/, '')
          const cleanPrev = String(convRow.last_message_preview || '').replace(/^(🚫|⚠️|❌)[^:]+:\s*/, '')
          await supabase
            .from('chat_conversations')
            .update({
              last_message_text: cleanText,
              last_message_preview: cleanPrev
            })
            .eq('id', conversationId)
          clearedStaleErrors = true
        }
      } catch {}
    }

    return NextResponse.json({
      ...result,
      checkedPhone: normalizedPhone,
      validAlternates,
      clearedStaleErrors,
      ...(classification ? { classification } : {})
    })
  } catch (error: any) {
    console.error('Error checking number:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
