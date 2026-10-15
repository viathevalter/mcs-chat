const { Client } = require('pg');
const prodConnStr = 'postgresql://postgres.unbepkdzvsfvylnysrcq:Stkrt%402026%23%40%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

async function fix() {
  const client = new Client({ connectionString: prodConnStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Checking chat_ai_agents schema...');
  
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.chat_ai_agents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      description TEXT,
      system_prompt TEXT NOT NULL,
      rules JSONB DEFAULT '[]'::jsonb,
      llm_model TEXT DEFAULT 'gemini-1.5-flash',
      temperature NUMERIC DEFAULT 0.3,
      department_id UUID REFERENCES public.mcs_departments(id) ON DELETE SET NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );

    ALTER TABLE public.chat_ai_agents 
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.mcs_departments(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS rules JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS llm_model TEXT DEFAULT 'gemini-1.5-flash',
      ADD COLUMN IF NOT EXISTS temperature NUMERIC DEFAULT 0.3,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

    ALTER TABLE public.chat_ai_agents ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Allow authenticated all chat_ai_agents" ON public.chat_ai_agents;
    CREATE POLICY "Allow authenticated all chat_ai_agents" ON public.chat_ai_agents FOR ALL TO authenticated USING (true) WITH CHECK (true);

    -- Reload PostgREST schema cache
    NOTIFY pgrst, 'reload schema';
  `);

  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'chat_ai_agents'
  `);
  console.log('Updated columns in chat_ai_agents:', cols.rows);

  await client.end();
  console.log('Schema fixed and PostgREST schema cache reloaded successfully!');
}

fix().catch(console.error);
