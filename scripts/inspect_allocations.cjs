const { Client } = require('pg');
const prodConnStr = 'postgresql://postgres.unbepkdzvsfvylnysrcq:Stkrt%402026%23%40%23@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';

async function inspect() {
  const client = new Client({ connectionString: prodConnStr, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const wrkRes = await client.query("SELECT * FROM core_personal.workers WHERE nome ILIKE '%JHONNY%RAFAEL%'");
  console.log('Worker Jhonny columns & values:', wrkRes.rows[0]);

  const tablesRes = await client.query(`
    SELECT table_schema, table_name 
    FROM information_schema.tables 
    WHERE table_name LIKE '%alocac%' OR table_name LIKE '%pedido%' OR table_name LIKE '%allocat%' OR table_name LIKE '%obra%' OR table_name LIKE '%reemplazo%'
  `);
  console.log('Matching tables:', tablesRes.rows);

  if (wrkRes.rows[0]) {
    const workerId = wrkRes.rows[0].id;
    // Check tables with worker_id
    const colTables = await client.query(`
      SELECT table_schema, table_name, column_name 
      FROM information_schema.columns 
      WHERE column_name = 'worker_id' OR column_name = 'colaborador_id'
    `);
    console.log('Tables with worker_id column:', colTables.rows);

    for (const t of colTables.rows) {
      try {
        const rows = await client.query(`SELECT * FROM ${t.table_schema}.${t.table_name} WHERE ${t.column_name} = $1 LIMIT 3`, [workerId]);
        if (rows.rows.length > 0) {
          console.log(`Found data in ${t.table_schema}.${t.table_name}:`, rows.rows);
        }
      } catch(e) {}
    }
  }

  await client.end();
}

inspect().catch(console.error);
