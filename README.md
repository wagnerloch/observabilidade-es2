# 🍕 Pizzaria Observável — Observabilidade na Prática

Projeto prático da disciplina de **Engenharia de Software II**. Você vai subir, com um único comando, uma aplicação de microsserviços **já instrumentada** e a stack de observabilidade usada em empresas reais:

| Ferramenta | Pilar | O que faz aqui |
|---|---|---|
| **Prometheus** | Métricas | Coleta (*scrape*) o `/metrics` de cada serviço a cada 5 s e guarda séries temporais |
| **Loki** | Logs | Recebe os logs estruturados (JSON) dos serviços e permite consultá-los com LogQL |
| **Tempo** | Traces | Recebe os *spans* via OpenTelemetry e remonta o caminho de cada requisição entre os serviços |
| **Grafana** | Visualização | Consulta as três fontes em um só lugar — e já vem com um dashboard pronto |

Seu trabalho: **explorar** o dashboard pronto, **construir** o seu próprio dashboard e **investigar um incidente** usando métricas → logs → traces.

---

## Arquitetura

```
                    ┌──────────── Aplicação (Node.js + TypeScript) ────────────┐
 gerador-carga ──▶  │  pedidos :3000 ──▶ pagamentos                             │
 (clientes          │      │  └─ consultar_estoque (span "banco de dados")      │
  simulados)        │      └──────────▶ cozinha                                 │
                    └───────┬─────────────────────┬────────────────┬───────────┘
                    GET /metrics (pull)     logs JSON (push)   spans OTLP (push)
                            ▼                     ▼                ▼
                       Prometheus ◀── métricas ── Tempo           Loki
                            └───────────────┬─────┴────────────────┘
                                         Grafana :3001
```

Um pedido (`POST /pedidos`) passa por **3 serviços**. Cada etapa vira um *span*, e todos compartilham o mesmo `trace_id` — que também aparece em **cada linha de log** e nos **exemplars** das métricas de latência. É essa correlação que permite pular de um gráfico para o log e do log para o trace.

### Onde está a instrumentação (vale a leitura!)

| Arquivo | O que ensina |
|---|---|
| `app/src/metrics.ts` | Counter, Gauge e Histogram com `prom-client`; métricas técnicas **e de negócio**; cardinalidade de labels; exemplars |
| `app/src/logger.ts` | Log estruturado em JSON, injeção de `trace_id`, envio em lote para a API do Loki |
| `app/src/tracing.ts` | Auto-instrumentação com OpenTelemetry (Express, `fetch`) e propagação de contexto entre serviços |
| `app/src/pedidos.ts` | Span **manual** (`consultar_estoque`) com atributos e registro de exceção |

---

## Pré-requisitos

- **Docker** com **Docker Compose** (o Docker Desktop já inclui ambos) — nada mais. Não é preciso ter Node.js instalado.
- Cerca de **2 GB de RAM** livres e as portas **3000, 3001, 3100, 3200, 4318 e 9090** disponíveis.

## 1. Subindo tudo

Na pasta do projeto:

```bash
docker compose up -d --build
```

Na primeira vez as imagens são baixadas (alguns minutos). Confira se os 8 containers estão de pé:

```bash
docker compose ps
```

Aguarde ~1 minuto para os dados começarem a aparecer. O **gerador de carga** já envia cerca de 3 pedidos por segundo, o tempo todo.

| Serviço | Endereço |
|---|---|
| 🍕 Painel da Pizzaria (fazer pedidos, **Modo Caos**) | http://localhost:3000 |
| 📊 Grafana (sem login) | http://localhost:3001 |
| 🔥 Prometheus | http://localhost:9090 |
| Métricas cruas do serviço `pedidos` | http://localhost:3000/metrics |

---

## 2. Parte 1 — Explorando o dashboard pronto (≈ 20 min)

Abra o Grafana. A página inicial já é o dashboard **Pizzaria: Visão Geral** (pasta *Aula de Observabilidade*). Ele tem cinco seções: Negócio, Sinais de Ouro (RED), Logs, Traces e Saturação.

Responda, explorando o dashboard:

1. Qual o sabor mais pedido nos últimos 15 minutos? Mude o intervalo de tempo (canto superior direito) para 5 minutos — o gráfico de pizza muda? Por quê?
2. Passe o mouse sobre qualquer painel e aperte **`e`** (ou menu ⋮ → *Edit*). Leia a query. O que a função `rate()` faz com o contador `http_requests_total`?
3. No painel **Latência p95**, clique em um dos losangos ◆ (*exemplars*) e depois em **Abrir trace no Tempo**. Quantos serviços participaram dessa requisição? Qual etapa demorou mais?
4. No painel **Avisos e erros**, expanda uma linha de log. Qual é o motivo mais comum dos avisos? Clique em **Abrir trace no Tempo** de um deles.
5. Por que o painel **Taxa de erros 5xx** quase não registra nada, mesmo havendo pedidos recusados? (Dica: qual o status HTTP de um cartão recusado?)
6. Use o filtro **Serviço** no topo do dashboard. Quais painéis mudam e quais não mudam? Por quê?

---

## 3. Parte 2 — Construa o seu dashboard (≈ 40 min) ⭐ **tarefa principal**

Crie um **novo** dashboard: menu **Dashboards → New → New dashboard → Add visualization**. Dê a ele o nome **`Pizzaria — <seu nome>`**.

> 💡 Para cada painel: escolha a fonte de dados, escreva a query, escolha o **tipo de visualização** (lado direito, no topo), dê um **título** e ajuste a **unidade** (*Standard options → Unit*). Use o modo **Builder** se preferir montar a query clicando, ou **Code** para digitar.

Monte **pelo menos estes 6 painéis**:

| # | Painel | Fonte | Visualização | Pista |
|---|---|---|---|---|
| 1 | **Serviços no ar** (deve mostrar 3) | Prometheus | *Stat* | A métrica `up` vale 1 quando o Prometheus consegue coletar o alvo. Filtre por `job="pizzaria"` e some. Configure *Thresholds* para ficar vermelho abaixo de 3. |
| 2 | **Latência p99 por rota** do serviço `pedidos` | Prometheus | *Time series* | Adapte a query de p95 do dashboard pronto: troque o percentil e agrupe por `route` em vez de `service`. Unidade: segundos. |
| 3 | **% de pagamentos recusados** | Prometheus | *Gauge* | Use `pizzaria_pedidos_total` filtrando `resultado="pagamento_recusado"`, dividido pelo total de pedidos válidos. Unidade: *Percent (0-100)*. |
| 4 | **Erros por serviço (a partir dos logs)** | Loki | *Time series* (barras) | `count_over_time` sobre os logs com `level="error"`, agrupando por `service_name`. |
| 5 | **Logs de pagamentos recusados** | Loki | *Logs* | Filtre o stream do serviço `pagamentos` e use o filtro de linha `\|= "recusado"`. |
| 6 | **Preparos mais lentos da cozinha** | Tempo | *Table* | TraceQL: spans de nome `montar_pizza` do serviço `cozinha` com `duration > 100ms`. |

**Desafios (opcionais, valem bônus):**

- **Ticket médio (R$)**: faturamento ÷ pedidos confirmados nos últimos 5 minutos. Unidade *Currency → Real (R$)*.
- **Top 3 sabores na última hora** com `topk` em um painel *Bar gauge*.
- **Alerta**: crie uma regra de alerta (*Alerting → Alert rules*) que dispare quando a taxa de erros 5xx do serviço `pedidos` passar de 10% por 1 minuto. Teste usando o Modo Caos.
- Adicione um painel de **texto** (*Text*) explicando, com suas palavras, o que é cada pilar da observabilidade.

Ao terminar, **salve** o dashboard (ícone 💾 no topo).

---

## 4. Parte 3 — Investigação de incidente (≈ 20 min) 🔥

Em duplas: um colega abre o **Painel da Pizzaria** (http://localhost:3000) e, **sem contar ao outro**, coloca **um** serviço em modo `lento` ou `erros`. O outro investiga **só pelo Grafana**, usando o seu dashboard e o dashboard pronto.

Registre a investigação seguindo o caminho clássico:

1. **Detecção (métricas)** — Qual painel mostrou o problema primeiro? Qual sinal de ouro foi afetado: taxa, erros ou duração?
2. **Contexto (logs)** — Que mensagem de log explica o que está acontecendo? De qual serviço ela vem?
3. **Causa (traces)** — Abra um trace afetado. Qual *span* concentra o tempo ou o erro? Isso confirma o serviço suspeito?
4. **Impacto no negócio** — Quanto caiu o percentual de pedidos com sucesso? E os pedidos por minuto?

Depois, troquem os papéis. Rodem também o **teste de pico** e observem RPS, *Pedidos em andamento* e a latência:

```bash
docker compose run --rm estresse     # 40 pedidos/s por 90 segundos
```

> As linhas vermelhas verticais nos gráficos marcam quando alguém mudou o Modo Caos — elas são **anotações** vindas de uma consulta no Loki.

---

## 5. Entrega

Envie no ambiente da disciplina:

1. O **JSON do seu dashboard**: no dashboard, *Export → Export as JSON → Download file*.
2. Um **print** do dashboard durante um incidente (Parte 3).
3. As **respostas** das Partes 1 e 3 (texto curto, pode ser em tópicos).

---

## Colinha de consultas

**PromQL (Prometheus)**

```promql
rate(http_requests_total[1m])                          # requisições por segundo
sum by (service) (rate(http_requests_total[1m]))       # ... agrupado por serviço
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[1m])))
increase(pizzaria_faturamento_reais_total[1h])         # quanto um counter cresceu no período
```

**LogQL (Loki)**

```logql
{app="pizzaria", service_name="pedidos"}               # seleciona streams pelas labels
{app="pizzaria"} |= "recusado"                         # filtra pelo texto da linha
{app="pizzaria"} | json | sabor="calabresa"            # interpreta o JSON e filtra por campo
sum by (level) (count_over_time({app="pizzaria"}[1m])) # transforma logs em métrica
```

**TraceQL (Tempo)**

```traceql
{ resource.service.name = "pagamentos" }               # spans de um serviço
{ status = error }                                     # spans com erro
{ duration > 1s }                                      # spans lentos
{ span.pizzaria.sabor = "calabresa" && status = error }   # atributo de negócio
```

**Métricas disponíveis**: `http_requests_total`, `http_request_duration_seconds_*`, `pizzaria_pedidos_total` (labels `sabor`, `resultado`), `pizzaria_faturamento_reais_total`, `pizzaria_pedidos_em_andamento`, `pizzaria_pizzas_no_forno`, além das métricas padrão do Node.js (`process_*`, `nodejs_*`) e das geradas pelo Tempo (`traces_service_graph_*`, `traces_spanmetrics_*`).

---

## Problemas comuns

| Sintoma | O que fazer |
|---|---|
| Painéis com *No data* logo após subir | Espere 1–2 minutos. Confira `docker compose ps` e `docker compose logs -f pedidos`. |
| Porta já em uso | Pare o que estiver usando a porta, ou altere o lado **esquerdo** do mapeamento em `docker-compose.yml` (ex.: `"3002:3000"`). |
| Mapa de serviços vazio | Ele depende de métricas que o Tempo gera e envia ao Prometheus; leva ~1 minuto para aparecer. |
| Mudei algo em `app/src` e nada aconteceu | Reconstrua: `docker compose up -d --build`. |
| Quero recomeçar do zero | `docker compose down` e depois `docker compose up -d`. Os dados ficam só na memória dos containers. |

## Desligando

```bash
docker compose down
```
