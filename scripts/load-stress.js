const http = require('http');

console.log('⚠️ INICIANDO SCRIPT DE ESTRESSE ⚠️');
console.log('Este script simulará alta concorrência contínua e aleatória, forçando gargalos e erros 500.');
console.log('Pressione Ctrl+C para parar.\n');

const endpoints = [
  { path: '/', weight: 2 },         // Rota normal
  { path: '/api/data', weight: 5 }, // Causa gargalo de processamento
  { path: '/api/error', weight: 3 } // Causa picos de erro 500
];

const agent = new http.Agent({ keepAlive: true, maxSockets: 100 });

function makeRequest(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3000,
      path: path,
      method: 'GET',
      agent: agent,
      timeout: 5000
    };

    const req = http.request(options, (res) => {
      res.on('data', () => { });
      res.on('end', resolve);
    });

    req.on('error', () => {
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      resolve();
    });

    req.end();
  });
}

async function simulateStress() {
  const totalWeight = endpoints.reduce((acc, curr) => acc + curr.weight, 0);
  let random = Math.random() * totalWeight;
  let selectedPath = '/';

  for (const endpoint of endpoints) {
    if (random < endpoint.weight) {
      selectedPath = endpoint.path;
      break;
    }
    random -= endpoint.weight;
  }

  await makeRequest(selectedPath);

  const delay = Math.floor(Math.random() * 100);
  setTimeout(simulateStress, delay);
}

const CONCURRENCY = 50;
for (let i = 0; i < CONCURRENCY; i++) {
  setTimeout(simulateStress, Math.random() * 1000);
}
