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
  const cleanNumber = contact_phone;

  console.log(`Trying GET ${cleanUrl}/chat/fetchProfilePictureUrl/${channel.name}?number=${cleanNumber}`);
  const res1 = await fetch(`${cleanUrl}/chat/fetchProfilePictureUrl/${channel.name}?number=${cleanNumber}`, {
     headers: { 'apikey': channel.api_token }
  });
  console.log('GET STATUS:', res1.status);
  const text1 = await res1.text();
  console.log('GET BODY:', text1);
  
  console.log(`Trying POST ${cleanUrl}/chat/fetchProfilePictureUrl/${channel.name}`);
  const res2 = await fetch(`${cleanUrl}/chat/fetchProfilePictureUrl/${channel.name}`, {
     method: 'POST',
     headers: { 'apikey': channel.api_token, 'Content-Type': 'application/json' },
     body: JSON.stringify({ number: cleanNumber })
  });
  console.log('POST STATUS:', res2.status);
  const text2 = await res2.text();
  console.log('POST BODY:', text2);

  console.log('Finished tests');
}

test().catch(console.error);
