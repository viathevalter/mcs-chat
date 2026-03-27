export interface SendTextProps {
  number: string;
  text: string;
  instanceName: string;
  apiUrl: string;
  apiToken: string;
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
}

const getHeaders = (token: string) => {
  if (!token) throw new Error('API Token is required');
  return {
    'Content-Type': 'application/json',
    apikey: token,
  };
};

export const evolutionApi = {
  async sendText({ number, text, instanceName, apiUrl, apiToken }: SendTextProps) {
    if (!apiUrl) throw new Error('API URL is required');
    
    // Clean URL trailing slashes for safety
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const url = `${cleanUrl}/message/sendText/${instanceName}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(apiToken),
      body: JSON.stringify({ number, text: text }),
      cache: 'no-store'
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`[Evolution API] Failed to send text to ${number}:`, error);
      throw new Error(`Failed to send text: ${error}`);
    }
    return response.json();
  },

  async sendMedia({ number, mediaUrl, mediaType, fileName, caption, instanceName, apiUrl, apiToken }: SendMediaProps) {
    if (!apiUrl) throw new Error('API URL is required');
    
    const cleanUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
    const url = `${cleanUrl}/message/sendMedia/${instanceName}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(apiToken),
      body: JSON.stringify({
        number,
        mediatype: mediaType,
        mimetype: mediaType === 'document' ? 'application/pdf' : undefined,
        media: mediaUrl,
        fileName: fileName || 'file',
        caption: caption || ''
      }),
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
