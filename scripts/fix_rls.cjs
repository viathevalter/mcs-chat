const { Client } = require('pg');
const prodConnStr = 'postgresql://postgres.unbepkdzvsfvylnysrcq:Stkrt%402026%23%40%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

async function fixRLS() {
  const client = new Client({ connectionString: prodConnStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Updating RLS policies...');

  await client.query(`
    -- chat_ai_agents
    ALTER TABLE public.chat_ai_agents ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow all on chat_ai_agents" ON public.chat_ai_agents;
    DROP POLICY IF EXISTS "Allow authenticated all chat_ai_agents" ON public.chat_ai_agents;
    CREATE POLICY "Allow all on chat_ai_agents" ON public.chat_ai_agents FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    -- chat_channels
    ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow all on chat_channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Allow authenticated all access chat_channels" ON public.chat_channels;
    DROP POLICY IF EXISTS "Allow authenticated read access chat_channels" ON public.chat_channels;
    CREATE POLICY "Allow all on chat_channels" ON public.chat_channels FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    -- chat_conversations
    ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow all on chat_conversations" ON public.chat_conversations;
    DROP POLICY IF EXISTS "Allow authenticated all access chat_conversations" ON public.chat_conversations;
    DROP POLICY IF EXISTS "Allow authenticated read access chat_conversations" ON public.chat_conversations;
    CREATE POLICY "Allow all on chat_conversations" ON public.chat_conversations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    -- chat_messages
    ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow all on chat_messages" ON public.chat_messages;
    DROP POLICY IF EXISTS "Allow authenticated all access chat_messages" ON public.chat_messages;
    DROP POLICY IF EXISTS "Allow authenticated read access chat_messages" ON public.chat_messages;
    CREATE POLICY "Allow all on chat_messages" ON public.chat_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    -- mcs_departments
    ALTER TABLE public.mcs_departments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow all on mcs_departments" ON public.mcs_departments;
    CREATE POLICY "Allow all on mcs_departments" ON public.mcs_departments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    NOTIFY pgrst, 'reload schema';
  `);

  console.log('RLS policies updated and PostgREST schema cache reloaded!');
  await client.end();
}

fixRLS().catch(console.error);
