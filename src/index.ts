import express from 'express';
import client from 'prom-client';

const app = express();
const port = 3000;

// Configuração padrão do prom-client (coleta métricas da própria JVM do Node: CPU, memória, etc)
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

// 1. Contador de Requisições
const httpRequestCounter = new client.Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP recebidas',
  labelNames: ['method', 'route', 'status_code']
});

// 2. Histograma de Duração (Latência)
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.2, 0.5, 1, 2, 5] // Divisões de tempo em segundos
});

// Middleware para interceptar todas as requisições e medir o tempo e contar
app.use((req, res, next) => {
  const end = httpRequestDurationMicroseconds.startTimer();
  res.on('finish', () => {
    // Incrementa contador
    httpRequestCounter.labels(req.method, req.route ? req.route.path : req.path, res.statusCode.toString()).inc();
    // Finaliza timer do histograma
    end({ method: req.method, route: req.route ? req.route.path : req.path, status_code: res.statusCode.toString() });
  });
  next();
});

// Rota raiz - saudável e rápida
app.get('/', (req, res) => {
  res.status(200).send('API de Demonstração de Observabilidade rodando!');
});

// Rota de processamento - Simula uma latência variável
app.get('/api/data', async (req, res) => {
  // Gera um delay aleatório entre 50ms e 500ms
  const delay = Math.floor(Math.random() * 450) + 50;
  
  await new Promise(resolve => setTimeout(resolve, delay));
  
  // Chance de 5% de dar erro aleatório
  if (Math.random() < 0.05) {
    res.status(500).json({ error: 'Erro interno aleatório durante o processamento' });
    return;
  }

  res.status(200).json({ data: 'Dados processados com sucesso', delay_ms: delay });
});

// Rota de erro - Sempre retorna erro para simular falhas massivas
app.get('/api/error', (req, res) => {
  res.status(500).json({ error: 'Erro fatal forçado pelo usuário' });
});

// Rota onde o Prometheus vai bater para ler as métricas
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', client.register.contentType);
  res.end(await client.register.metrics());
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${port} e aceitando conexões de fora do container`);
  console.log(`Métricas disponíveis em http://localhost:${port}/metrics`);
});
