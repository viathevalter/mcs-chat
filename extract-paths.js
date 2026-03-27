const fs = require('fs');

const content = fs.readFileSync('docs/uazapi-openapi-spec.yaml', 'utf8');

const lines = content.split('\n');
let currentPath = '';

for (const line of lines) {
  const matchPath = line.match(/^  (\/[a-zA-Z0-9_/{}-]+):/);
  if (matchPath) {
    currentPath = matchPath[1];
  }
  
  const matchMethod = line.match(/^    post:/);
  if (matchMethod) {
    console.log(currentPath);
  }
}
