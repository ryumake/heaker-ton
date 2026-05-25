const fs = require('fs');
const lines = fs.readFileSync('server.js', 'utf8').split('\n');
lines.forEach((l, i) => { if(l.includes('app.get(')) console.log((i+1) + ': ' + l.trim()); });
