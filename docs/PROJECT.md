# 📘 EvalX — Project Documentation

> Comprehensive technical documentation covering features, design decisions, and implementation details

---

## 📋 Table of Contents

- [Introduction](#-introduction)
- [Features Overview](#-features-overview)
- [Technical Stack](#-technical-stack)
- [Evaluation Methodology](#-evaluation-methodology)
- [LLM Provider Integration](#-llm-provider-integration)
- [Database Design](#-database-design)
- [Real-Time Architecture](#-real-time-architecture)
- [Frontend Design System](#-frontend-design-system)
- [Observability Stack](#-observability-stack)
- [Security Considerations](#-security-considerations)
- [Performance Optimizations](#-performance-optimizations)
- [Design Decisions](#-design-decisions)

---

## 🌟 Introduction

### What is EvalX?

EvalX is a **distributed, event-driven platform** for evaluating Large Language Model (LLM) outputs at scale. Unlike simple prompt playgrounds or single-model testing tools, EvalX is designed to:

1. **Test at Scale** — Run thousands of evaluation jobs in parallel
2. **Compare Systematically** — A/B test models, prompts, and configurations
3. **Score Comprehensively** — Multi-dimensional evaluation (schema, RAG, judge)
4. **Monitor in Real-Time** — Live progress tracking and instant feedback
5. **Analyze Thoroughly** — Rich visualizations and failure classification

### Why EvalX?

| Problem | EvalX Solution |
|---------|----------------|
| Manual testing is slow | Automated batch evaluation with Kafka fan-out |
| Hard to compare models | Side-by-side model performance dashboard |
| Prompt changes break things | A/B testing with historical tracking |
| RAG pipelines hallucinate | Faithfulness scoring and hallucination detection |
| No visibility into failures | Classified failure types with sample errors |
| Expensive LLM APIs | 100% free tier support (Groq, Gemini, Ollama) |

### Target Use Cases

- **Prompt Engineering Teams** — Test prompt variations before production deployment
- **RAG Pipeline Developers** — Evaluate retrieval quality and answer faithfulness
- **ML Engineers** — Benchmark models on custom datasets
- **QA Teams** — Regression testing for LLM-powered features

---

## ✨ Features Overview

### Core Evaluation Features

#### 🔄 Multi-Model Comparison
Compare performance across different LLM providers simultaneously:
- **Groq** — Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B
- **Google Gemini** — Gemini 1.5 Flash, Gemini 1.5 Pro
- **Ollama** — Any locally-hosted model

#### 📝 Prompt A/B Testing
Create multiple prompt variants per task and compare:
- Template variables: `{{input}}`, `{{context}}`, `{{ground_truth}}`
- Version tracking for each variant
- Performance comparison charts by prompt

#### 📊 5-Dimension Scoring
Every response is evaluated across five dimensions:

| Dimension | Type | Description |
|-----------|------|-------------|
| **Schema Validity** | Boolean | Does the output match the expected JSON schema? |
| **Completeness** | 0.0-1.0 | What fraction of required fields are populated? |
| **Context Relevance** | 0.0-1.0 | How relevant is the context to the question? |
| **Faithfulness** | 0.0-1.0 | Is the answer grounded in the provided context? |
| **Judge Score** | 1-10 | LLM-as-a-judge quality assessment |

#### 🚨 Failure Classification
Failed evaluations are categorized for debugging:

| Failure Type | Trigger Condition |
|--------------|-------------------|
| `SCHEMA_VIOLATION` | Output is not valid JSON or fails schema |
| `INCOMPLETE_OUTPUT` | Completeness score < 0.5 |
| `HALLUCINATION_DETECTED` | Faithfulness < 0.4 |
| `LOW_QUALITY` | Judge score < 4 |
| `TIMEOUT` | LLM API timeout |
| `PROVIDER_ERROR` | LLM API error (rate limit, auth, etc.) |
| `EVALUATOR_ERROR` | Internal evaluation error |

### Dashboard Features

#### 📈 Real-Time Progress
- Live progress bars powered by Socket.io
- Instant status updates when runs complete
- No page refresh needed

#### 📊 Rich Visualizations
- **Model Comparison** — Bar charts comparing avg scores by model
- **Latency Analysis** — Response time distribution by model
- **Success Rates** — Pie charts showing pass/fail ratios
- **Prompt Comparison** — A/B test results visualization
- **Failure Breakdown** — Categorized failure analysis

#### 🌙 Dark Mode
- Toggle between light and dark themes
- Preference saved in localStorage
- Consistent design system across modes

### Infrastructure Features

#### 🐳 Docker-First Setup
- Single `docker compose up` for all infrastructure
- Pre-configured PostgreSQL, Redis, Kafka, Prometheus, Grafana
- Health checks for all services

#### 📊 Auto-Provisioned Observability
- Grafana dashboard ready out of the box
- Prometheus metrics collection
- PostgreSQL query panels for custom analysis

---

## 🛠️ Technical Stack

### Backend Services

| Component | Technology | Purpose |
|-----------|------------|---------|
| **API Server** | Node.js 20, Express 5 | REST API, Socket.io, Kafka producer |
| **Worker** | Node.js 20, KafkaJS | LLM provider routing, retry logic |
| **Evaluator** | Python 3.11, FastAPI | ML evaluation pipeline |
| **Aggregator** | Node.js (in API) | Result persistence, progress tracking |

### Infrastructure

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Database** | PostgreSQL 15 + pgvector | Primary storage, vector similarity |
| **Cache** | Redis 7 | Progress counters, Socket.io adapter |
| **Message Broker** | Redpanda (Kafka-compatible) | Job distribution, result collection |
| **Metrics** | Prometheus 2.50 | Metrics collection |
| **Visualization** | Grafana 10.3 | Dashboards and alerting |

### Frontend

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Framework** | React 19 | UI components |
| **Build Tool** | Vite 5 | Fast development and builds |
| **Styling** | Tailwind CSS 3 | Utility-first CSS |
| **Components** | Radix UI | Accessible primitives |
| **Charts** | Recharts | Data visualization |
| **Real-Time** | Socket.io Client | Live updates |

### ML/AI Libraries

| Component | Library | Purpose |
|-----------|---------|---------|
| **Embeddings** | sentence-transformers | Local embedding generation |
| **Model** | all-MiniLM-L6-v2 | 384-dim embeddings |
| **Validation** | jsonschema | JSON schema validation |
| **Vector Ops** | pgvector | Cosine similarity in PostgreSQL |

---

## 🔬 Evaluation Methodology

### Pipeline Overview

```
Raw LLM Output
      │
      ▼
┌─────────────────────────────────────────────┐
│  Stage 1: Schema Validation                 │
│  ─────────────────────────────              │
│  • Parse JSON output                        │
│  • Validate against expected schema         │
│  • Mark SCHEMA_VIOLATION if failed          │
└─────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│  Stage 2: Completeness Check                │
│  ──────────────────────────────             │
│  • Count required fields in schema          │
│  • Count populated fields in output         │
│  • completeness = populated / required      │
│  • Mark INCOMPLETE_OUTPUT if < 0.5          │
└─────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│  Stage 3: Embedding Generation              │
│  ─────────────────────────────              │
│  • Embed input question (384 dims)          │
│  • Embed LLM output (384 dims)              │
│  • Embed context if provided                │
│  • Model: all-MiniLM-L6-v2                  │
└─────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│  Stage 4: RAG Metrics                       │
│  ─────────────────────────────              │
│  • context_relevance = cos(input, context)  │
│  • faithfulness = grounding score           │
│  • Mark HALLUCINATION_DETECTED if < 0.4     │
└─────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────┐
│  Stage 5: LLM Judge                         │
│  ─────────────────────────────              │
│  • Send to Llama-3 via Groq                 │
│  • Score: Correctness (40%)                 │
│  • Score: Relevance (25%)                   │
│  • Score: Completeness (20%)                │
│  • Score: Coherence (15%)                   │
│  • Mark LOW_QUALITY if < 4                  │
└─────────────────────────────────────────────┘
      │
      ▼
Combined Metrics Object
```

### Embedding Model

**Model:** `all-MiniLM-L6-v2` from Sentence Transformers

| Property | Value |
|----------|-------|
| Dimensions | 384 |
| Max Sequence | 256 tokens |
| Speed | ~14k sentences/sec (CPU) |
| Size | ~80MB |

**Why this model?**
- Fast inference without GPU
- Good quality for semantic similarity
- Small footprint for local deployment
- MIT licensed

### RAG Faithfulness Scoring

Faithfulness measures whether the LLM's answer is **grounded in the provided context** (i.e., not hallucinating).

**Algorithm:**
1. Extract key claims from the LLM output
2. For each claim, check if it can be derived from the context
3. `faithfulness = supported_claims / total_claims`

**Thresholds:**
- `≥ 0.8` — Highly faithful
- `0.6 - 0.8` — Acceptable
- `0.4 - 0.6` — Concerning
- `< 0.4` — **HALLUCINATION_DETECTED**

### LLM-as-a-Judge

Uses a powerful LLM (Llama-3.1-8B via Groq free tier) to score responses.

**Scoring Rubric:**

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Correctness | 40% | Is the answer factually correct? |
| Relevance | 25% | Does it address the question? |
| Completeness | 20% | Is anything important missing? |
| Coherence | 15% | Is it well-structured and clear? |

**Prompt Template:**
```
You are an expert evaluator. Score the following LLM response.

Question: {input}
Expected Answer: {ground_truth}
LLM Response: {output}

Score each criterion from 1-10:
- Correctness: Is the answer factually correct?
- Relevance: Does it address the question asked?
- Completeness: Does it cover all important aspects?
- Coherence: Is it well-organized and clear?

Return JSON: {"correctness": X, "relevance": X, "completeness": X, "coherence": X}
```

---

## 🤖 LLM Provider Integration

### Provider Registry Pattern

The worker uses a **registry pattern** to route requests to the appropriate provider based on model name.

```javascript
const providers = {
  groq: {
    pattern: /^(llama|mixtral)/i,
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768']
  },
  gemini: {
    pattern: /^gemini/i,
    models: ['gemini-1.5-flash', 'gemini-1.5-pro']
  },
  ollama: {
    pattern: /^(ollama|local)\//i,
    models: ['ollama/llama2', 'local/mistral']
  }
};
```

### Rate Limit Handling

All providers have rate limits (especially free tiers). EvalX handles this with **exponential backoff with jitter**:

```
Retry 1: wait 1000ms + random(0-500)ms
Retry 2: wait 2000ms + random(0-500)ms
Retry 3: wait 4000ms + random(0-500)ms
Max retries: 3
```

**Retryable errors:**
- HTTP 429 (Rate Limited)
- HTTP 5xx (Server Error)
- Network timeouts

**Non-retryable errors:**
- HTTP 400 (Bad Request)
- HTTP 401/403 (Auth Error)
- Invalid model name

### Free Tier Limits

| Provider | Rate Limit | Daily Limit | Notes |
|----------|------------|-------------|-------|
| **Groq** | ~30 req/min | ~14,400/day | Fastest inference |
| **Gemini** | ~15 req/min | ~1,500/day | Best for long context |
| **Ollama** | Unlimited | Unlimited | Requires local GPU/CPU |

---

## 🗄️ Database Design

### Schema Philosophy

1. **UUID Primary Keys** — Distributed-friendly, no sequence contention
2. **JSONB for Flexibility** — Metrics and schema stored as JSON
3. **pgvector for Embeddings** — Native vector operations
4. **Enums for Type Safety** — Failure types, run status

### Core Tables

#### `evaluation_tasks`
Defines what you're testing (name, description, expected output schema).

#### `evaluation_task_items`
The dataset — each row is one test case with input, context, and ground truth.

#### `prompt_variants`
Different prompt templates to A/B test. Links to a task.

#### `evaluation_runs`
A specific execution — tracks status, selected models, repetitions, and job counts.

#### `execution_results`
Successful evaluation results with all metrics, latency, and token counts.

#### `evaluation_failures`
Dead-letter queue for failed jobs with classified failure types.

### Vector Indexes

Using HNSW (Hierarchical Navigable Small World) index for fast similarity search:

```sql
CREATE INDEX idx_items_input_embedding 
ON evaluation_task_items 
USING hnsw (input_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

**Parameters:**
- `m = 16` — Max connections per node (default balance)
- `ef_construction = 64` — Build-time accuracy (higher = slower build, better quality)

---

## ⚡ Real-Time Architecture

### Socket.io Event Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Aggregator │────▶│   Redis     │────▶│  Socket.io  │
│  Consumer   │     │  Pub/Sub    │     │   Server    │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │   React UI  │
                                        │  (Browser)  │
                                        └─────────────┘
```

### Redis Progress Counters

Progress is tracked with atomic Redis operations:

```
Key: run:{runId}:total     = 100
Key: run:{runId}:completed = 45
Key: run:{runId}:failed    = 3
TTL: 24 hours (auto-cleanup)
```

**Atomic update:**
```javascript
await redis.hincrby(`run:${runId}:completed`, 1);
```

### Event Types

| Event | Scope | Payload |
|-------|-------|---------|
| `run:progress` | Room | `{ runId, completed, failed, total, percentComplete }` |
| `run:started` | Room | `{ runId }` |
| `run:complete` | Room | `{ runId, summary }` |
| `runs:statusChanged` | Global | `{ runId, status }` |

---

## 🎨 Frontend Design System

### Color Palette

EvalX uses a **warm, natural color scheme** — deliberately avoiding the typical "AI blue/purple" aesthetic.

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `stone-50` | `#fafaf9` | — | Background |
| `stone-900` | `#1c1917` | — | Text |
| `amber-500` | `#f59e0b` | — | Accent/Primary |
| `green-500` | `#22c55e` | — | Success |
| `red-500` | `#ef4444` | — | Error |

### Typography

**Font:** Inter (Google Fonts)

| Style | Size | Weight | Usage |
|-------|------|--------|-------|
| Heading 1 | 2rem | 700 | Page titles |
| Heading 2 | 1.5rem | 600 | Section titles |
| Body | 1rem | 400 | Default text |
| Small | 0.875rem | 400 | Captions, metadata |

### Component Patterns

**Cards:**
```jsx
<div className="bg-white dark:bg-stone-800 rounded-xl shadow-sm border border-stone-200 dark:border-stone-700 p-6">
  {/* content */}
</div>
```

**Buttons:**
```jsx
// Primary
<button className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg">
  Start Run
</button>

// Secondary
<button className="bg-stone-100 dark:bg-stone-700 text-stone-700 dark:text-stone-200 px-4 py-2 rounded-lg">
  Cancel
</button>
```

---

## 📊 Observability Stack

### Metrics Collection

**Prometheus scrapes:**
- API server (`/metrics`)
- Redpanda admin API (`:9644`)

**Key metrics:**
| Metric | Type | Description |
|--------|------|-------------|
| `http_requests_total` | Counter | API request count |
| `http_request_duration_seconds` | Histogram | API latency |
| `kafka_consumer_lag` | Gauge | Messages behind |
| `evaluation_jobs_processed` | Counter | Jobs completed |

### Grafana Dashboard

Auto-provisioned at `http://localhost:3030`:

**Panels:**
1. **Overview Stats** — Total runs, executions, failures, success rate
2. **Latency by Model** — Bar chart comparing response times
3. **Judge Score by Model** — Quality comparison
4. **Success/Failure Pie** — Pass rate visualization
5. **Recent Runs Table** — Latest run status

---

## 🔒 Security Considerations

### API Keys

- Never commit API keys to git
- Use `.env` files (gitignored)
- Keys only needed in `api/`, `worker/`, `evaluator/`

### Database

- PostgreSQL uses simple auth (evalx/evalx) — **change in production**
- No exposed ports except localhost in docker-compose

### Network

- All services communicate via Docker network
- Only necessary ports exposed to host
- Consider reverse proxy for production

---

## ⚡ Performance Optimizations

### Database

1. **Connection Pooling** — Reuse connections, avoid per-request overhead
2. **Batch Inserts** — Aggregate results before writing
3. **HNSW Indexes** — Fast vector similarity without table scans
4. **Partial Indexes** — Index only relevant subsets

### Kafka

1. **Batched Publishing** — Send 1000 messages at a time
2. **Manual Commits** — Only commit after successful processing
3. **Partitioned Topics** — Enable parallel consumption

### Evaluation

1. **Model Preloading** — Load embedding model at startup
2. **Async Processing** — Non-blocking I/O throughout
3. **Early Exit** — Skip stages if earlier stages fail

---

## 🎯 Design Decisions

### Why Kafka (Redpanda)?

**Alternatives considered:**
- Redis Streams — Simpler, but less durable
- RabbitMQ — Good, but Kafka better for high throughput
- Direct API calls — No fan-out capability

**Decision:** Redpanda (Kafka-compatible)
- No JVM/ZooKeeper overhead
- Kafka ecosystem compatibility
- Built-in admin API
- Lightweight for development

### Why Python Evaluator?

**Alternatives considered:**
- Node.js — Faster startup, but ML ecosystem weaker
- Go — Fast, but poor ML library support

**Decision:** Python FastAPI
- Best ML library ecosystem (sentence-transformers)
- FastAPI is fast enough
- Easy to extend with new evaluation methods

### Why Socket.io?

**Alternatives considered:**
- Server-Sent Events — Simpler, but one-way only
- WebSocket raw — More complex client code
- Polling — Higher latency, more load

**Decision:** Socket.io
- Bidirectional communication
- Automatic reconnection
- Room-based subscriptions
- Redis adapter for scaling

### Why pgvector?

**Alternatives considered:**
- Pinecone — Managed, but adds cost
- Milvus — Powerful, but heavy
- In-memory — Not persistent

**Decision:** pgvector
- Lives in PostgreSQL (no new service)
- Good enough for our scale
- HNSW index support
- Full SQL integration

---

## 📚 Further Reading

- [Architecture Diagrams](ARCHITECTURE.md) — Visual system design
- [Testing Guide](TESTING_GUIDE.md) — E2E testing walkthrough
- [API Specification](spec.md) — REST API contracts

---

<p align="center">
  <em>EvalX — Built for engineers who care about LLM quality 🎯</em>
</p>
