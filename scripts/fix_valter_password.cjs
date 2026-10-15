const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const prodConnStr = 'postgresql://postgres.unbepkdzvsfvylnysrcq:Stkrt%402026%23%40%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';
const url = 'https://unbepkdzvsfvylnysrcq.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYmVwa2R6dnNmdnlsbnlzcmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNTMzOTEsImV4cCI6MjA4OTkyOTM5MX0.WNFoECndTbEYSC23SBJQt3a7ut4qnCMeeubfy6K-6Vw';

async function fix() {
  const client = new Client({ connectionString: prodConnStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('Updating password for valter@gestaologinpro.com...');
  await client.query(`
    UPDATE auth.users 
    SET encrypted_password = crypt('stkrt@2026', gen_salt('bf', 10)),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        banned_until = NULL,
        raw_app_meta_data = raw_app_meta_data || '{"provider": "email", "providers": ["email"]}'::jsonb,
        updated_at = now()
    WHERE email ILIKE '%valter@gestaologinpro.com%';
  `);

  const res = await client.query("SELECT id, email, encrypted_password, email_confirmed_at FROM auth.users WHERE email ILIKE '%valter%'");
  console.log('Updated user in DB:', res.rows[0]);
  await client.end();

  // Test with Supabase Client
  const supabase = createClient(url, anonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'valter@gestaologinpro.com',
    password: 'stkrt@2026'
  });

  console.log('Login verification:', data?.user ? 'LOGIN SUCCESSFUL!' : 'LOGIN FAILED:', error);
}

fix().catch(console.error);
