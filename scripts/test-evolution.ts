import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Parse .env.local manually
const envPath = path.resolve(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env: Record<string, string> = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabase = createClient(env['NEXT_PUBLIC_SUPABASE_URL'], env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY']);

async function test() {
  const { data: conv } = await supabase
    .from('chat_conversations')
    .select('*, channel:chat_channels(name, api_url, api_token, provider)')
    .ilike('contact_phone', '%96360969%')
    .limit(1)
    .single();

  if (!conv) {
    console.log("No conversation found");
    return;
  }
  console.log("Conversation contact_avatar_url:", conv.contact_avatar_url);

  // Now let's try calling Evolution manually
  const { channel, contact_phone } = conv;
  
  const cleanUrl = channel.api_url.endsWith('/') ? channel.api_url.slice(0, -1) : channel.api_url;
  const numberClean = contact_phone.replace(/@.*$/, '');
  const numberJid = numberClean + '@s.whatsapp.net';

  const combinations = [
    { method: 'GET', url: `${cleanUrl}/chat/fetchProfilePictureUrl/${channel.name}?number=${numberClean}`, body: null },
    { method: 'GET', url: `${cleanUrl}/chat/fetchProfilePictureUrl/${channel.name}?number=${numberJid}`, body: null },
    { method: 'POST', url: `${cleanUrl}/chat/fetchProfilePictureUrl/${channel.name}`, body: { number: numberClean } },
    { method: 'POST', url: `${cleanUrl}/chat/fetchProfilePictureUrl/${channel.name}`, body: { number: numberJid } }
  ];

  for (const combo of combinations) {
    console.log(`\nTrying ${combo.method} ${combo.url}`);
    try {
       const opts: any = { method: combo.method, headers: { 'apikey': channel.api_token, 'Content-Type': 'application/json' } };
       if (combo.body) opts.body = JSON.stringify(combo.body);
       const res = await fetch(combo.url, opts);
       const text = await res.text();
       console.log(`STATUS: ${res.status}`);
       console.log(`BODY: ${text.substring(0, 100)}...`);
    } catch (e: any) {
       console.log(`ERROR: ${e.message}`);
    }
  }

  console.log('\nFinished tests');
}

test().catch(console.error);
