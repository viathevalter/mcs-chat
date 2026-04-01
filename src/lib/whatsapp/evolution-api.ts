export interface SendTextProps {
  number: string;
  text: string;
  instanceName: string;
  apiUrl: string;
  apiToken: string;
  provider?: string;
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
}

export const evolutionApi = {
  async sendText({ number, text, instanceName, apiUrl, apiToken, provider }: SendTextProps) {
    if (!apiUrl) throw new Error('API URL is required');
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    
    let url = '';
    let headers: any = { 'Content-Type': 'application/json' };
    let body: any = {};

    if (provider === 'uazapi') {
      url = `${cleanUrl}/send/text`;
      headers['token'] = apiToken;
      body = { number, text };
    } else {
      url = `${cleanUrl}/message/sendText/${instanceName}`;
      headers['apikey'] = apiToken;
      body = { number, text };
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`[Evolution API] Failed to send text to ${number}:`, error);
      throw new Error(`Failed to send text: ${error}`);
    }
    return response.json();
  },

  async sendMedia({ number, mediaUrl, mediaType, fileName, caption, instanceName, apiUrl, apiToken, provider }: SendMediaProps) {
    if (!apiUrl) throw new Error('API URL is required');
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    
    let url = '';
    let headers: any = { 'Content-Type': 'application/json' };
    let body: any = {};

    if (provider === 'uazapi') {
      url = `${cleanUrl}/send/media`;
      headers['token'] = apiToken;
      body = {
        number,
        type: mediaType,
        file: mediaUrl,
        docName: fileName || 'file',
        text: caption || ''
      };
    } else {
      url = `${cleanUrl}/message/sendMedia/${instanceName}`;
      headers['apikey'] = apiToken;
      body = {
        number,
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
      console.error(`[Evolution API] Failed to send media to ${number}:`, error);
      throw new Error(`Failed to send media: ${error}`);
    }
    return response.json();
  },

  async fetchProfilePictureUrl({ number, instanceName, apiUrl, apiToken, provider }: { number: string, instanceName: string, apiUrl: string, apiToken: string, provider?: string }): Promise<string | null> {
    try {
      if (!apiUrl) return null;
      const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const cleanNumber = number.replace(/@.*$/, '');
      
      let url = '';
      let headers: any = { 'Content-Type': 'application/json' };
      
      if (provider === 'uazapi') {
        url = `${cleanUrl}/chat/details`;
        headers['token'] = apiToken;
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ number: cleanNumber })
        });
        
        if (response.ok) {
           const data = await response.json();
           if (data && data.image && data.image !== '') {
             return data.image; // Return the full resolution image URL
           } else if (data && data.imagePreview && data.imagePreview !== '') {
             return data.imagePreview;
           }
        }
        return null; // Return null if it fails or there's no picture
      } else {
        url = `${cleanUrl}/chat/fetchProfilePictureUrl/${instanceName}?number=${cleanNumber}`;
        headers['apikey'] = apiToken;
        const response = await fetch(url, { 
          method: 'GET', 
          headers 
        });
        if (response.ok) {
          const data = await response.json();
          return data.profilePictureUrl || data.picture || null;
        } else {
          console.error(`Evolution fetchProfilePicture error: ${response.status}`, await response.text());
        }
      }
      return null;
    } catch (e) {
      console.error(`[Evolution API] Failed to fetch profile picture for ${number}:`, e);
      return null;
    }
  },

  async checkNumber({ number, instanceName, apiUrl, apiToken, provider }: { number: string, instanceName: string, apiUrl: string, apiToken: string, provider?: string }): Promise<{ exists: boolean, formattedNumber?: string, displayName?: string, profilePictureUrl?: string }> {
    try {
      const finalUrl = apiUrl || process.env.EVOLUTION_API_URL;
      const finalToken = apiToken || process.env.EVOLUTION_API_KEY;

      if (!finalUrl || !finalToken) {
        throw new Error('Missing API URL or Token for checking number.');
      }

      const cleanUrl = finalUrl.replace(/\/$/, '');
      const cleanNumber = number.replace(/\D/g, '');
      const isUazapi = provider?.toLowerCase() === 'uazapi';

      let url = '';
      let headers: any = { 'Content-Type': 'application/json' };
      let body: string | null = null;
      let method = 'POST';

      if (isUazapi) {
        url = `${cleanUrl}/chat/check`;
        headers['token'] = finalToken;
        body = JSON.stringify({ numbers: [cleanNumber] });
      } else {
        url = `${cleanUrl}/chat/whatsappNumbers/${instanceName}`;
        headers['apikey'] = finalToken;
        body = JSON.stringify({ numbers: [cleanNumber] });
      }

      const response = await fetch(url, { method, headers, ...(body ? { body } : {}) });
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      
      const data = await response.json();
      let resultObj = data;
      
      if (Array.isArray(data)) {
        resultObj = data[0];
      } else if (data && Array.isArray(data.numbers)) {
        resultObj = data.numbers[0];
      } else if (data && data[0]) {
        resultObj = data[0];
      } else {
        resultObj = data;
      }

      if (resultObj && (
          resultObj.exists === true || 
          resultObj.exists === 'true' || 
          resultObj.status === 'VALID' || 
          resultObj.isValid ||
          resultObj.isInWhatsapp === true ||
          resultObj.isInWhatsapp === 'true'
      )) {
        let fmt = resultObj.jid ? resultObj.jid.replace('@s.whatsapp.net', '') : cleanNumber;
        if (resultObj.number) fmt = resultObj.number;
        
        let dName = resultObj.pushName || resultObj.name || resultObj.verifiedName || undefined;
        let profilePic: string | undefined = undefined;

        // Try fetching more details
        try {
          if (isUazapi) {
            const dtUrl = `${cleanUrl}/chat/details`;
            let dtRes = await fetch(dtUrl, { method: 'POST', headers, body: JSON.stringify({ number: cleanNumber }) });
            if (dtRes.ok) {
              let dtData = await dtRes.json();
              
              // UAZAPI often does lazy loading from WA servers. If it returns empty, wait and retry once.
              if (dtData && !dtData.wa_name && !dtData.name && !dtData.image && !dtData.imagePreview) {
                await new Promise(r => setTimeout(r, 1500)); // wait 1.5s
                dtRes = await fetch(dtUrl, { method: 'POST', headers, body: JSON.stringify({ number: cleanNumber }) });
                if (dtRes.ok) dtData = await dtRes.json();
              }

              if (dtData) {
                if (!dName || dName.trim() === '') dName = dtData.wa_name || dtData.name || dtData.contactName || dtData.verifiedName || undefined;
                profilePic = dtData.image || dtData.imagePreview || undefined;
              }
            }
          } else {
            profilePic = await this.fetchProfilePictureUrl({ number: cleanNumber, instanceName, apiUrl: finalUrl, apiToken: finalToken, provider: 'evolution' }) || undefined;
          }
        } catch (err) {
          console.error('[Evolution API] Failed to fetch extended check details', err);
        }

        if (dName && dName.trim() === '') dName = undefined;

        return { exists: true, formattedNumber: fmt, displayName: dName, profilePictureUrl: profilePic };
      }

      return { exists: false };

    } catch (e: any) {
      console.error(`[Evolution API] Failed to check number ${number}:`, e);
      return { exists: false };
    }
  }
};
