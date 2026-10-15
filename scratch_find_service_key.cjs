const fs = require('fs');
const path = require('path');

function searchDir(dir) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file === 'node_modules' || file === '.git' || file === '.next' || file === 'dist') continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        searchDir(fullPath);
      } else if (file.includes('.env') || file.includes('secrets') || file.includes('check_') || file.includes('.json')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('service_role') || content.includes('SERVICE_ROLE')) {
            console.log("Found in:", fullPath);
            const lines = content.split('\n');
            lines.forEach(l => {
              if (l.includes('service_role') || l.includes('SERVICE_ROLE')) {
                console.log("  ->", l.trim());
              }
            });
          }
        } catch (e) {}
      }
    }
  } catch (e) {}
}

console.log("Searching for Service Role Keys in c:/Projetos IA/Kotrik ...");
searchDir('c:/Projetos IA/Kotrik');
