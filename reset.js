const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const envFile = fs.readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(
  envFile.split('\n')
  .filter(line => line && !line.startsWith('#'))
  .map(line => {
    const idx = line.indexOf('=');
    return [line.slice(0, idx), line.slice(idx + 1).trim()];
  })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetPass() {
    console.log("Resetting for user ee4320ae-2d42-419e-a4a1-6f30f41d3680...")
    const { data, error } = await supabase.auth.admin.updateUserById(
      'ee4320ae-2d42-419e-a4a1-6f30f41d3680',
      { password: 'stkrt@2026', email_confirm: true }
    )
    if (error) console.error("Error modifying target user", error)
    else console.log("Success! Password updated to stkrt@2026")
}

resetPass();
