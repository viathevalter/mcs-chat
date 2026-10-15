const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const oldUrl = 'https://pyahcgorkvwfwmlzspnv.supabase.co';
const oldKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB5YWhjZ29ya3Z3ZndtbHpzcG52Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDA0Njc1NiwiZXhwIjoyMDg1NjIyNzU2fQ.W6SiuXciHW2yxWk4D7nRZRHxXHbqoy_shP6IYcw9ahs';

const prodConnStr = 'postgresql://postgres.unbepkdzvsfvylnysrcq:Stkrt%402026%23%40%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

async function migrate() {
  console.log('--- Starting Migration from Old DB to Production DB ---');
  
  const oldSupabase = createClient(oldUrl, oldKey);
  const prodClient = new Client({ connectionString: prodConnStr, ssl: { rejectUnauthorized: false } });
  await prodClient.connect();

  // 1. Ensure Columns exist in Production
  console.log('Ensuring table columns in Production...');
  await prodClient.query(`
    ALTER TABLE public.chat_channels 
      ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT 'uazapi',
      ADD COLUMN IF NOT EXISTS api_url TEXT,
      ADD COLUMN IF NOT EXISTS api_token TEXT,
      ADD COLUMN IF NOT EXISTS gateway_id UUID,
      ADD COLUMN IF NOT EXISTS status_detail TEXT,
      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES core_common.empresas(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS company_name TEXT,
      ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES public.chat_ai_agents(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS instance_name TEXT,
      ADD COLUMN IF NOT EXISTS instance_token TEXT,
      ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'connected',
      ADD COLUMN IF NOT EXISTS qrcode_base64 TEXT;

    ALTER TABLE public.chat_conversations
      ADD COLUMN IF NOT EXISTS contact_avatar_url TEXT,
      ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.mcs_departments(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS bot_status TEXT DEFAULT 'active',
      ADD COLUMN IF NOT EXISTS ai_summary TEXT,
      ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'pt';
  `);
  console.log('Columns verified!');

  // 2. Fetch Companies & Departments from Production
  const empsRes = await prodClient.query('SELECT id, codigo, trade_name, nome FROM core_common.empresas');
  const companies = empsRes.rows;
  console.log(`Loaded ${companies.length} companies from Prod.`);

  const deptsRes = await prodClient.query('SELECT id, name FROM public.mcs_departments WHERE active = true');
  const departments = deptsRes.rows;
  console.log(`Loaded ${departments.length} departments from Prod.`);

  const rhDept = departments.find(d => d.name.toLowerCase().includes('recursos') || d.name.toLowerCase() === 'rh');
  const comDept = departments.find(d => d.name.toLowerCase().includes('comercial'));

  // 3. Fetch all channels from Old DB
  const { data: oldChannels, error: chErr } = await oldSupabase.from('chat_channels').select('*');
  if (chErr || !oldChannels) {
    console.error('Error fetching old channels:', chErr);
    return;
  }
  console.log(`Fetched ${oldChannels.length} channels from old DB.`);

  // Migrate Channels
  for (const ch of oldChannels) {
    let matchedCompany = null;
    const chNameLower = ch.name.toLowerCase();

    if (chNameLower.includes('luminous')) {
      matchedCompany = companies.find(c => (c.trade_name || c.nome).toLowerCase().includes('luminous'));
    } else if (chNameLower.includes('stocco')) {
      matchedCompany = companies.find(c => (c.trade_name || c.nome).toLowerCase().includes('stocco'));
    } else if (chNameLower.includes('wiseowe')) {
      matchedCompany = companies.find(c => (c.trade_name || c.nome).toLowerCase().includes('wiseowe'));
    } else if (chNameLower.includes('triangulo')) {
      matchedCompany = companies.find(c => (c.trade_name || c.nome).toLowerCase().includes('triangulo'));
    } else if (chNameLower.includes('kotrik')) {
      matchedCompany = companies.find(c => (c.trade_name || c.nome).toLowerCase().includes('kotrik'));
    }

    const defaultDept = chNameLower.includes('cliente') ? comDept?.id : rhDept?.id;

    await prodClient.query(`
      INSERT INTO public.chat_channels (
        id, name, phone_number, department_id, is_active, created_at, updated_at,
        provider, api_url, api_token, company_id, company_name, instance_name, instance_token, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        company_id = EXCLUDED.company_id,
        company_name = EXCLUDED.company_name,
        api_url = EXCLUDED.api_url,
        api_token = EXCLUDED.api_token,
        status = EXCLUDED.status,
        department_id = COALESCE(chat_channels.department_id, EXCLUDED.department_id);
    `, [
      ch.id,
      ch.name,
      ch.phone_number || null,
      defaultDept || null,
      ch.is_active !== false,
      ch.created_at || new Date().toISOString(),
      ch.updated_at || new Date().toISOString(),
      ch.provider || 'uazapi',
      ch.api_url || 'https://mcs-chat.uazapi.com',
      ch.api_token || null,
      matchedCompany?.id || null,
      matchedCompany?.trade_name || matchedCompany?.nome || null,
      ch.name,
      ch.api_token || null,
      'connected'
    ]);
  }
  console.log('-> Successfully migrated channels to Prod DB.');

  // 4. Fetch workers from Production safely
  let workers = [];
  try {
    const colsRes = await prodClient.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'core_personal' AND table_name = 'workers'
    `);
    const colNames = colsRes.rows.map(r => r.column_name);
    console.log('Worker table column names:', colNames);

    const phoneCol = colNames.includes('movil') ? 'movil' : (colNames.includes('telefono') ? 'telefono' : null);
    if (phoneCol) {
      const wrksRes = await prodClient.query(`SELECT id, nome, ${phoneCol} as phone FROM core_personal.workers WHERE ${phoneCol} IS NOT NULL`);
      workers = wrksRes.rows;
      console.log(`Loaded ${workers.length} workers from Prod using column "${phoneCol}".`);
    }
  } catch (err) {
    console.warn('Could not query workers for phone matching:', err.message);
  }

  const workerPhoneMap = new Map();
  for (const w of workers) {
    if (w.phone) {
      const clean = String(w.phone).replace(/\D/g, '');
      if (clean.length >= 8) {
        workerPhoneMap.set(clean.slice(-8), w);
      }
    }
  }

  // 5. Migrate Conversations in Batches
  let from = 0;
  const pageSize = 100;
  let totalConvs = 0;

  while (true) {
    const { data: convs, error: convErr } = await oldSupabase
      .from('chat_conversations')
      .select('*')
      .range(from, from + pageSize - 1)
      .order('created_at', { ascending: true });

    if (convErr || !convs || convs.length === 0) break;

    for (const c of convs) {
      // Find matching worker
      let matchedWorker = null;
      if (c.contact_phone) {
        const cleanPhone = String(c.contact_phone).replace(/\D/g, '');
        if (cleanPhone.length >= 8) {
          matchedWorker = workerPhoneMap.get(cleanPhone.slice(-8));
        }
      }

      await prodClient.query(`
        INSERT INTO public.chat_conversations (
          id, channel_id, worker_id, contact_phone, contact_name, status,
          unread_count, last_message_at, created_at, updated_at, contact_avatar_url,
          is_pinned, tags, department_id, bot_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (id) DO UPDATE SET
          worker_id = COALESCE(chat_conversations.worker_id, EXCLUDED.worker_id),
          contact_name = COALESCE(EXCLUDED.contact_name, chat_conversations.contact_name),
          last_message_at = EXCLUDED.last_message_at,
          department_id = COALESCE(chat_conversations.department_id, EXCLUDED.department_id);
      `, [
        c.id,
        c.channel_id,
        matchedWorker?.id || c.worker_id || null,
        c.contact_phone,
        matchedWorker?.nome || c.contact_name || 'Contato WhatsApp',
        c.status || 'open',
        c.unread_count || 0,
        c.last_message_at || c.created_at || new Date().toISOString(),
        c.created_at || new Date().toISOString(),
        c.updated_at || new Date().toISOString(),
        c.contact_avatar_url || null,
        c.is_pinned || false,
        JSON.stringify(c.tags || []),
        rhDept?.id || null,
        'active'
      ]);
      totalConvs++;
    }

    from += pageSize;
    if (convs.length < pageSize) break;
  }
  console.log(`-> Successfully migrated ${totalConvs} conversations.`);

  // 6. Migrate Messages in Batches
  let msgFrom = 0;
  const msgPageSize = 500;
  let totalMsgs = 0;

  while (true) {
    const { data: msgs, error: msgErr } = await oldSupabase
      .from('chat_messages')
      .select('*')
      .range(msgFrom, msgFrom + msgPageSize - 1)
      .order('created_at', { ascending: true });

    if (msgErr || !msgs || msgs.length === 0) break;

    for (const m of msgs) {
      try {
        await prodClient.query(`
          INSERT INTO public.chat_messages (
            id, conversation_id, direction, message_type, content, media_url,
            status, external_id, sender_name, created_at, is_private
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING;
        `, [
          m.id,
          m.conversation_id,
          m.direction || 'inbound',
          m.message_type || 'text',
          m.content || '',
          m.media_url || null,
          m.status || 'sent',
          m.external_id || null,
          m.sender_name || null,
          m.created_at || new Date().toISOString(),
          m.is_private || false
        ]);
        totalMsgs++;
      } catch (err) {
        // Ignore single message conflict / orphan
      }
    }

    console.log(`Migrated ${totalMsgs} messages so far...`);
    msgFrom += msgPageSize;
    if (msgs.length < msgPageSize) break;
  }

  console.log(`=== MIGRATION COMPLETE! Migrated ${oldChannels.length} channels, ${totalConvs} conversations, and ${totalMsgs} messages to Production Supabase! ===`);
  await prodClient.end();
}

migrate().catch(console.error);
