const { createClient } = require('@supabase/supabase-js');

const url = 'https://unbepkdzvsfvylnysrcq.supabase.co';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYmVwa2R6dnNmdnlsbnlzcmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNTMzOTEsImV4cCI6MjA4OTkyOTM5MX0.WNFoECndTbEYSC23SBJQt3a7ut4qnCMeeubfy6K-6Vw';

const supabase = createClient(url, anonKey);

async function test() {
  console.log("Testing connection to PROD Supabase...");
  
  const { data: workers, error: wErr } = await supabase
    .schema('core_personal')
    .from('workers')
    .select('id, nome, status_trabajador')
    .limit(5);

  console.log("PROD Workers (core_personal.workers):", workers, "Error:", wErr);

  const { data: companies, error: cErr } = await supabase
    .schema('core_common')
    .from('empresas')
    .select('id, nome')
    .limit(5);

  console.log("PROD Companies (core_common.empresas):", companies, "Error:", cErr);

  const { data: channels, error: chErr } = await supabase
    .from('chat_channels')
    .select('*');

  console.log("PROD Chat Channels:", channels, "Error:", chErr);
}

test();
