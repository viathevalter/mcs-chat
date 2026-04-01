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
      const { data: channels, error: channelError } = await supabase
        .from('chat_channels')
        .select('*')
        .ilike('name', instanceName.trim())
        .eq('is_active', true)
        .limit(1)

      const channel = channels?.[0]

      if (!channel || channelError) {
        // [DEBUG LOG INJECTION] Validate the true identity of the running key
        const srKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
        console.warn(`[DEBUG AUDIT] SR Key loaded in Vercel ends in: ...${srKey.slice(-15)}`)

        const { data: all } = await supabase.from('chat_channels').select('*')
        console.warn(`[Webhook DEBUG] Total channels in DB visible to service_role:`, all?.length)
        if (all && all.length > 0) {
           console.warn(`[Webhook DEBUG] First 3 channels found in DB:`, all.slice(0, 3).map(c => ({ id: c.id, name: c.name, is_active: c.is_active })))
        }
        
        console.warn(`[Webhook] Channel ${instanceName} not found or inactive.`)
        return NextResponse.json({ success: true, message: 'Channel not configured' })
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

      // Prevent processing Echo messages if we just sent them ourselves via CRM
      if (isFromMe && eventType !== 'messages.update') {
         // return NextResponse.json({ success: true, message: 'Ignored fromMe' }) 
         // For now we allow fromMe to sync messages sent natively from WhatsApp Web
      }

      const phone = remoteJid.replace(/@.*$/, '')

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

         // Fallbacks
         if (typeof messageData?.content === 'string') {
            textContent = messageData.content
         } else if (typeof messageData?.content === 'object' && messageData.content !== null) {
            textContent = messageData.content.text || messageData.content.caption || messageData.message?.conversation || '[Mídia UAZ]'
         } else {
            textContent = '[Formato Complexo]'
         }

         // UAZ Media Download process implementation
         if ((isAudio || isImage || isVideo || isDocument) && channel.provider === 'uazapi' && channel.api_url && channel.api_token) {
            const API_URL = channel.api_url
            const ADMIN_TOKEN = channel.api_token
            let pureId = messageData?.id || ''
            if (pureId.includes(':')) pureId = pureId.split(':')[1]

            // As the user inserted the Instance Token directly into api_token, we skip fetching /instance/all
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

                  // If UAZ returns base64, we can upload it to Supabase Storage
                        if (!resolvedUrl && finalBase64) {
                           let finalMime = mimeType || 'application/octet-stream'
                           if (isAudio) finalMime = 'audio/mp3'
                           else if (isImage) finalMime = 'image/jpeg'
                           // Upload to Supabase Storage to prevent massive DB bloat which breaks Realtime
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
                                 resolvedUrl = `data:${finalMime};base64,${cleanB64}` // fallback
                               }
                           } catch (uploadCrash) {
                               resolvedUrl = `data:${finalMime};base64,${finalBase64.replace(/\s/g, '')}`
                           }
                           
                           // PROTOTYPE TRANSCRIPTION (Phase 8) - OpenAI Whisper
                           if (isAudio && process.env.OPENAI_API_KEY) {
                               const audioBuffer = Buffer.from(finalBase64.replace(/\\s/g, ''), 'base64')
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
         // EVOLUTION API Base handler
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

      // 3. Find/Create Worker & Conversation
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
         // Attempt to find worker by phone (very basic matching)
         let worker = null
         try {
            const { data: workers } = await supabase
              .schema('core_personal')
              .from('workers')
              .select('id, nome, cpf, rg')
              .or(`movil.ilike.%${phone.substring(2)}%,telefono2.ilike.%${phone.substring(2)}%`)
              .limit(1)
            if (workers && workers.length > 0) worker = workers[0]
         } catch(e) {} // Failsafe if Schema not found

         // Tenta buscar a foto de perfil do WhatsApp se for Evolution/UAZ
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
             contact_name: worker ? worker.nome : senderName,
             contact_avatar_url: newlyFetchedAvatar || null,
             worker_id: worker?.id || null,
             status: 'open'
           })
           .select()
           .single()
         
         if (convError) throw convError
         conversation = newConv
      } else {
         if (conversation.status === 'closed' && !isFromMe) {
           await supabase
             .from('chat_conversations')
             .update({ status: 'open' })
             .eq('id', conversation.id)
         }
         
         // Se a conversa já existe mas a foto nula, tentar recuperar
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
                // Deixa atualizar silenciosamente junto com o last_message_at depois, no fluxo de always update.
              }
            } catch(e) {}
         }
      }

      if (conversation) {
         // Transform CRM Echo into an UPDATE instead of a duplicate INSERT
         if (isFromMe && eventType !== 'messages.update') {
            const { data: recentCrmMsg } = await supabase
              .from('chat_messages')
              .select('id')
              .eq('conversation_id', conversation.id)
              .eq('direction', 'outbound')
              .is('external_id', null)
              .gte('created_at', new Date(Date.now() - 120000).toISOString()) // 2 minutes window
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

         // Insert message
         const finalContentToInsert = mediaTranscription ? mediaTranscription : textContent;

         const { error: msgErr } = await supabase.from('chat_messages').insert({
           conversation_id: conversation.id,
           external_id: externalId,
           direction: isFromMe ? 'outbound' : 'inbound',
           content: finalContentToInsert,
           message_type: messageTypeDb,
           sender_name: isFromMe ? 'Sistema' : senderName,
           media_url: mediaUrl,
           status: 'delivered'
         })
         
         if (msgErr) {
            if (msgErr.code === '23505') {
               console.log(`[Webhook INFO] Message ${externalId} already processed (duplicate webhook request).`)
            } else {
               console.error('[Webhook ERROR] Error inserting message:', msgErr)
            }
         }

         // The transcription is now successfully merged into the audio message's content directly.

         // Update unread_count and last_message_at
         const updateConversationPayload: any = {};
         if (newlyFetchedAvatar) updateConversationPayload.contact_avatar_url = newlyFetchedAvatar;

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
