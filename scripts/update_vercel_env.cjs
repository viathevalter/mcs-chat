const { execSync } = require('child_process');

const prodUrl = 'https://unbepkdzvsfvylnysrcq.supabase.co';
const prodAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYmVwa2R6dnNmdnlsbnlzcmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNTMzOTEsImV4cCI6MjA4OTkyOTM5MX0.WNFoECndTbEYSC23SBJQt3a7ut4qnCMeeubfy6K-6Vw';
const prodServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuYmVwa2R6dnNmdnlsbnlzcmNxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDM1MzM5MSwiZXhwIjoyMDg5OTI5MzkxfQ.i2_Rz6fP6n62q6hV3aXw67kOQ43a7K3YdG1YvL_nZ9A';

console.log('--- Updating Vercel Production Environment Variables ---');

function updateProdEnv(name, value) {
  try { execSync(`npx vercel env rm ${name} production -y`, { stdio: 'ignore' }); } catch (e) {}
  execSync(`npx vercel env add ${name} production --value "${value}" --yes`, { stdio: 'inherit' });
  console.log(`Updated ${name} in Production`);
}

updateProdEnv('NEXT_PUBLIC_SUPABASE_URL', prodUrl);
updateProdEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', prodAnonKey);
updateProdEnv('SUPABASE_SERVICE_ROLE_KEY', prodServiceKey);

console.log('--- Vercel Production Environment Variables 100% Updated! ---');
