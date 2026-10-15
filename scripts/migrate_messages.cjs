const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const oldUrl = 'https://pyahcgorkvwfwmlzspnv.supabase.co';
const oldKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5YWhjZ29ya3Z3ZndtbHpzcG52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0Njc1NiwiZXhwIjoyMDg1NjIyNzU2fQ.W6SiuXciHW2yxWk4D7nRZRHxXHbqoy_shP6IYcw9ahs';

const prodConnStr = 'postgresql://postgres.unbepkdzvsfvylnysrcq:Stkrt%402026%23%40%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

async function migrateByConversation() {
  console.log('--- Starting Fast Messages Migration by Conversation ---');
  
  const oldSupabase = createClient(oldUrl, oldKey);
  const prodClient = new Client({ connectionString: prodConnStr, ssl: { rejectUnauthorized: false } });
  await prodClient.connect();

  // Fetch all conversation IDs from Prod DB
  const convsRes = await prodClient.query('SELECT id FROM public.chat_conversations');
  const convs = convsRes.rows;
  console.log(`Found ${convs.length} conversations to migrate messages for.`);

  let totalMsgs = 0;
  let convCount = 0;

  for (const c of convs) {
    convCount++;
    try {
      const { data: msgs, error } = await oldSupabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', c.id)
        .order('created_at', { ascending: true });

      if (msgs && msgs.length > 0) {
        for (const m of msgs) {
          try {
            await prodClient.query(`
              INSERT INTO public.chat_messages (
                id, conversation_id, direction, message_type, content, media_url,
                status, external_id, sender_name, created_at, quoted, is_private
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              ON CONFLICT (id) DO NOTHING;
            `, [
              m.id,
              m.conversation_id,
              m.direction || 'inbound',
              m.message_type || 'text',
              m.content || '',
              m.media_url || null,
              m.status || 'delivered',
              m.external_id || null,
              m.sender_name || null,
              m.created_at || new Date().toISOString(),
              m.quoted || null,
              m.is_private || false
            ]);
            totalMsgs++;
          } catch (e) {}
        }
      }

      if (convCount % 25 === 0 || convCount === convs.length) {
        console.log(`Progress: [${convCount}/${convs.length}] conversations processed. ${totalMsgs} messages inserted.`);
      }
    } catch (err) {
      console.warn(`Error on conv ${c.id}:`, err.message);
    }
  }

  console.log(`=== Fast Messages Migration Complete! Inserted ${totalMsgs} messages across ${convCount} conversations! ===`);
  await prodClient.end();
}

migrateByConversation().catch(console.error);
