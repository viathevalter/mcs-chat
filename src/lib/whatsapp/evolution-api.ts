export interface SendTextProps {
  number: string;
  text: string;
  instanceName: string;
}

export interface SendMediaProps {
  number: string;
  mediaUrl: string;
  mediaType: string;
  fileName?: string;
  caption?: string;
  instanceName: string;
}

const API_URL = process.env.EVOLUTION_API_URL;
const API_KEY = process.env.EVOLUTION_API_KEY;

const getHeaders = () => {
  if (!API_KEY) throw new Error('EVOLUTION_API_KEY is not set');
  return {
    'Content-Type': 'application/json',
    apikey: API_KEY,
  };
};

export const evolutionApi = {
  async sendText({ number, text, instanceName }: SendTextProps) {
    if (!API_URL) throw new Error('EVOLUTION_API_URL is not set');
    const url = `${API_URL}/message/sendText/${instanceName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
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

  async sendMedia({ number, mediaUrl, mediaType, fileName, caption, instanceName }: SendMediaProps) {
    if (!API_URL) throw new Error('EVOLUTION_API_URL is not set');
    const url = `${API_URL}/message/sendMedia/${instanceName}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        number,
        mediatype: mediaType,
        mimetype: mediaType === 'document' ? 'application/pdf' : undefined, // simplify assumption
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
