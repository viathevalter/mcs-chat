const { Client } = require('pg');
const prodConnStr = 'postgresql://postgres.unbepkdzvsfvylnysrcq:Stkrt%402026%23%40%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

async function fix() {
  const client = new Client({ connectionString: prodConnStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Ensuring all chat_channels columns exist...');
  
  await client.query(`
    ALTER TABLE public.chat_channels
      ADD COLUMN IF NOT EXISTS ai_agent_id UUID REFERENCES public.chat_ai_agents(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES core_common.empresas(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS company_name TEXT,
      ADD COLUMN IF NOT EXISTS auto_reject_calls BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.mcs_departments(id) ON DELETE SET NULL;

    -- Make sure all admin users or users without restrictions have super_admin
    UPDATE public.mcs_users 
    SET role = 'super_admin'
    WHERE role IS NULL OR role = 'user' OR email ILIKE '%valter%';

    -- If no user exists for valter, ensure auth user is synced to mcs_users
    INSERT INTO public.mcs_users (id, email, display_name, role, active)
    SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', email), 'super_admin', true
    FROM auth.users
    ON CONFLICT (id) DO UPDATE SET role = 'super_admin', active = true;

    NOTIFY pgrst, 'reload schema';
  `);

  const cols = await client.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'chat_channels'
  `);
  console.log('chat_channels columns:', cols.rows.map(r => r.column_name));

  const users = await client.query('SELECT id, email, role, display_name FROM public.mcs_users');
  console.log('mcs_users list:', users.rows);

  await client.end();
}

fix().catch(console.error);
