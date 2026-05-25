const fs = require('fs');
const html = fs.readFileSync('public/Self_Inspection3.html', 'utf8');
const lines = html.split('\n');
const ids = [];
for (const line of lines) {
  const match = line.match(/id="question-([^"]+)"/);
  if (match) {
    ids.push(match[1]);
  }
}
console.log('Question IDs:', ids);
