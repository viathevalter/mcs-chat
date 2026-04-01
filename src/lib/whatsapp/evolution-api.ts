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

  async checkNumber({ number, instanceName, apiUrl, apiToken, provider }: { number: string, instanceName: string, apiUrl: string, apiToken: string, provider?: string }): Promise<{ exists: boolean, formattedNumber?: string, _debug?: any }> {
    try {
      const finalUrl = apiUrl || process.env.EVOLUTION_API_URL;
      const finalToken = apiToken || process.env.EVOLUTION_API_KEY;

      if (!finalUrl) throw new Error('API URL is required');
      const cleanUrl = finalUrl.endsWith('/') ? finalUrl.slice(0, -1) : finalUrl;
      const cleanNumber = number.replace(/\D/g, '');
      
      let url = '';
      let headers: any = { 'Content-Type': 'application/json' };
      
      if (provider === 'uazapi') {
        url = `${cleanUrl}/chat/check`;
        headers['token'] = finalToken;
      } else {
        url = `${cleanUrl}/chat/whatsappNumbers/${instanceName}`;
        headers['apikey'] = finalToken;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ numbers: [cleanNumber] }),
        cache: 'no-store'
      });

      if (!response.ok) {
        console.error(`[Evolution API] checkNumber error: ${response.status} ${response.statusText}`);
        return { exists: false };
      }

      const data = await response.json();
      
      // Handle the various structures possible from Evolution or Uazapi
      let resultObj = null;
      if (Array.isArray(data)) {
        resultObj = data[0];
      } else if (data && Array.isArray(data.result)) {
        resultObj = data.result[0];
      } else if (data && data[0]) {
        resultObj = data[0];
      } else if (data) {
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
        return { exists: true, formattedNumber: fmt, _debug: data };
      }

      return { exists: false, _debug: data };

    } catch (e: any) {
      console.error(`[Evolution API] Failed to check number ${number}:`, e);
      return { exists: false, _debug: { error: e.message } };
    }
  }
};
