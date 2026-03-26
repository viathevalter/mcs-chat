import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { randomUUID } from 'crypto'

export async function POST(req: Request) {
  try {
    const { content, targetType } = await req.json()
    if (!content) {
      return NextResponse.json({ error: 'Falta o conteudo da mensagem' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Query target workers - Note: For MVP 'all' fetches first 100 for safety instead of true bulk
    let query = supabase.schema('core_personal').from('workers').select('id, movil').not('movil', 'is', null)

    // Example handling of filters if implemented (targetType logic)
    // if (targetType === 'company') query = query.eq('empresa_id', ...)
    
    // Safety limit to prevent MVP overload
    query = query.limit(100)

    const { data: workers, error: wrkError } = await query

    if (wrkError) throw wrkError
    if (!workers || workers.length === 0) {
       return NextResponse.json({ error: 'Nenhum trabalhador com telefone válido encontrado.' }, { status: 404 })
    }

    const batchId = randomUUID()
    const now = new Date()

    const scheduledObjects = workers.map((worker: any, index: number) => {
       // Spread dispatch times by 10 seconds to avoid WhatsApp ban
       const dispatchTime = new Date(now.getTime() + (index * 10000))
       return {
         target_worker_id: worker.id,
         content: content,
         scheduled_for: dispatchTime.toISOString(),
         status: 'pending',
         batch_id: batchId
       }
    })

    const { error: insertError } = await supabase
      .from('chat_scheduled_messages')
      .insert(scheduledObjects)

    if (insertError) throw insertError

    return NextResponse.json({ success: true, count: scheduledObjects.length, batchId })

  } catch (err: any) {
    console.error('Campaign Error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
