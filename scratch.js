import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://pyahcgorkvwfwmlzspnv.supabase.co'
const supabaseKey = 'insert_service_role_key_here' // I'll inject the real one from env
const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
    console.log("Altering table...");
}
run()
