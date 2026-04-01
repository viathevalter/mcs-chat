const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabase = createClient('https://pyahcgorkvwfwmlzspnv.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5YWhjZ29ya3Z3ZndtbHpzcG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY3NTYsImV4cCI6MjA4NTYyMjc1Nn0.JM0y0qI83_i2T5UcC7GkTA2gwEY-h9n3MVIn2sH_xBc');
  
  const { data: channels, error } = await supabase.from('chat_channels').select('*').eq('is_active', true);
  if (error) { console.error('DB Error', error); return; }
  
  console.log('Available channels:', channels.map(c => c.name));
  
  const ch = channels[0];
  if (!ch) return console.log('no channels');
  
  const cleanUrl = ch.provider_api_url.endsWith('/') ? ch.provider_api_url.slice(0, -1) : ch.provider_api_url;
  
  console.log('Provider is', ch.provider);
  // Try Evolution v1/v2 endpoint
  let urlEvo = `${cleanUrl}/chat/whatsappNumbers/${ch.provider_instance_name}`;
  console.log('Testing Evolution endpoint:', urlEvo);
  try {
     const res1 = await fetch(urlEvo, { method: 'POST', headers: { apikey: ch.provider_api_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ numbers: ["34654952433"] }) });
     console.log('Evo Status:', res1.status, await res1.text());
  } catch(e) { console.log(e); }

  // Try UAZAPI endpoint
  let urlUaz = `${cleanUrl}/chat/check`;
  console.log('Testing UAZAPI endpoint:', urlUaz);
  try {
     const res2 = await fetch(urlUaz, { method: 'POST', headers: { token: ch.provider_api_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ numbers: ["34654952433"] }) });
     console.log('Uaz Status:', res2.status, await res2.text());
  } catch(e) { console.log(e); }
}
run();
