# 🏗️ EvalX Architecture

> A visual guide to the system architecture, data flows, and component interactions

---

## 📋 Table of Contents

- [System Overview](#-system-overview)
- [High-Level Architecture](#-high-level-architecture)
- [Data Flow](#-data-flow)
- [Component Breakdown](#-component-breakdown)
- [Database Schema](#-database-schema)
- [Kafka Topics & Message Flow](#-kafka-topics--message-flow)
- [Evaluation Pipeline](#-evaluation-pipeline)
- [Real-Time Updates](#-real-time-updates)
- [Infrastructure Services](#-infrastructure-services)

---

## 🎯 System Overview

EvalX follows an **event-driven microservices architecture** where components communicate asynchronously through Kafka. This design enables:

- **Horizontal scaling** of workers for high throughput
- **Fault tolerance** through message persistence and retries
- **Real-time monitoring** via Redis counters and Socket.io
- **Separation of concerns** between API, workers, and evaluation logic

---

## 🏛️ High-Level Architecture

```mermaid
flowchart TB
    subgraph Client["🖥️ Client Layer"]
        UI[React Dashboard]
    end
    
    subgraph API["⚡ API Layer"]
        REST[Express REST API]
        WS[Socket.io Server]
        AGG[Aggregator Consumer]
    end
    
    subgraph Messaging["📨 Message Broker"]
        K1[evaluation.tasks]
        K2[evaluation.results]
    end
    
    subgraph Workers["👷 Worker Layer"]
        W1[Worker 1]
        W2[Worker 2]
        W3[Worker N...]
    end
    
    subgraph Evaluation["🧠 Evaluation Engine"]
        EVAL[Python FastAPI]
        EMB[Embedder]
        VAL[Schema Validator]
        RAG[RAG Evaluator]
        JUDGE[LLM Judge]
    end
    
    subgraph Storage["💾 Storage Layer"]
        PG[(PostgreSQL + pgvector)]
        RD[(Redis)]
    end
    
    subgraph LLMs["🤖 LLM Providers"]
        GROQ[Groq API]
        GEMINI[Gemini API]
        OLLAMA[Ollama Local]
    end
    
    subgraph Observability["📊 Observability"]
        PROM[Prometheus]
        GRAF[Grafana]
    end
    
    UI <-->|REST + WebSocket| REST
    UI <-->|Real-time events| WS
    
    REST -->|Create Task/Run| PG
    REST -->|Fan-out jobs| K1
    
    K1 -->|Consume tasks| W1 & W2 & W3
    W1 & W2 & W3 -->|Call APIs| GROQ & GEMINI & OLLAMA
    W1 & W2 & W3 -->|Raw results| K2
    
    K2 -->|Consume results| AGG
    AGG -->|Evaluate| EVAL
    EVAL --- EMB & VAL & RAG & JUDGE
    
    AGG -->|Persist| PG
    AGG -->|Update counters| RD
    AGG -->|Emit events| WS
    
    RD -->|Progress data| REST
    RD -->|Pub/Sub| WS
    
    PROM -->|Scrape metrics| REST & W1 & EVAL
    GRAF -->|Query| PROM & PG
```

---

## 🔄 Data Flow

### Run Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant UI as React UI
    participant API as API Server
    participant K as Kafka
    participant W as Worker
    participant LLM as LLM Provider
    participant E as Evaluator
    participant A as Aggregator
    participant DB as PostgreSQL
    participant R as Redis
    
    U->>UI: Create Task + Dataset
    UI->>API: POST /api/tasks
    API->>DB: Insert task & items
    API-->>UI: Task created
    
    U->>UI: Start Evaluation Run
    UI->>API: POST /api/runs
    API->>DB: Create run record
    API->>R: Initialize progress counters
    
    rect rgb(255, 240, 220)
        Note over API,K: Fan-out (items × prompts × models × reps)
        API->>K: Batch publish to evaluation.tasks
    end
    
    par Parallel Processing
        K->>W: Consume job
        W->>LLM: Generate response
        LLM-->>W: Raw output + latency
        W->>K: Publish to evaluation.results
    end
    
    K->>A: Consume result
    A->>E: POST /evaluate
    E->>E: Schema + RAG + Judge scoring
    E-->>A: Evaluation metrics
    
    alt Success
        A->>DB: Insert to execution_results
    else Failure
        A->>DB: Insert to evaluation_failures
    end
    
    A->>R: HINCRBY counters
    A->>UI: Socket.io progress event
    UI->>U: Update progress bar
    
    Note over A,UI: Repeat until all jobs complete
    
    A->>DB: Update run status = completed
    A->>UI: Socket.io run:complete
    UI->>U: Show results dashboard
```

---

## 🧩 Component Breakdown

### API Server (`/api`)

```mermaid
flowchart LR
    subgraph Express["Express.js Server"]
        direction TB
        ROUTES[Routes]
        MW[Middleware]
        WS[Socket.io]
    end
    
    subgraph Routes["API Routes"]
        T[/api/tasks]
        R[/api/runs]
        RES[/api/results]
        P[/api/prompts]
        S[/api/stats]
    end
    
    subgraph Services["Internal Services"]
        DB[Database Pool]
        REDIS[Redis Client]
        KAFKA[Kafka Producer]
        AGG[Aggregator Consumer]
    end
    
    ROUTES --> T & R & RES & P & S
    Express --> Services
    AGG -->|Writes| DB
    AGG -->|Updates| REDIS
    AGG -->|Emits| WS
```

**Key Responsibilities:**
| Module | Purpose |
|--------|---------|
| `routes/tasks.js` | CRUD for evaluation tasks and dataset items |
| `routes/runs.js` | Create, start, stop runs; fan-out to Kafka |
| `routes/results.js` | Query results, model comparisons, failures |
| `aggregator/` | Consume results, persist, update progress |
| `lib/socket.js` | Real-time event broadcasting |

---

### Worker (`/worker`)

```mermaid
flowchart TB
    subgraph Worker["Worker Process"]
        KC[Kafka Consumer]
        PR[Provider Registry]
        RM[Retry Manager]
    end
    
    subgraph Providers["Provider Adapters"]
        G[GroqProvider]
        GM[GeminiProvider]
        O[OllamaProvider]
    end
    
    KC -->|Route by model| PR
    PR -->|llama*, mixtral*| G
    PR -->|gemini*| GM
    PR -->|ollama/*, local/*| O
    
    G & GM & O -->|with retry| RM
    RM -->|Success/Failure| KC
    KC -->|Publish result| K2[evaluation.results]
```

**Provider Routing:**
```
Model Name Pattern    →  Provider
─────────────────────────────────
llama-3*, mixtral*   →  Groq
gemini-1.5-*         →  Gemini  
ollama/*, local/*    →  Ollama (local)
```

---

### Evaluator (`/evaluator`)

```mermaid
flowchart LR
    REQ[POST /evaluate] --> PIPE[Evaluation Pipeline]
    
    subgraph Pipeline["🧪 Evaluation Pipeline"]
        direction TB
        S1[Schema Validator]
        S2[Completeness Checker]
        S3[Embedder]
        S4[RAG Evaluator]
        S5[LLM Judge]
    end
    
    PIPE --> S1 --> S2 --> S3 --> S4 --> S5
    S5 --> RESP[Combined Metrics]
    
    S3 -.->|all-MiniLM-L6-v2| EMB[(HuggingFace)]
    S5 -.->|llama-3.1-8b| GROQ[(Groq API)]
```

**Evaluation Metrics:**
| Metric | Type | Description |
|--------|------|-------------|
| `schema_valid` | bool | JSON schema validation pass/fail |
| `completeness` | 0.0-1.0 | Fraction of required fields populated |
| `context_relevance` | 0.0-1.0 | Cosine similarity (question ↔ context) |
| `faithfulness` | 0.0-1.0 | Answer grounded in context |
| `judge_score` | 1-10 | LLM quality assessment |

---

## 🗃️ Database Schema

```mermaid
erDiagram
    evaluation_tasks ||--o{ evaluation_task_items : contains
    evaluation_tasks ||--o{ prompt_variants : has
    evaluation_tasks ||--o{ evaluation_runs : executes
    evaluation_runs ||--o{ execution_results : produces
    evaluation_runs ||--o{ evaluation_failures : logs
    prompt_variants ||--o{ execution_results : uses
    
    evaluation_tasks {
        uuid id PK
        varchar name
        text description
        jsonb expected_schema
        timestamp created_at
    }
    
    evaluation_task_items {
        uuid id PK
        uuid task_id FK
        text input
        text context
        text ground_truth
        vector input_embedding
        vector context_embedding
    }
    
    prompt_variants {
        uuid id PK
        uuid task_id FK
        varchar name
        text template
        int version
    }
    
    evaluation_runs {
        uuid id PK
        uuid task_id FK
        enum status
        varchar[] models
        int repetitions
        int total_jobs
        int completed_jobs
        int failed_jobs
    }
    
    execution_results {
        uuid id PK
        uuid run_id FK
        uuid item_id FK
        uuid prompt_variant_id FK
        varchar model
        text raw_output
        jsonb metrics
        int latency_ms
        int tokens
    }
    
    evaluation_failures {
        uuid id PK
        uuid run_id FK
        uuid item_id FK
        varchar model
        enum failure_type
        text error_message
    }
```

**Failure Type Enum:**
```sql
CREATE TYPE failure_type AS ENUM (
    'SCHEMA_VIOLATION',
    'INCOMPLETE_OUTPUT', 
    'HALLUCINATION_DETECTED',
    'LOW_QUALITY',
    'TIMEOUT',
    'PROVIDER_ERROR',
    'EVALUATOR_ERROR'
);
```

---

## 📨 Kafka Topics & Message Flow

```mermaid
flowchart LR
    subgraph Producers
        API[API Server]
        W[Workers]
    end
    
    subgraph Kafka["Apache Kafka (Redpanda)"]
        T1[evaluation.tasks<br/>─────────────<br/>Partitions: 12]
        T2[evaluation.results<br/>─────────────<br/>Partitions: 12]
    end
    
    subgraph Consumers
        WG[Worker Group<br/>evalx-workers]
        AG[Aggregator Group<br/>evalx-aggregators]
    end
    
    API -->|Produce| T1
    T1 -->|Consume| WG
    W -->|Produce| T2
    T2 -->|Consume| AG
```

### Message Schemas

**evaluation.tasks:**
```json
{
  "jobId": "uuid",
  "runId": "uuid",
  "itemId": "uuid",
  "promptVariantId": "uuid",
  "model": "llama-3.3-70b-versatile",
  "input": "What is the capital of France?",
  "context": "France is a country in Europe...",
  "groundTruth": "Paris",
  "promptTemplate": "Answer: {{input}}\nContext: {{context}}",
  "expectedSchema": { ... }
}
```

**evaluation.results:**
```json
{
  "jobId": "uuid",
  "runId": "uuid",
  "itemId": "uuid",
  "promptVariantId": "uuid",
  "model": "llama-3.3-70b-versatile",
  "success": true,
  "output": "The capital of France is Paris.",
  "latencyMs": 234,
  "tokens": 45,
  "input": "...",
  "context": "...",
  "groundTruth": "..."
}
```

---

## 🔬 Evaluation Pipeline

```mermaid
flowchart TB
    INPUT[Raw LLM Output] --> S1
    
    subgraph Stage1["1️⃣ Schema Validation"]
        S1{Has Schema?}
        S1 -->|Yes| VAL[jsonschema.validate]
        S1 -->|No| SKIP1[Skip → valid=null]
        VAL -->|Pass| V1[schema_valid=true]
        VAL -->|Fail| V2[schema_valid=false<br/>SCHEMA_VIOLATION]
    end
    
    V1 & SKIP1 --> S2
    
    subgraph Stage2["2️⃣ Completeness Check"]
        S2{Required Fields?}
        S2 -->|Yes| COMP[Count populated / required]
        S2 -->|No| SKIP2[completeness=1.0]
        COMP --> C1[completeness: 0.0-1.0]
        C1 -->|< 0.5| C2[INCOMPLETE_OUTPUT]
    end
    
    C1 & SKIP2 --> S3
    
    subgraph Stage3["3️⃣ Embedding Generation"]
        S3[Generate Embeddings]
        S3 --> E1[input_embedding<br/>384 dims]
        S3 --> E2[output_embedding<br/>384 dims]
    end
    
    E1 & E2 --> S4
    
    subgraph Stage4["4️⃣ RAG Metrics"]
        S4[Cosine Similarity]
        S4 --> R1[context_relevance: 0.0-1.0]
        S4 --> R2[faithfulness: 0.0-1.0]
        R2 -->|< 0.4| H1[HALLUCINATION_DETECTED]
    end
    
    R1 & R2 --> S5
    
    subgraph Stage5["5️⃣ LLM Judge"]
        S5[Llama-3 via Groq]
        S5 --> J1[Correctness: 40%]
        S5 --> J2[Relevance: 25%]
        S5 --> J3[Completeness: 20%]
        S5 --> J4[Coherence: 15%]
        J1 & J2 & J3 & J4 --> JF[judge_score: 1-10]
        JF -->|< 4| LQ[LOW_QUALITY]
    end
    
    JF --> OUTPUT[Final Metrics Object]
```

---

## 🔴 Real-Time Updates

```mermaid
sequenceDiagram
    participant A as Aggregator
    participant R as Redis
    participant S as Socket.io
    participant UI as React UI
    
    A->>R: HINCRBY run:{id}:completed 1
    R-->>A: {completed: 45, total: 100}
    
    A->>A: Calculate percentComplete
    
    A->>S: emit('run:progress', {<br/>  runId, completed, total,<br/>  percentComplete: 45<br/>})
    
    S->>UI: WebSocket message
    UI->>UI: Update progress bar
    
    Note over A,UI: When all jobs complete:
    
    A->>S: emit('run:complete', {runId})
    A->>S: emit('runs:statusChanged', {<br/>  runId, status: 'completed'<br/>})
    
    S->>UI: WebSocket messages
    UI->>UI: Navigate to results view
```

**Socket.io Events:**
| Event | Direction | Payload |
|-------|-----------|---------|
| `subscribe:run` | Client → Server | `{ runId }` |
| `run:progress` | Server → Client | `{ runId, completed, failed, total, percentComplete }` |
| `run:started` | Server → Client | `{ runId }` |
| `run:complete` | Server → Client | `{ runId, summary }` |
| `runs:statusChanged` | Server → All | `{ runId, status }` |

---

## 🐳 Infrastructure Services

```mermaid
flowchart TB
    subgraph Docker["Docker Compose Stack"]
        direction TB
        
        subgraph Data["Data Layer"]
            PG[PostgreSQL 15<br/>+ pgvector<br/>:5432]
            RD[Redis 7<br/>:6379]
        end
        
        subgraph Messaging["Message Layer"]
            RP[Redpanda v23.3.5<br/>Kafka: :19092<br/>Admin: :9644]
            RC[Redpanda Console<br/>:8080]
        end
        
        subgraph Monitoring["Monitoring Layer"]
            PR[Prometheus v2.50<br/>:9090]
            GF[Grafana v10.3.3<br/>:3030]
        end
    end
    
    RC -->|View topics| RP
    GF -->|Query| PR & PG
    PR -->|Scrape| RP
```

**Service Healthchecks:**
```yaml
PostgreSQL:  pg_isready -U evalx -d evalx
Redis:       redis-cli ping
Redpanda:    rpk cluster health | grep 'Healthy'
```

---

## 📁 Directory Structure

```
EvalX/
├── api/                          # Node.js API Server
│   └── src/
│       ├── routes/               # Express routes
│       │   ├── tasks.js          # Task CRUD
│       │   ├── runs.js           # Run management
│       │   ├── results.js        # Results queries
│       │   └── prompts.js        # Prompt variants
│       ├── aggregator/           # Kafka consumer + persistence
│       │   ├── consumer.js       # Kafka setup
│       │   ├── handler.js        # Result processing
│       │   └── persistence.js    # DB writes
│       ├── lib/                  # Shared utilities
│       │   ├── db.js             # PostgreSQL pool
│       │   ├── redis.js          # Redis client
│       │   ├── kafka.js          # Kafka producer
│       │   └── socket.js         # Socket.io setup
│       └── index.js              # Entry point
│
├── worker/                       # Node.js Worker
│   └── src/
│       ├── providers/            # LLM provider adapters
│       │   ├── groq.js
│       │   ├── gemini.js
│       │   └── ollama.js
│       ├── kafkaWorker.js        # Consumer + routing
│       └── index.js              # Entry point
│
├── evaluator/                    # Python FastAPI
│   └── src/
│       ├── routes/
│       │   └── evaluate.py       # POST /evaluate endpoint
│       ├── services/
│       │   ├── schema_validator.py
│       │   ├── embedder.py
│       │   ├── rag_evaluator.py
│       │   └── llm_judge.py
│       └── main.py               # FastAPI app
│
├── frontend/                     # React + Vite
│   └── src/
│       ├── pages/
│       │   ├── TasksPage.jsx
│       │   ├── RunsPage.jsx
│       │   └── ResultsPage.jsx
│       ├── components/
│       ├── hooks/                # useRunProgress, etc.
│       └── lib/api.js            # API client
│
├── db/
│   └── migrations/
│       └── 001_init.sql          # Schema + indexes
│
├── infra/
│   ├── prometheus/
│   │   └── prometheus.yml
│   └── grafana/
│       └── provisioning/
│           ├── datasources/
│           └── dashboards/
│
└── docker-compose.yaml           # Infrastructure stack
```

---

<p align="center">
  <em>Architecture designed for scalability, observability, and developer happiness 🎉</em>
</p>
