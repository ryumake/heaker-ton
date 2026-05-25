const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/app\.get\("\/api\/profile\/me", \(req, res\) => {/g, 'app.get("/api/profile/me", async (req, res) => {');
code = code.replace(/app\.post\("\/api\/profile\/me", \(req, res\) => {/g, 'app.post("/api/profile/me", async (req, res) => {');
code = code.replace(/app\.get\("\/api\/survey\/me", \(req, res\) => {/g, 'app.get("/api/survey/me", async (req, res) => {');
code = code.replace(/app\.post\("\/api\/survey", \(req, res\) => {/g, 'app.post("/api/survey", async (req, res) => {');
code = code.replace(/app\.delete\("\/api\/survey\/me", \(req, res\) => {/g, 'app.delete("/api/survey/me", async (req, res) => {');

code = code.replace(/const profile = upsertProfile\(req\);/g, 'const profile = await upsertProfile(req);');
code = code.replace(/const current = upsertProfile\(req\);/g, 'const current = await upsertProfile(req);');
code = code.replace(/const profile = upsertProfile\(req, {/g, 'const profile = await upsertProfile(req, {');
code = code.replace(/const nextProfile = upsertProfile\(req, {/g, 'const nextProfile = await upsertProfile(req, {');

fs.writeFileSync('server.js', code);
console.log('Fixed async upsertProfile calls');
