const fetch = require('node-fetch');
async function run() {
  const res = await fetch('http://localhost:3000/api/ai/search-orchestrator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: 'BMW', limit: 30 })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
