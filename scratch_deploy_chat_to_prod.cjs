const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const prodConnectionStrings = [
  'postgresql://postgres.unbepkdzvsfvylnysrcq:Stkrt%402026%23%40%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres'
];

async function run() {
  const client = new Client({ connectionString: prodConnectionStrings[0], ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log("Connected to PROD DB!");

    const sql = fs.readFileSync(path.join(__dirname, 'supabase', 'migrations', '20260401000000_add_avatar_url.sql'), 'utf8');
    await client.query(sql);
    console.log("-> Successfully executed 20260401000000_add_avatar_url.sql");

    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'chat_%'
    `);
    console.log("\nAll Chat tables in PROD DB:", tablesRes.rows.map(r => r.table_name));

  } catch (err) {
    console.error("Migration Error:", err.message);
  } finally {
    await client.end();
  }
}

run();
