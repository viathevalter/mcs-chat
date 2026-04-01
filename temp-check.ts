import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  
  const { data: channels } = await supabase.from('chat_channels').select('*').eq('is_active', true);
  const wiseowe = channels.find((c: any) => c.name.toLowerCase().includes('wise'));
  
  if (!wiseowe) return console.log('Channel not found');
  
  console.log('Provider:', wiseowe.provider);
  const cleanUrl = wiseowe.provider_api_url.endsWith('/') ? wiseowe.provider_api_url.slice(0, -1) : wiseowe.provider_api_url;
  
  let url = '';
  let headers: any = { 'Content-Type': 'application/json' };
  
  if (wiseowe.provider === 'uazapi') {
    url = `${cleanUrl}/chat/check`;
    headers['token'] = wiseowe.provider_api_token;
  } else {
    url = `${cleanUrl}/chat/whatsappNumbers/${wiseowe.provider_instance_name}`;
    headers['apikey'] = wiseowe.provider_api_token;
  }
  
  console.log(`Checking number on ${url}`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ numbers: ['554796080063'] })
    });
    
    console.log('Status:', res.status);
    const json = await res.json();
    console.log('Response:', JSON.stringify(json, null, 2));
  } catch (e) {
    console.error(e);
  }
}
run();
