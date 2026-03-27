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
  }
};
