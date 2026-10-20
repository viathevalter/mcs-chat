import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evolutionApi } from '@/lib/whatsapp/evolution-api'

export const maxDuration = 60 // Extending timeout for Whisper STT and Media Uploads
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: Request, { params }: { params: Promise<{ slug?: string[] }> }) {
  try {
    const rawBody = await req.text()
    const body = JSON.parse(rawBody)
    const { slug } = await params
    
    const eventType = body.event || body.EventType
    if (!eventType) {
      return NextResponse.json({ success: true, message: 'No event type' })
    }

    const supabase = createAdminClient()

    // Process New Messages (Ingestion)
    if (eventType === 'messages.upsert' || eventType === 'messages.update' || eventType === 'messages') {
      const isUaz = !!body.EventType
      const messageData = isUaz ? body.message : body.data
      const instanceName = body.instance || body.instanceName || body.sender

      if (!messageData) {
        return NextResponse.json({ success: true, message: 'Invalid payload structure' })
      }

      // 1. Find the active channel
      const cleanInst = (instanceName || '').trim()
      const { data: channels, error: channelError } = await supabase
        .from('chat_channels')
        .select('*')
        .or(`name.ilike.${cleanInst},instance_name.ilike.${cleanInst}`)
        .eq('is_active', true)
        .limit(1)

      const channel = channels?.[0]

      if (!channel || channelError) {
        console.warn(`[Webhook] Channel ${instanceName} not found or inactive.`)
        return NextResponse.json({ success: true, message: 'Channel not configured' })
      }

      // 1.1 Auto-capture UazAPI instance token, BaseUrl, owner phone, and status = 'connected'
      const webhookToken = body.token || body.instance?.token || null
      const webhookBaseUrl = (body.BaseUrl || body.baseUrl || channel.api_url || 'https://mcs-chat.uazapi.com').replace(/\/$/, '')
      const webhookOwnerPhone = body.owner ? String(body.owner).replace(/\D/g, '') : null
      if (
        channel.status !== 'connected' ||
        (webhookToken && channel.api_token !== webhookToken) ||
        (webhookOwnerPhone && !channel.phone_number)
      ) {
        await supabase
          .from('chat_channels')
          .update({
            status: 'connected',
            instance_name: cleanInst || channel.instance_name || channel.name,
            api_url: webhookBaseUrl,
            api_token: webhookToken || channel.api_token,
            instance_token: webhookToken || channel.instance_token,
            phone_number: webhookOwnerPhone || channel.phone_number,
            updated_at: new Date().toISOString()
          })
          .eq('id', channel.id)

        channel.api_token = webhookToken || channel.api_token
        channel.instance_token = webhookToken || channel.instance_token
        channel.api_url = webhookBaseUrl
      }

      // Extract Sender Info universally
      let uazSender = null;
      if (body.chat?.wa_chatid) uazSender = body.chat.wa_chatid
      if (!uazSender) uazSender = messageData?.key?.participant || messageData?.key?.remoteJID || messageData?.sender || messageData?.chatid
      
      const remoteJid = isUaz ? uazSender : messageData?.key?.remoteJid
      const isFromMe = isUaz ? (messageData?.fromMe || messageData?.key?.fromMe) : messageData?.key?.fromMe
      const externalId = isUaz ? messageData?.id : messageData?.key?.id
      
      // Evolution PushName fallback to UAZ Chat Name
      const senderName = isUaz ? (body.chat?.name || body.chat?.wa_name || 'Desconhecido') : (body.pushName || 'Desconhecido')

      if (!remoteJid || remoteJid.includes('@g.us') || remoteJid === 'status@broadcast') {
        return NextResponse.json({ success: true, message: 'Ignored group or status' })
      }

      const phone = remoteJid.replace(/@.*$/, '').replace(/\D/g, '')

      // 2. Extract Data & Handle Media (UAZ & Evolution)
      let textContent = ''
      let mediaUrl = null
      let messageTypeDb = 'text'
      let mediaTranscription = null

      if (isUaz) {
         const chatLastMsgType = body?.chat?.wa_lastMessageType || ''
         const msgType = messageData?.messageType || messageData?.mediaType || chatLastMsgType || ''
         const mimeType = messageData?.content?.mimetype || ''

         const isAudio = msgType.toLowerCase().includes('audio') || msgType === 'ptt' || mimeType.includes('audio')
         const isImage = msgType.toLowerCase().includes('image') || mimeType.includes('image')
         const isVideo = msgType.toLowerCase().includes('video') || mimeType.includes('video')
         const isDocument = msgType.toLowerCase().includes('document') || mimeType.includes('pdf')

         if (isAudio) messageTypeDb = 'audio'
         else if (isImage) messageTypeDb = 'image'
         else if (isVideo) messageTypeDb = 'video'
         else if (isDocument) messageTypeDb = 'document'
         else if (msgType) messageTypeDb = msgType

         if (typeof messageData?.content === 'string') {
            textContent = messageData.content
         } else if (typeof messageData?.content === 'object' && messageData.content !== null) {
            textContent = messageData.content.text || messageData.content.caption || messageData.message?.conversation || '[Mídia UAZ]'
         } else {
            textContent = messageData?.text || '[Formato Complexo]'
         }

         // UAZ Media Download process implementation
         if ((isAudio || isImage || isVideo || isDocument) && channel.provider === 'uazapi' && channel.api_url && channel.api_token) {
            const API_URL = channel.api_url
            const ADMIN_TOKEN = channel.api_token
            let pureId = messageData?.id || ''
            if (pureId.includes(':')) pureId = pureId.split(':')[1]

            try {
               const downloadReq = await fetch(`${API_URL}/message/download`, {
                  method: "POST",
                  headers: { "token": ADMIN_TOKEN, "Content-Type": "application/json" },
                  body: JSON.stringify({ id: pureId, return_base64: true, return_link: true, ...(isAudio ? { generate_mp3: true } : {}) })
               })

               if (downloadReq.ok) {
                  const downloadRes = await downloadReq.json()
                  const finalBase64 = downloadRes.base64 || downloadRes.base64Data || downloadRes.data
                  let resolvedUrl = downloadRes.url || downloadRes.link || null

                  if (!resolvedUrl && finalBase64) {
                     let finalMime = mimeType || 'application/octet-stream'
                     if (isAudio) finalMime = 'audio/mp3'
                     else if (isImage) finalMime = 'image/jpeg'
                     try {
                         const ext = finalMime.split('/')[1] || 'bin'
                         const cleanB64 = finalBase64.replace(/\s/g, '')
                         const buffer = Buffer.from(cleanB64, 'base64')
                         const filename = `m${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`
                         
                         const { error: uploadErr } = await supabase.storage
                           .from('chat-media')
                           .upload(filename, buffer, { contentType: finalMime, upsert: true })
                         
                         if (!uploadErr) {
                           const { data: publicUrlData } = supabase.storage.from('chat-media').getPublicUrl(filename)
                           resolvedUrl = publicUrlData.publicUrl
                         } else {
                           resolvedUrl = `data:${finalMime};base64,${cleanB64}`
                         }
                     } catch (uploadCrash) {
                         resolvedUrl = `data:${finalMime};base64,${finalBase64.replace(/\s/g, '')}`
                     }
                     
                     if (isAudio && process.env.OPENAI_API_KEY) {
                         const audioBuffer = Buffer.from(finalBase64.replace(/\s/g, ''), 'base64')
                         const blob = new Blob([audioBuffer], { type: 'audio/mp3' })
                         const formData = new FormData()
                         formData.append('file', blob, 'audio.mp3')
                         formData.append('model', 'whisper-1')

                         const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                            body: formData
                         })
                         if (whisperRes.ok) {
                            const wJson = await whisperRes.json()
                            mediaTranscription = wJson.text
                         }
                      }
                   }
                   mediaUrl = resolvedUrl
               }
            } catch(e) {
               console.error("Failed to download media for UAZ:", e)
            }
         }
      } else {
         const msgType = messageData?.messageType
         if (msgType === 'conversation') {
            textContent = messageData?.message?.conversation || ''
         } else if (msgType === 'extendedTextMessage') {
            textContent = messageData?.message?.extendedTextMessage?.text || ''
         } else if (['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'ptvMessage'].includes(msgType)) {
            const msgBlock = messageData?.message?.[msgType]
            textContent = msgBlock?.caption || `[Mídia: ${msgType}]`
            messageTypeDb = msgType.replace('Message', '')
            if (messageData.message?.base64) {
               mediaUrl = messageData.message.base64
            }
         } else {
            textContent = `[Sistema: ${msgType}]`
         }
      }

      // Check Duplicate
      const { data: existingMsg } = await supabase
         .from('chat_messages')
         .select('id')
         .eq('external_id', externalId)
         .single()

      if (existingMsg) {
         return NextResponse.json({ success: true, message: 'Duplicate ignored' })
      }

      // 3. Find/Create Worker & Conversation using smart phone matching RPC
      let matchedWorker: any = null
      try {
        const { data: matchData } = await supabase.rpc('match_worker_by_phone', {
          p_raw_phone: phone,
          p_company_name: channel.company_name || null
        })
        if (matchData && matchData.matched) {
          matchedWorker = matchData
        }
      } catch (e) {}

      const defaultContactType = matchedWorker?.id
        ? 'worker'
        : channel.channel_type === 'clients'
        ? 'client'
        : channel.channel_type === 'general'
        ? 'general'
        : 'worker'

      let { data: conversation } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('channel_id', channel.id)
        .eq('contact_phone', phone)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      let newlyFetchedAvatar: string | undefined = undefined;

      if (!conversation) {
         try {
           const fetchedUrl = await evolutionApi.fetchProfilePictureUrl({
             number: remoteJid,
             instanceName: channel.name,
             apiUrl: channel.api_url,
             apiToken: channel.api_token,
             provider: channel.provider
           });
           if (fetchedUrl) newlyFetchedAvatar = fetchedUrl;
         } catch(e) {}

         const { data: newConv, error: convError } = await supabase
           .from('chat_conversations')
           .insert({
             channel_id: channel.id,
             contact_phone: phone,
             contact_name: matchedWorker?.nome || senderName,
             contact_type: defaultContactType,
             contact_avatar_url: newlyFetchedAvatar || null,
             worker_id: matchedWorker?.id || null,
             worker_company_name: matchedWorker?.contratante || channel.company_name || null,
             worker_client_name: matchedWorker?.cliente || null,
             worker_function_name: matchedWorker?.funcion || null,
             department_id: channel.department_id || null,
             last_message_preview: (mediaTranscription || textContent || '').slice(0, 140),
             status: 'open'
           })
           .select()
           .single()
         
         if (convError) throw convError
         conversation = newConv
      } else {
         if (matchedWorker?.id && (!conversation.worker_id || conversation.contact_name === 'Desconhecido')) {
           await supabase
             .from('chat_conversations')
             .update({
               worker_id: matchedWorker.id,
               contact_name: matchedWorker.nome || conversation.contact_name,
               contact_type: 'worker',
               worker_company_name: matchedWorker.contratante || channel.company_name || null,
               worker_client_name: matchedWorker.cliente || null,
               worker_function_name: matchedWorker.funcion || null
             })
             .eq('id', conversation.id)
         }

         if (!conversation.contact_avatar_url) {
            try {
              const fetchedUrl = await evolutionApi.fetchProfilePictureUrl({
                number: remoteJid,
                instanceName: channel.name,
                apiUrl: channel.api_url,
                apiToken: channel.api_token,
                provider: channel.provider
              });
              if (fetchedUrl) {
                newlyFetchedAvatar = fetchedUrl;
                conversation.contact_avatar_url = fetchedUrl;
              }
            } catch(e) {}
         }
      }

      if (conversation) {
         if (isFromMe && eventType !== 'messages.update') {
            const { data: recentCrmMsg } = await supabase
              .from('chat_messages')
              .select('id')
              .eq('conversation_id', conversation.id)
              .eq('direction', 'outbound')
              .is('external_id', null)
              .gte('created_at', new Date(Date.now() - 120000).toISOString())
              .order('created_at', { ascending: false })
              .limit(1)
              .single()

            if (recentCrmMsg) {
               await supabase.from('chat_messages').update({
                  external_id: externalId,
                  status: 'delivered'
               }).eq('id', recentCrmMsg.id)

               await supabase.from('chat_conversations').update({
                 last_message_at: new Date().toISOString()
               }).eq('id', conversation.id)

               return NextResponse.json({ success: true, message: 'Updated CRM echo message' })
            }
         }

         const finalContentToInsert = mediaTranscription ? mediaTranscription : textContent;

         const { error: msgErr } = await supabase.from('chat_messages').insert({
           conversation_id: conversation.id,
           external_id: externalId,
           direction: isFromMe ? 'outbound' : 'inbound',
           content: finalContentToInsert,
           message_type: messageTypeDb,
           sender_name: isFromMe ? 'Sistema' : (matchedWorker?.nome || senderName),
           media_url: mediaUrl,
           status: 'delivered'
         })
         
         if (msgErr && msgErr.code !== '23505') {
            console.error('[Webhook ERROR] Error inserting message:', msgErr)
         }

         const updateConversationPayload: any = {
           last_message_preview: (finalContentToInsert || '').slice(0, 140)
         };
         if (newlyFetchedAvatar) updateConversationPayload.contact_avatar_url = newlyFetchedAvatar;

         if (conversation.status === 'closed' && !isFromMe) {
           updateConversationPayload.status = 'open';
           updateConversationPayload.assigned_to = null;
         }

         if (!isFromMe) {
           updateConversationPayload.unread_count = (conversation.unread_count || 0) + 1;
           updateConversationPayload.last_message_at = new Date().toISOString();
           await supabase.from('chat_conversations').update(updateConversationPayload).eq('id', conversation.id)
         } else {
           updateConversationPayload.last_message_at = new Date().toISOString();
           await supabase.from('chat_conversations').update(updateConversationPayload).eq('id', conversation.id)
         }
      }

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ success: true, message: 'Event ignored' })
  } catch (err: any) {
    console.error('[Universal Webhook] Critical Error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
