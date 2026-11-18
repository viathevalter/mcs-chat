import { NextResponse } from 'next/server'
import { processDueScheduledMessages } from '@/app/api/chat/campaign/route'
import { createAdminClient } from '@/lib/supabase/admin'
import { runAuditForChannelOrAll } from '@/app/api/chat/daily-summary/route'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function checkAndRunDailyMidnightAudit(forceDate?: string) {
  try {
    const supabase = createAdminClient()
    const { data: globalCfg } = await supabase
      .from('chat_audit_configs')
      .select('*')
      .is('channel_id', null)
      .maybeSingle()

    if (globalCfg && globalCfg.enabled === false) {
      return { skipped: true, reason: 'Daily audit disabled in config' }
    }

    // Por padrão, à meia-noite audita as conversas do dia que acabou de fechar (ontem)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const targetDate = forceDate || yesterday

    // Verifica se já rodou o consolidado de targetDate
    const { data: existing } = await supabase
      .from('chat_daily_summaries')
      .select('id, status')
      .eq('summary_date', targetDate)
      .eq('status', 'completed')
      .limit(1)

    if (existing && existing.length > 0 && !forceDate) {
      return { skipped: true, date: targetDate, reason: 'Already audited for date' }
    }

    const { data: activeChannels } = await supabase
      .from('chat_channels')
      .select('id, name, display_label, company_name, channel_type')
      .eq('is_active', true)

    let auditedCount = 0
    for (const ch of activeChannels || []) {
      const res = await runAuditForChannelOrAll({
        supabase,
        targetDate,
        channelId: ch.id,
        force: false,
        createTask: Boolean(globalCfg?.auto_create_tasks ?? true),
      })
      if (!res.empty) auditedCount++
    }

    await runAuditForChannelOrAll({
      supabase,
      targetDate,
      channelId: null,
      force: false,
      createTask: false,
    })

    return { executed: true, date: targetDate, auditedChannels: auditedCount }
  } catch (err: any) {
    console.error('[MidnightAudit] Error:', err?.message || err)
    return { executed: false, error: err?.message }
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const runAudit = url.searchParams.get('audit') === '1'
    const forceDate = url.searchParams.get('date') || undefined
    const scheduleResult = await processDueScheduledMessages(10)
    const auditResult = await checkAndRunDailyMidnightAudit(runAudit ? forceDate : undefined)
    return NextResponse.json({ success: true, ...scheduleResult, audit: auditResult })
  } catch (error: any) {
    console.error('Cron Execution Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const scheduleResult = await processDueScheduledMessages(10)
    const auditResult = await checkAndRunDailyMidnightAudit(body?.date)
    return NextResponse.json({ success: true, ...scheduleResult, audit: auditResult })
  } catch (error: any) {
    console.error('Cron Execution Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
