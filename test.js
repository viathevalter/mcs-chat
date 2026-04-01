const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: channels } = await supabase.from('chat_channels').select('*').eq('is_active', true);
  
  const ch = channels.find(c => c.name.toLowerCase().includes('wise'));
  if (!ch) return console.log('not found');
  
  const cleanUrl = ch.provider_api_url.endsWith('/') ? ch.provider_api_url.slice(0, -1) : ch.provider_api_url;
  let url = ch.provider === 'uazapi' ? `${cleanUrl}/chat/check` : `${cleanUrl}/chat/whatsappNumbers/${ch.provider_instance_name}`;
  
  let headers = { 'Content-Type': 'application/json' };
  if(ch.provider === 'uazapi') headers['token'] = ch.provider_api_token;
  else headers['apikey'] = ch.provider_api_token;
  
  const num = "34654952433"; 
  console.log('Testing', num, 'on provider', ch.provider);
  
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ numbers: [num] }) });
  console.log(res.status, await res.text());
}
run();
