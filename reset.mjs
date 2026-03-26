import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function resetPass() {
    console.log("Resetting for user ee4320ae-2d42-419e-a4a1-6f30f41d3680...")
    const { data, error } = await supabase.auth.admin.updateUserById(
      'ee4320ae-2d42-419e-a4a1-6f30f41d3680',
      { password: 'stkrt@2026' }
    )
    if (error) console.error(error)
    else console.log("Success! Password updated to stkrt@2026")
}

resetPass()
