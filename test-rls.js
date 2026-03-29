import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase.rpc('get_policies', {}) // Won't work without custom RPC
  // Wait, let's just use raw query on pg_policies
  // actually, service_role can query `pg_policies`? No, it's not exposed over PostgREST standard unless mapped.
}
check()
