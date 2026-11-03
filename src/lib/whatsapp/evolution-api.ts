export interface SendTextProps {
  number: string;
  text: string;
  instanceName: string;
  apiUrl: string;
  apiToken: string;
  provider?: string;
  replyId?: string;
  linkPreview?: boolean;
  delay?: number;
  readChat?: boolean;
}

export interface SendMediaProps {
  number: string;
  mediaUrl: string;
  mediaType: string;
  fileName?: string;
  caption?: string;
  instanceName: string;
  apiUrl: string;
  apiToken: string;
  provider?: string;
  replyId?: string;
  delay?: number;
  readChat?: boolean;
}

export function classifyWhatsAppSendError(rawError: string, phone?: string): {
  isNoWhatsApp: boolean;
  code: 'NO_WHATSAPP' | 'INVALID_NUMBER' | 'SEND_FAILED';
  friendlyPt: string;
  friendlyEs: string;
  shortBadgePt: string;
  shortBadgeEs: string;
} {
  const errLower = String(rawError || '').toLowerCase();
  const cleanPhone = (phone || '').replace(/\D/g, '');
  const phoneLabel = cleanPhone ? `+${cleanPhone}` : 'informado';

  const isNoWhatsApp =
    errLower.includes('is not on whatsapp') ||
    errLower.includes('not on whatsapp') ||
    errLower.includes('usync returned no lid') ||
    errLower.includes('failed to resolve lid') ||
    errLower.includes('not registered on whatsapp') ||
    errLower.includes('isInWhatsapp":false'.toLowerCase()) ||
    errLower.includes('no whatsapp account');

  if (isNoWhatsApp) {
    return {
      isNoWhatsApp: true,
      code: 'NO_WHATSAPP',
      friendlyPt: `🚫 O número ${phoneLabel} NÃO possui conta ativa no WhatsApp (a Meta informou que este telefone não tem WhatsApp instalado/registrado). Verifique se o trabalhador possui outro número ou atualize o cadastro.`,
      friendlyEs: `🚫 El número ${phoneLabel} NO tiene cuenta activa en WhatsApp (Meta informó que este teléfono no tiene WhatsApp instalado/registrado). Verifique si el trabajador tiene otro número o actualice su ficha.`,
      shortBadgePt: `🚫 Número sem WhatsApp (${phoneLabel})`,
      shortBadgeEs: `🚫 Número sin WhatsApp (${phoneLabel})`
    };
  }

  if (cleanPhone.length > 0 && cleanPhone.length < 9) {
    return {
      isNoWhatsApp: true,
      code: 'INVALID_NUMBER',
      friendlyPt: `⚠️ O número ${phoneLabel} está incompleto ou inválido no cadastro e não pôde receber mensagens no WhatsApp. Atualize o telefone na ficha do trabalhador.`,
      friendlyEs: `⚠️ El número ${phoneLabel} está incompleto o inválido en el registro y no pudo recibir mensajes en WhatsApp. Actualice el teléfono en la ficha del trabajador.`,
      shortBadgePt: `⚠️ Telefone incompleto (${phoneLabel})`,
      shortBadgeEs: `⚠️ Teléfono incompleto (${phoneLabel})`
    };
  }

  return {
    isNoWhatsApp: false,
    code: 'SEND_FAILED',
    friendlyPt: `❌ Falha ao entregar mensagem para ${phoneLabel} na API do WhatsApp. Verifique se o número possui WhatsApp ativo.`,
    friendlyEs: `❌ Error al entregar mensaje a ${phoneLabel} en la API de WhatsApp. Verifique si el número tiene WhatsApp activo.`,
    shortBadgePt: `❌ Falha no envio (${phoneLabel})`,
    shortBadgeEs: `❌ Error de envío (${phoneLabel})`
  };
}

export const evolutionApi = {
  async sendText({
    number,
    text,
    instanceName,
    apiUrl,
    apiToken,
    provider = 'uazapi',
    replyId,
    linkPreview = false,
    delay = 0,
    readChat = true
  }: SendTextProps) {
    if (!apiUrl) throw new Error('API URL is required');
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const cleanNumber = number.replace(/\D/g, '');

    let url = '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: Record<string, any> = {};

    if (provider === 'uazapi') {
      url = `${cleanUrl}/send/text`;
      headers['token'] = apiToken;
      body = {
        number: cleanNumber,
        text,
        linkPreview,
        delay,
        readchat: readChat,
        readmessages: readChat,
        track_source: 'mcs-chat'
      };
      if (replyId) {
        body.replyid = replyId.includes(':') ? replyId.split(':').pop() : replyId;
      }
    } else {
      url = `${cleanUrl}/message/sendText/${instanceName}`;
      headers['apikey'] = apiToken;
      body = { number: cleanNumber, text };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[UazAPI/Evolution] Failed to send text to ${cleanNumber}:`, error);
      throw new Error(`Failed to send text: ${error}`);
    }
    return response.json();
  },

  async sendMedia({
    number,
    mediaUrl,
    mediaType,
    fileName,
    caption,
    instanceName,
    apiUrl,
    apiToken,
    provider = 'uazapi',
    replyId,
    delay = 0,
    readChat = true
  }: SendMediaProps) {
    if (!apiUrl) throw new Error('API URL is required');
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const cleanNumber = number.replace(/\D/g, '');

    let url = '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: Record<string, any> = {};

    if (provider === 'uazapi') {
      url = `${cleanUrl}/send/media`;
      headers['token'] = apiToken;
      // UazAPI v2: use 'ptt' for voice messages so they appear as native voice notes
      const uazMediaType = mediaType === 'audio' ? 'ptt' : mediaType;
      body = {
        number: cleanNumber,
        type: uazMediaType,
        file: mediaUrl,
        docName: fileName || 'arquivo',
        text: caption || '',
        delay,
        readchat: readChat,
        readmessages: readChat,
        track_source: 'mcs-chat'
      };
      if (replyId) {
        body.replyid = replyId.includes(':') ? replyId.split(':').pop() : replyId;
      }
    } else {
      url = `${cleanUrl}/message/sendMedia/${instanceName}`;
      headers['apikey'] = apiToken;
      body = {
        number: cleanNumber,
        mediatype: mediaType,
        mimetype: mediaType === 'document' ? 'application/pdf' : undefined,
        media: mediaUrl,
        fileName: fileName || 'file',
        caption: caption || ''
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[UazAPI/Evolution] Failed to send media to ${cleanNumber}:`, error);
      throw new Error(`Failed to send media: ${error}`);
    }
    return response.json();
  },

  async editMessage({
    id,
    text,
    apiUrl,
    apiToken
  }: {
    id: string;
    text: string;
    apiUrl: string;
    apiToken: string;
  }) {
    if (!apiUrl) throw new Error('API URL is required');
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const pureId = id.includes(':') ? id.split(':').pop() || id : id;

    const response = await fetch(`${cleanUrl}/message/edit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: apiToken
      },
      body: JSON.stringify({
        id: pureId,
        text
      }),
      cache: 'no-store'
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[UazAPI] Failed to edit message ${id}:`, error);
      throw new Error(`Failed to edit message: ${error}`);
    }
    return response.json();
  },

  async reactMessage({
    id,
    number,
    emoji,
    apiUrl,
    apiToken
  }: {
    id: string;
    number: string;
    emoji: string;
    apiUrl: string;
    apiToken: string;
  }) {
    if (!apiUrl) throw new Error('API URL is required');
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const cleanNumber = number.replace(/\D/g, '');
    const jid = cleanNumber.includes('@') ? cleanNumber : `${cleanNumber}@s.whatsapp.net`;
    const pureId = id.includes(':') ? id.split(':').pop() || id : id;

    const response = await fetch(`${cleanUrl}/message/react`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: apiToken
      },
      body: JSON.stringify({
        number: jid,
        text: emoji,
        id: pureId
      }),
      cache: 'no-store'
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[UazAPI] Failed to react to message ${id}:`, error);
      throw new Error(`Failed to react to message: ${error}`);
    }
    return response.json();
  },

  async markChatRead({
    number,
    read = true,
    apiUrl,
    apiToken
  }: {
    number: string;
    read?: boolean;
    apiUrl: string;
    apiToken: string;
  }) {
    try {
      if (!apiUrl || !apiToken) return null;
      const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const cleanNumber = number.replace(/\D/g, '');
      if (!cleanNumber) return null;

      const response = await fetch(`${cleanUrl}/chat/read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: apiToken
        },
        body: JSON.stringify({
          number: `${cleanNumber}@s.whatsapp.net`,
          read
        }),
        cache: 'no-store'
      });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  },

  async downloadMedia({
    id,
    apiUrl,
    apiToken,
    generateMp3 = true,
    transcribe = false,
    openAiKey
  }: {
    id: string;
    apiUrl: string;
    apiToken: string;
    generateMp3?: boolean;
    transcribe?: boolean;
    openAiKey?: string;
  }) {
    if (!apiUrl || !apiToken || !id) return null;
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const pureId = id.includes(':') ? id.split(':').pop() || id : id;

    const payload: Record<string, any> = {
      id: pureId,
      return_base64: true,
      return_link: true,
      generate_mp3: generateMp3
    };
    if (transcribe) {
      payload.transcribe = true;
      if (openAiKey) payload.openai_apikey = openAiKey;
    }

    const response = await fetch(`${cleanUrl}/message/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        token: apiToken
      },
      body: JSON.stringify(payload),
      cache: 'no-store'
    });

    if (!response.ok) return null;
    return response.json();
  },

  async configureWebhook({
    instanceName,
    apiUrl,
    apiToken,
    webhookBaseUrl
  }: {
    instanceName: string;
    apiUrl: string;
    apiToken: string;
    webhookBaseUrl?: string;
  }) {
    try {
      if (!apiUrl || !apiToken || !instanceName) return null;
      const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const baseAppUrl = (webhookBaseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://mcs-chat.vercel.app').replace(/\/$/, '');
      const targetWebhookUrl = `${baseAppUrl}/api/webhooks/uazapi/${encodeURIComponent(instanceName)}`;

      const response = await fetch(`${cleanUrl}/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          token: apiToken
        },
        body: JSON.stringify({
          enabled: true,
          url: targetWebhookUrl,
          events: ['messages', 'messages_update', 'connection', 'call'],
          excludeMessages: ['wasSentByApi', 'isGroupYes'],
          addUrlEvents: false,
          addUrlTypesMessages: false
        }),
        cache: 'no-store'
      });
      if (!response.ok) return null;
      return response.json();
    } catch (e) {
      console.warn('[UazAPI] Failed to auto-configure webhook:', e);
      return null;
    }
  },

  async deleteMessage({ id, number, instanceName, apiUrl, apiToken, provider = 'uazapi' }: { id: string, number: string, instanceName: string, apiUrl: string, apiToken: string, provider?: string }) {
    if (!apiUrl) throw new Error('API URL is required');
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const cleanNumber = number.replace(/\D/g, '');

    let url = '';
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: Record<string, any> = {};

    if (provider === 'uazapi') {
      url = `${cleanUrl}/message/delete`;
      headers['token'] = apiToken;
      const pureId = id.includes(':') ? id.split(':').pop() || id : id;
      body = { id: pureId };
    } else {
      url = `${cleanUrl}/chat/deleteMessage/${instanceName}`;
      headers['apikey'] = apiToken;
      body = {
        key: {
          remoteJid: `${cleanNumber}@s.whatsapp.net`,
          fromMe: true,
          id
        }
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[UazAPI/Evolution] Failed to delete message ${id}:`, error);
      throw new Error(`Failed to delete message: ${error}`);
    }
    return response.json();
  },

  async fetchProfilePictureUrl({ number, instanceName, apiUrl, apiToken, provider = 'uazapi' }: { number: string, instanceName: string, apiUrl: string, apiToken: string, provider?: string }): Promise<string | null> {
    try {
      if (!apiUrl) return null;
      const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const cleanNumber = number.replace(/@.*$/, '');

      if (provider === 'uazapi') {
        const response = await fetch(`${cleanUrl}/chat/details`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            token: apiToken
          },
          body: JSON.stringify({ number: cleanNumber, preview: true })
        });

        if (response.ok) {
          const data = await response.json();
          if (data?.imagePreview) return data.imagePreview;
          if (data?.image) return data.image;
        }
        return null;
      } else {
        const response = await fetch(`${cleanUrl}/chat/fetchProfilePictureUrl/${instanceName}?number=${cleanNumber}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: apiToken
          }
        });
        if (response.ok) {
          const data = await response.json();
          return data.profilePictureUrl || data.picture || null;
        }
      }
      return null;
    } catch (e) {
      console.error(`[UazAPI/Evolution] Failed to fetch profile picture for ${number}:`, e);
      return null;
    }
  },

  async checkNumber({ number, instanceName, apiUrl, apiToken, provider = 'uazapi', fastCheck = false }: { number: string, instanceName: string, apiUrl: string, apiToken: string, provider?: string, fastCheck?: boolean }): Promise<{ exists: boolean, confirmedNotOnWhatsapp?: boolean, rawError?: string, formattedNumber?: string, displayName?: string, profilePictureUrl?: string }> {
    try {
      const finalUrl = apiUrl || process.env.UAZ_API_URL || 'https://mcs-chat.uazapi.com';
      const finalToken = apiToken || process.env.UAZ_GLOBAL_KEY;

      if (!finalUrl || !finalToken) {
        throw new Error('Missing API URL or Token for checking number.');
      }

      const cleanUrl = finalUrl.replace(/\/$/, '');
      const cleanNumber = number.replace(/\D/g, '');
      const isUazapi = provider?.toLowerCase() === 'uazapi';

      let url = '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const body = JSON.stringify({ numbers: [cleanNumber] });

      if (isUazapi) {
        url = `${cleanUrl}/chat/check`;
        headers['token'] = finalToken;
      } else {
        url = `${cleanUrl}/chat/whatsappNumbers/${instanceName}`;
        headers['apikey'] = finalToken;
      }

      const response = await fetch(url, { method: 'POST', headers, body });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();
      let resultObj = data;

      if (Array.isArray(data)) {
        resultObj = data[0];
      } else if (data && Array.isArray(data.numbers)) {
        resultObj = data.numbers[0];
      } else if (data && data[0]) {
        resultObj = data[0];
      }

      if (
        resultObj &&
        (resultObj.exists === true ||
          resultObj.exists === 'true' ||
          resultObj.status === 'VALID' ||
          resultObj.isValid ||
          resultObj.isInWhatsapp === true ||
          resultObj.isInWhatsapp === 'true')
      ) {
        let fmt = resultObj.jid ? resultObj.jid.replace('@s.whatsapp.net', '') : cleanNumber;
        if (resultObj.number) fmt = resultObj.number;

        let dName = resultObj.pushName || resultObj.name || resultObj.verifiedName || undefined;
        let profilePic: string | undefined = undefined;

        if (!fastCheck) {
          try {
            if (isUazapi) {
              const dtUrl = `${cleanUrl}/chat/details`;
              let dtRes = await fetch(dtUrl, { method: 'POST', headers, body: JSON.stringify({ number: cleanNumber }) });
              if (dtRes.ok) {
                let dtData = await dtRes.json();
                if (dtData && !dtData.wa_name && !dtData.name && !dtData.image && !dtData.imagePreview) {
                  await new Promise(r => setTimeout(r, 1200));
                  dtRes = await fetch(dtUrl, { method: 'POST', headers, body: JSON.stringify({ number: cleanNumber }) });
                  if (dtRes.ok) dtData = await dtRes.json();
                }

                if (dtData) {
                  if (!dName || dName.trim() === '') {
                    dName = dtData.wa_name || dtData.name || dtData.wa_contactName || dtData.verifiedName || undefined;
                  }
                  profilePic = dtData.imagePreview || dtData.image || undefined;
                }
              }
            } else {
              profilePic = await this.fetchProfilePictureUrl({ number: cleanNumber, instanceName, apiUrl: finalUrl, apiToken: finalToken, provider: 'evolution' }) || undefined;
            }
          } catch (err) {
            console.error('[UazAPI] Failed to fetch extended check details', err);
          }
        }

        if (dName && dName.trim() === '') dName = undefined;

        return { exists: true, confirmedNotOnWhatsapp: false, formattedNumber: fmt, displayName: dName, profilePictureUrl: profilePic };
      }

      const explicitlyNotOnWa =
        Boolean(resultObj) &&
        (resultObj.isInWhatsapp === false ||
          resultObj.isInWhatsapp === 'false' ||
          resultObj.exists === false ||
          resultObj.exists === 'false' ||
          String(resultObj.error || '').toLowerCase().includes('not on whatsapp'));

      return {
        exists: false,
        confirmedNotOnWhatsapp: explicitlyNotOnWa,
        rawError: resultObj?.error || 'Number is not on WhatsApp'
      };
    } catch (e: any) {
      console.error(`[UazAPI] Failed to check number ${number}:`, e);
      return { exists: false, confirmedNotOnWhatsapp: false, rawError: e.message };
    }
  }
};
