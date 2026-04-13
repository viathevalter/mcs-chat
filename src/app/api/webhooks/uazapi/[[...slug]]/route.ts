import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"


export const maxDuration = 60; // Timeout estendido para OCR e Tools pesadas

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Ideally Service Role for Webhooks bypass RLS

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
})

export async function POST(req: NextRequest) {
  let rawBody = ""
  let payload: any = {}
  
  try {
    rawBody = await req.text()
    
    payload = JSON.parse(rawBody)

    // Apenas nos importamos com novas mensagens recebidas
    // Apenas nos importamos com novas mensagens recebidas
    const eventName = payload.event || payload.EventType
    if (eventName === "messages.upsert" || eventName === "messages") {
      const isUaz = !!payload.EventType
      const messageData = isUaz ? payload.message : payload.data
      const instanceName = payload.instance || payload.instanceName

      let tenantId = null
      let channelId = null

      if (instanceName && instanceName.length > 36) {
        // Legado: Instâncias antigas com padrão UUID-UUID
        tenantId = instanceName.substring(0, 36)
        channelId = instanceName.substring(37) // Rest of the string
      } else {
        // Novo padrão SaaS: Buscamos a instância conectada pelo Nome Exato
        const { data: channelData } = await supabase
          .from('chat_channels')
          .select('id, tenant_id')
          .eq('name', instanceName)
          .limit(1)
          .single()

        if (channelData) {
          tenantId = channelData.tenant_id
          channelId = channelData.id
        }
      }

      if (!tenantId || !channelId) {
        console.warn(`Webhook descartado: Instância '${instanceName}' não encontrada ou não pertence a nenhum Canal ativo no CRM.`)
        return NextResponse.json({ success: true, warning: "Instance unknown" })
      }

      // Extrator universal do Remetente (Peer ID) para UAZAPI
      let uazSender = null;
      
      // 1. Sempre dar preferência máxima ao wa_chatid do wrapper Chat (Garante o remetente oficial do Direct)
      if (payload.chat?.wa_chatid) {
         uazSender = payload.chat.wa_chatid
      }
      
      // 2. Fallbacks secundários para o objeto Message caso falte o Chat wrapper
      if (!uazSender) {
        uazSender = messageData?.key?.participant || messageData?.key?.remoteJID || messageData?.sender || messageData?.chatid
      }
      
      const remoteJid = isUaz ? uazSender : messageData.key?.remoteJid
      const fromMe = isUaz ? (messageData?.fromMe || messageData?.key?.fromMe) : messageData.key?.fromMe
      
      // Se a mensagem foi enviada pelo próprio número, a deduplicação mais abaixo (linha 301) 
      // identificará pelo external_id se ela foi enviada pelo Painel CRM (Echo) ou direto do Aparelho Físico.
      // if (fromMe === true && payload?.event !== 'messages.update') {
      //    return NextResponse.json({ success: true, status: "Ignored Echo (fromMe=true)" })
      // }
      
      let messageTypeDb = 'text';
      let messageText = "[Mídia/Outros]";
      let extractedCaption: string | null = null;
      
      if (isUaz) {
        let mediaUrl = null;
        const chatLastMsgType = payload?.chat?.wa_lastMessageType || '';
        const msgType = messageData?.messageType || messageData?.mediaType || chatLastMsgType || '';
        const mediaType = messageData?.mediaType || '';
        const mimeType = messageData?.content?.mimetype || '';

        const isAudio = msgType.toLowerCase().includes('audio') || msgType === 'ptt' || mediaType === 'audio' || mimeType.includes('audio');
        const isImage = msgType.toLowerCase().includes('image') || mediaType === 'image' || mimeType.includes('image');
        const isVideo = msgType.toLowerCase().includes('video') || mediaType === 'video' || mimeType.includes('video');
        const isDocument = msgType.toLowerCase().includes('document') || mediaType === 'document' || mimeType.includes('pdf');

        if (isAudio || isImage || isVideo || isDocument) {
          if (isAudio) messageTypeDb = 'audio';
          else if (isImage) messageTypeDb = 'image';
          else if (isVideo) messageTypeDb = 'video';
          else if (isDocument) messageTypeDb = 'document';

          // Fallback nativo do payload (encrypted)
          mediaUrl = messageData?.fileURL || messageData?.content?.URL || null;

          try {
             const API_URL = process.env.UAZ_API_URL || 'https://api.uazapi.com'
             const GLOBAL_KEY = process.env.UAZ_GLOBAL_KEY
             
             let traceLog = `API=${!!API_URL} GK=${!!GLOBAL_KEY} ID=${messageData?.id} `;
             
             if (API_URL && GLOBAL_KEY && messageData?.id) {
                const instancesUrl = `${API_URL}/instance/all`
                const activeInstancesReq = await fetch(instancesUrl, {
                   method: "GET", headers: { "admintoken": GLOBAL_KEY },
                })
                traceLog += `InstReq=${activeInstancesReq.status} `;
                if (activeInstancesReq.ok) {
                   const uazInstancesList = await activeInstancesReq.json()
                   traceLog += `InstLen=${uazInstancesList?.length} `;
                   const targetInstance = (Array.isArray(uazInstancesList) ? uazInstancesList : []).find((i: any) => i.name === instanceName) || (Array.isArray(uazInstancesList) ? uazInstancesList : []).find((i: any) => i.status === 'connected' || i.status === 'open')
                   
                   traceLog += `TgtToken=${!!targetInstance?.token} `;
                   if (targetInstance?.token) {
                      let pureId = messageData?.id || '';
                      if (pureId.includes(':')) pureId = pureId.split(':')[1];
                      
                      const downloadUrl = `${API_URL}/message/download`
                      const downloadReq = await fetch(downloadUrl, {
                         method: "POST",
                         headers: { "token": targetInstance.token, "Content-Type": "application/json" },
                         body: JSON.stringify({ id: pureId, return_base64: true, return_link: true, ...(messageTypeDb === 'audio' ? { generate_mp3: true } : {}) })
                      })
                      
                      const responseText = await downloadReq.text();
                      traceLog += `DldReq=${downloadReq.status} BodyLen=${responseText.length} `;
                      
                      if (downloadReq.ok) {
                         try {
                           const downloadRes = JSON.parse(responseText);
                           let mimeType = 'application/octet-stream';
                           if (messageTypeDb === 'audio') mimeType = 'audio/mp3';
                           else if (messageTypeDb === 'image') mimeType = 'image/jpeg';
                           else if (messageTypeDb === 'video') mimeType = 'video/mp4';
                           else if (messageTypeDb === 'document') mimeType = messageData?.content?.mimetype || 'application/pdf';

                           const finalBase64 = downloadRes.base64 || downloadRes.base64Data || downloadRes.data;
                           let resolvedUrl = downloadRes.url || downloadRes.link || downloadRes.fileUrl || (typeof downloadRes === 'string' && downloadRes.startsWith('http') ? downloadRes : null);
                           
                           // Capturar nome original do arquivo
                           const originalFileName = messageData?.message?.documentMessage?.fileName || messageData?.content?.fileName || messageData?.fileName || messageData?.content?.name || 'documento';
                           const encodedFileName = encodeURIComponent(originalFileName);

                           if (!resolvedUrl && finalBase64) {
                              // Cloud Storage Upload to prevent PostgreSQL Bloat
                              try {
                                 const ext = mimeType.split('/')[1] || 'bin';
                                 const filename = `${tenantId}/${pureId}.${ext}`;
                                 const cleanB64 = finalBase64.replace(/\s/g, ''); // Ensure strict format
                                 const buffer = Buffer.from(cleanB64, 'base64');
                                 
                                 const { data: uploadData, error: uploadErr } = await supabase
                                   .storage
                                   .from('chat-media')
                                   .upload(filename, buffer, {
                                     contentType: mimeType,
                                     upsert: true
                                   });
                                 
                                 if (uploadErr) {
                                   traceLog += `StorageErr=true `;
                                   resolvedUrl = `data:${mimeType};base64,${cleanB64}`; // Fallback safe UI
                                 } else {
                                   const { data: publicUrlData } = supabase.storage.from('chat-media').getPublicUrl(filename);
                                   resolvedUrl = publicUrlData.publicUrl;
                                   traceLog += `StorageOK=true `;
                                 }

                                  // NOVA INTEGRAÇÃO: WHISPER (MULTIMODALIDADE DE ÁUDIO)
                                  if (messageTypeDb === 'audio' && (finalBase64 || cleanB64)) {
                                     try {
                                        const b64Str = cleanB64 || finalBase64.replace(/\s/g, '');
                                        const audioBuffer = Buffer.from(b64Str, 'base64');
                                        const blob = new Blob([audioBuffer], { type: 'audio/mp3' });
                                        const formData = new FormData();
                                        formData.append('file', blob, 'audio.mp3');
                                        formData.append('model', 'whisper-1');
                                        
                                        const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                                            method: 'POST',
                                            headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
                                            body: formData
                                        });

                                        if (whisperRes.ok) {
                                            const wJson = await whisperRes.json();
                                            if (wJson.text && resolvedUrl) {
                                                resolvedUrl += `|__TRANSCRIPT__|${wJson.text}`;
                                                traceLog += `WhisperOK `;
                                            }
                                        } else {
                                            console.error('Whisper API Error:', await whisperRes.text());
                                            traceLog += `WhisperErr `;
                                        }
                                     } catch(wErr) { 
                                         console.error('Whisper Catch Err:', wErr);
                                         traceLog += `WhisperCatch `;
                                     }
                                  }
                              } catch(uploadCrash) {
                                 traceLog += `StorageCrash=true `;
                                 resolvedUrl = `data:${mimeType};base64,${finalBase64.replace(/\s/g, '')}`;
                              }
                           }

                           if (resolvedUrl && messageTypeDb === 'document') {
                              resolvedUrl += `#name=${encodedFileName}`;
                           }

                           traceLog += `ResKeys=${Object.keys(downloadRes).join(',')} ResUrl=${!!resolvedUrl} Base64Len=${finalBase64?.length || 0} `;
                           if (resolvedUrl) mediaUrl = resolvedUrl;
                         } catch(e) { traceLog += `JsonErr `; }
                      } else {
                         traceLog += `DldFailed `;
                      }
                   }
                }
             }
          } catch(err: any) {
             console.error('Failed to resolve UAZ media URL via /download', err);
          }
        }

        if (typeof messageData?.content === 'object' && messageData.content !== null) {
           extractedCaption = messageData.content.caption || null;
        }

        if (mediaUrl) {
          messageText = mediaUrl; // Store the URL directly in the content field.
        } else if (typeof messageData?.content === 'string') {
          messageText = messageData.content
        } else if (typeof messageData?.content === 'object' && messageData.content !== null) {
          // A UAZ costuma enviar {"key": {...}, "text": "Mensagem"}
          const contentObjLocal = messageData.content as any
          if (contentObjLocal.text) {
             messageText = contentObjLocal.text
          } else if (contentObjLocal.message?.conversation) {
             messageText = contentObjLocal.message.conversation
          } else if (contentObjLocal.caption) {
             messageText = contentObjLocal.caption; // Use the image/video caption as text fallback
          } else if (['audio', 'video', 'image', 'document'].includes(messageTypeDb)) {
             // Temporary raw JSON dump for debugging UAZ payload if url is missing
             messageText = JSON.stringify(contentObjLocal).substring(0, 1500)
          } else if (contentObjLocal.templateMessage?.hydratedTemplate?.hydratedContentText) {
             messageText = contentObjLocal.templateMessage.hydratedTemplate.hydratedContentText
          } else if (contentObjLocal.interactiveMessage?.body?.text) {
             messageText = contentObjLocal.interactiveMessage.body.text
          } else if (contentObjLocal.buttonsMessage?.contentText) {
             messageText = contentObjLocal.buttonsMessage.contentText
          } else if (payload.chat?.wa_lastMessageTextVote) {
             messageText = payload.chat.wa_lastMessageTextVote
          } else {
             messageText = "[Mídia / Formato Complexo UAZ]"
          }
        }
        
        // Prevent raw JSON dump on Inbox when UAZ sends media content like document or images without setting messageType
        if (typeof messageText === 'string' && (messageText.startsWith('{"URL"') || messageText.includes('"mimetype"')) && messageTypeDb === 'text') {
           messageText = '[Mídia / Anexo]'
        }
      } else {
        messageText = messageData.message?.conversation || messageData.message?.extendedTextMessage?.text || "[Mídia/Outros]"
        if (messageData.message?.imageMessage?.caption) {
           extractedCaption = messageData.message.imageMessage.caption;
        }
      }
      
      const messageId = isUaz ? messageData?.id : messageData.key?.id

      // Prevenir inserção de mensagem duplicada
      const remoteMessageId = messageData?.messageId || messageData?.id?.id || messageData?.key?.id || messageData?.id || ''
      const { data: existingMsg } = await supabase.from('chat_messages').select('id').eq('external_id', remoteMessageId).limit(1).single()

      if (existingMsg) {
        return NextResponse.json({ success: true, status: "Ignored Duplicate Message" })
      }

      // Ignora grupos vazios
      if (!remoteJid || remoteJid.includes('@g.us')) {
        return NextResponse.json({ success: true, status: "Ignored" })
      }

      // Limpar DDI do número para busca padrão (Sanitizando lixos da UAZ tipo @s.whatsapp.net)
      const phone = remoteJid.replace(/@.*$/, '')
      const pushName = (isUaz ? (payload.chat?.name || payload.chat?.wa_name) : messageData.pushName) || "Contato WhatsApp"

      // 1. Procurar Customer
      let customerId = null
      let leadId = null

      const { data: customer } = await supabase
        .from('customers')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('phone', phone)
        .single()

      if (customer) {
        customerId = customer.id
      } else {
        // 2. Procurar Lead
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('phone', phone)
          .single()

        if (existingLead) {
          leadId = existingLead.id
        } else {
          // 3. Criar Novo Lead Passivo
          
          let defaultPipelineId = null
          let defaultStageId = null
          
          const { data: pipeline } = await supabase
            .from('pipelines')
            .select('id')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: true })
            .limit(1)
            .single()
            
          if (pipeline) {
             defaultPipelineId = pipeline.id
             const { data: stage } = await supabase
               .from('pipeline_stages')
               .select('id')
               .eq('pipeline_id', pipeline.id)
               .order('order_index', { ascending: true })
               .limit(1)
               .single()
             if (stage) defaultStageId = stage.id
          }

          if (defaultPipelineId && defaultStageId) {
            const { data: newLead, error: leadError } = await supabase
              .from('leads')
              .insert({
                tenant_id: tenantId,
                name: pushName || phone,
                phone: phone,
                pipeline_id: defaultPipelineId,
                stage_id: defaultStageId
              })
              .select('id')
              .single()
              
            if (leadError) console.error("Erro ao criar Lead Passivo:", leadError)
            leadId = newLead?.id
          } else {
             console.error("Pipeline ou Estágio não encontrado para o tenant:", tenantId)
          }
        }
      }

      // 4. Garantir Conversa (Conversation)
      let conversationId = null
      
      let conversationQuery = supabase
        .from('chat_conversations')
        .select('id, status')
        .eq('tenant_id', tenantId)
        .order('updated_at', { ascending: false })
        .limit(1)

      if (customerId) {
         conversationQuery = conversationQuery.eq('customer_id', customerId)
      } else if (leadId) {
         conversationQuery = conversationQuery.eq('lead_id', leadId)
      } else {
         conversationQuery = conversationQuery.eq('contact_phone', phone)
      }

      const { data: existingConversations } = await conversationQuery

      if (existingConversations && existingConversations.length > 0) {
        conversationId = existingConversations[0].id
        
        // Reabertura Automática se o cliente voltar a falar, ou apenas Bump na data se aberto
        if (existingConversations[0].status === 'closed') {
           await supabase.from('chat_conversations').update({ status: 'open', updated_at: new Date().toISOString(), last_message_at: new Date().toISOString() }).eq('id', conversationId)
        } else {
           await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString(), last_message_at: new Date().toISOString() }).eq('id', conversationId)
        }
      } else {
        const { data: newConv } = await supabase
          .from('chat_conversations')
          .insert({
            tenant_id: tenantId,
            customer_id: customerId || null,
            lead_id: leadId || null,
            channel: 'whatsapp',
            status: 'open',
            contact_phone: phone,
            contact_name: pushName || phone,
            last_message_at: new Date().toISOString()
          })
          .select('id')
          .single()
          
        conversationId = newConv?.id
      }

      // 5. Inserir a Mensagem
      if (conversationId) {
        const msgDirection = fromMe === true ? 'outbound' : 'inbound';
        
        let quotedMsgId = null;
        try {
            const possibleContextPaths = [
                messageData?.message?.extendedTextMessage?.contextInfo,
                messageData?.message?.imageMessage?.contextInfo,
                messageData?.message?.videoMessage?.contextInfo,
                messageData?.message?.audioMessage?.contextInfo,
                messageData?.message?.documentMessage?.contextInfo,
                messageData?.quoted?.key,
                messageData?.quotedMessageId
            ];
            for (const pc of possibleContextPaths) {
                if (pc?.stanzaId) { quotedMsgId = pc.stanzaId; break; }
                if (pc?.id) { quotedMsgId = pc.id; break; }
                if (typeof pc === 'string') { quotedMsgId = pc; break; }
            }
        } catch(e){}

        const { data: sentMessage, error: insertError } = await supabase.from('chat_messages').insert({
          tenant_id: tenantId,
          conversation_id: conversationId,
          content: messageText,
          message_type: messageTypeDb,
          external_id: remoteMessageId,
          direction: msgDirection,
          sender_name: fromMe === true ? "Aparelho Local" : pushName,
          status: "delivered",
          quoted: quotedMsgId
        }).select('*').single()

        if (insertError) {
          console.error("WEBHOOK FATAL ERROR: Falha ao inserir mensagem", insertError);
        } else {
          
          // NOVO: Cancelamento de Workflow/Automação (Para de cobrar/seguir sequencia se o cara respondeu)
          if (!fromMe) {
            try {
               // 1. Marca as incrições ativas para Cancelled
               const possibleIds = [customerId, leadId].filter(Boolean) as string[];
               if (possibleIds.length > 0) {
                   await supabase
                     .from('automation_enrollments')
                     .update({ status: 'cancelled' })
                     .eq('tenant_id', tenantId)
                     .in('entity_id', possibleIds)
                     .eq('status', 'active');
               }

               // 2. Destrói fisicamente ou cancela os blocos pendentes na fila
               await supabase
                     .from('message_queue')
                     .update({ status: 'cancelled' })
                     .eq('tenant_id', tenantId)
                     .eq('phone', phone)
                     .not('enrollment_id', 'is', null)
                     .eq('status', 'pending');
                     
            } catch(cancelFlowErr) {
               console.error("Erro ao cancelar fluxo auto:", cancelFlowErr)
            }
          }
          
          if (extractedCaption) {
              await supabase.from('chat_messages').insert({
                tenant_id: tenantId,
                conversation_id: conversationId,
                content: extractedCaption,
                message_type: 'text',
                external_id: remoteMessageId + "_caption",
                direction: msgDirection,
                sender_name: fromMe === true ? "Aparelho Local" : pushName,
                status: "delivered"
              })
          }

          // == AI TRIGGER START (NATIVO SEM LOOPBACK VERCEL) ==
          if (!fromMe) {
            // processAiRemoved)
          }
          // == AI TRIGGER END ==
        }

      }

      return NextResponse.json({ success: true, processed: true })
    }

    return NextResponse.json({ success: true, ignored: true })
  } catch (error: any) {
    console.error("Erro Crítico no Webhook UAZAPI:", error)
    
    // CAPTURA FINAL PARA O BANCO DE DADOS
    try {
      const { data: tempChan } = await supabase.from('chat_channels').select('tenant_id').limit(1).single()
      if (tempChan) {
        await supabase.from('canned_responses').insert({
          tenant_id: tempChan.tenant_id,
          title: `CRASH FATAL UAZ: ${error.message || 'Unknown'}`,
          content: `${error.stack || error}`.substring(0, 2000)
        })
      }
    } catch(dbErr) {}

    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
