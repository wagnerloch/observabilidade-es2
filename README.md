# Demonstração de Observabilidade na Prática

Este é um projeto prático para a disciplina de Engenharia de Software II. Ele demonstra como instrumentar uma aplicação web para expor métricas e como utilizar ferramentas profissionais de mercado (Prometheus e Grafana) para coletar e visualizar essas métricas.

## Arquitetura do Projeto

1. **Aplicação (Node.js + Express)**: Uma API REST simples instrumentada com `prom-client`. Expõe métricas na rota `/metrics`.
2. **Prometheus**: Um servidor de monitoramento que faz o *scrape* (coleta) das métricas da aplicação a cada 5 segundos.
3. **Grafana**: Uma plataforma de visualização de dados conectada ao Prometheus. Usaremos o Grafana para criar dashboards com gráficos da nossa API.

---

## Pré-requisitos

Para rodar este projeto na sua máquina, você vai precisar de:
- **Docker** e **Docker Compose** instalados (O Docker Desktop já inclui ambos).
- **Node.js** instalado (apenas para rodar os scripts de carga locais).

## Passo a Passo para Iniciar

### 1. Subindo a Infraestrutura

Abra seu terminal na pasta raiz deste projeto (`demonstracao`) e execute o comando:

```bash
docker compose up -d
```

Isso vai baixar as imagens (se necessário), compilar a nossa API e subir três containers em segundo plano: `app`, `prometheus` e `grafana`.

Verifique se estão rodando com:
```bash
docker compose ps
```

### 2. Acessando os Serviços

- **Nossa API (Node.js)**: [http://localhost:3000](http://localhost:3000)
- **Métricas cruas (Prometheus format)**: [http://localhost:3000/metrics](http://localhost:3000/metrics)
- **Prometheus UI**: [http://localhost:9090](http://localhost:9090)
- **Grafana**: [http://localhost:3001](http://localhost:3001)

---

## Tarefa: Criando seu Dashboard no Grafana

Seu objetivo é visualizar a "Saúde" do nosso sistema.

1. Acesse o Grafana em [http://localhost:3001](http://localhost:3001).
2. O usuário padrão é `admin` e a senha é `admin` (pode pular a alteração de senha se ele pedir).
3. O Grafana já está conectado ao Prometheus! 
4. No menu lateral esquerdo, clique no ícone **"+"** (Create) e depois em **Dashboard**.
5. Clique em **Add visualization**.
6. Selecione a fonte de dados **Prometheus**.

### Criando os Gráficos

Abaixo estão as fórmulas (PromQL) que você deve colocar no campo "Query" (aba inferior) para criar três gráficos fundamentais. Crie um painel para cada um:

#### Gráfico 1: Requisições por Segundo (RPS - Throughput)
Mostra o volume de acessos simultâneos na API.
- **Query:** `rate(http_requests_total[1m])`
- **Dica:** Na lateral direita (Painel de opções), procure por `Legend` e coloque `{{route}} - {{status_code}}` para ver uma linha por rota e por código de status.

#### Gráfico 2: Duração Média (Latência)
Mostra quão rápida (ou lenta) nossa API está respondendo, em segundos.
- **Query:** `rate(http_request_duration_seconds_sum[1m]) / rate(http_request_duration_seconds_count[1m])`
- **Dica:** Nas opções da direita, altere a unidade (Unit) do eixo Y para `Time > seconds (s)`.

#### Gráfico 3: Taxa de Erro (Em Porcentagem)
Mostra o percentual de requisições que estão falhando (status 500) em relação ao total.
- **Query:** `sum(rate(http_requests_total{status_code="500"}[1m])) / sum(rate(http_requests_total[1m])) * 100`
- **Dica:** Altere a unidade para `Misc > Percent (0-100)`.

Não se esqueça de salvar seu Dashboard no topo direito da tela!

---

## Simulando Tráfego (A Mágica Acontece Aqui)

Com os gráficos montados, o dashboard deve estar plano (sem dados novos). Vamos gerar acessos na nossa API para ver os gráficos se moverem.

Abra um novo terminal na pasta raiz do projeto. Você pode abrir duas abas do terminal para rodar os scripts separadamente.

### 1. Carga Normal (Dia a Dia)
Este script simula usuários acessando a aplicação de forma tranquila e constante.
```bash
node scripts/load-normal.js
```
*Observe seus gráficos: O RPS deve subir levemente, a latência deve se estabilizar em alguns milissegundos e a taxa de erros deve ser próxima a zero (talvez um pequeno pico isolado).*

### 2. Teste de Estresse (O Caos)
Vamos simular um ataque ou um pico de acesso monstruoso (Black Friday), misturado com falhas catastróficas. Mantenha o Grafana aberto e rode:
```bash
node scripts/load-stress.js
```
*Observe seus gráficos:*
- *O **RPS** vai explodir e bater no teto.*
- *A **Duração Média** vai subir drasticamente, pois o Node.js não vai aguentar a concorrência.*
- *A **Taxa de Erro** vai subir para 30~50% ou mais.*

Você acabou de observar, na prática, um incidente acontecendo em tempo real utilizando ferramentas de observabilidade!

---
## Para Desligar tudo
Quando terminar a aula:
```bash
docker compose down
```
