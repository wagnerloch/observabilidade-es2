const http = require('http');

console.log('Iniciando script de simulação de carga NORMAL...');
console.log('Este script enviará requisições constantes para a rota saudável (/) e para a rota de dados (/api/data).');
console.log('Pressione Ctrl+C para parar.\n');

const endpoints = [
  { path: '/', weight: 3 },       // 75% de chance
  { path: '/api/data', weight: 1 } // 25% de chance
];

function makeRequest(path) {
  const options = {
    hostname: '127.0.0.1',
    port: 3000,
    path: path,
    method: 'GET'
  };

  const req = http.request(options, (res) => {
    res.on('data', () => { });
    res.on('end', () => { });
  });

  req.on('error', (e) => {
    console.error(`Problema com a requisição (${path}): ${e.message}`);
  });

  req.end();
}

function simulateTraffic() {
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

  makeRequest(selectedPath);

  const delay = Math.floor(Math.random() * 50) + 50;
  setTimeout(simulateTraffic, delay);
}

for (let i = 0; i < 5; i++) {
  simulateTraffic();
}
