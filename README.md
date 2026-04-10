<p align="center">
  <img src="https://img.shields.io/badge/LLM-Evaluation-orange?style=for-the-badge" alt="LLM Evaluation"/>
  <img src="https://img.shields.io/badge/RAG-Analytics-blue?style=for-the-badge" alt="RAG Analytics"/>
  <img src="https://img.shields.io/badge/100%25-Free%20APIs-green?style=for-the-badge" alt="Free APIs"/>
</p>

<h1 align="center">🧪 EvalX</h1>

<p align="center">
  <strong>A distributed, event-driven LLM evaluation and observability platform</strong><br/>
  Benchmark, monitor, and analyze LLM performance across prompts, datasets, and RAG pipelines
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white" alt="Node.js"/>
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" alt="Python"/>
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" alt="Redis"/>
  <img src="https://img.shields.io/badge/Kafka-Redpanda-FF5722?logo=apachekafka&logoColor=white" alt="Kafka"/>
</p>

---

## 🎯 What is EvalX?

EvalX is a **full-stack evaluation platform** that lets you systematically test LLM outputs across multiple dimensions. Unlike simple prompt playgrounds, EvalX runs **thousands of evaluation jobs** in parallel, scoring each response against schema validation, semantic similarity, hallucination detection, and LLM-as-a-Judge metrics.

Perfect for:
- 📊 **A/B testing** prompt variations at scale
- 🔍 **RAG pipeline evaluation** with faithfulness & relevance metrics
- 🏆 **Model comparison** (Groq, Gemini, Ollama) on the same dataset
- 📈 **Regression testing** before deploying prompt changes

---

## ✨ Features

### 🚀 Core Capabilities
- **Multi-Model Support** — Compare Groq (Llama 3, Mixtral), Gemini, and local Ollama models
- **Distributed Evaluation** — Kafka-powered fan-out handles 10,000+ jobs efficiently
- **5-Dimension Scoring** — Schema validity, completeness, context relevance, faithfulness, LLM judge
- **Real-time Progress** — Socket.io streams live updates to the dashboard
- **Failure Analysis** — Dead-letter queue with classified failure types

### 📊 Analytics & Visualization
- **Model Comparison Charts** — Side-by-side latency and quality scores
- **Prompt A/B Testing** — Compare multiple prompt variants per dataset
- **Failure Breakdown** — Visual summary of failure types with sample errors
- **Historical Trends** — Track model performance over time

### 🛠️ Developer Experience
- **100% Free APIs** — No credit card required (Groq, Gemini free tiers + Ollama local)
- **Docker-first Setup** — Single `docker compose up` for all infrastructure
- **Auto-provisioned Dashboards** — Grafana ready out of the box
- **Dark Mode** — Easy on the eyes during late-night eval sessions

---

## 🏁 Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+
- Python 3.11+
- Free API keys: [Groq](https://console.groq.com) and/or [Google AI Studio](https://ai.google.dev)

### 1️⃣ Clone & Setup Infrastructure

```bash
git clone https://github.com/yourusername/EvalX.git
cd EvalX

# Start PostgreSQL, Redis, Redpanda, Prometheus, Grafana
docker compose up -d
```

### 2️⃣ Configure Environment

```bash
# API Service
cp api/.env.example api/.env
# Add your GROQ_API_KEY and/or GEMINI_API_KEY

# Worker Service
cp worker/.env.example worker/.env
# Same API keys

# Evaluator Service
cp evaluator/.env.example evaluator/.env
```

### 3️⃣ Install Dependencies & Start Services

```bash
# Terminal 1: API Server
cd api && npm install && npm run dev

# Terminal 2: Worker
cd worker && npm install && npm run dev

# Terminal 3: Python Evaluator
cd evaluator && pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000

# Terminal 4: Frontend
cd frontend && npm install && npm run dev
```

### 4️⃣ Open the Dashboard

Navigate to **http://localhost:5173** and start creating evaluation tasks!

---

## 🗂️ Project Structure

```
EvalX/
├── api/                 # Node.js REST API + Socket.io + Aggregator
├── worker/              # Kafka consumer → LLM providers
├── evaluator/           # Python FastAPI evaluation engine
├── frontend/            # React + Vite + Tailwind dashboard
├── db/migrations/       # PostgreSQL schema with pgvector
├── infra/               # Prometheus & Grafana configs
└── docker-compose.yaml  # Full infrastructure stack
```

---

## 📖 Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System diagrams, data flow, and component interactions |
| [Project Details](docs/PROJECT.md) | In-depth technical specification and design decisions |
| [API Reference](docs/spec.md) | REST API contracts and data models |

---

## 🔧 Configuration

### Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `GROQ_API_KEY` | API, Worker | Free API key from console.groq.com |
| `GEMINI_API_KEY` | API, Worker | Free API key from ai.google.dev |
| `DATABASE_URL` | API | PostgreSQL connection string |
| `REDIS_URL` | API | Redis connection string |
| `KAFKA_BROKERS` | API, Worker | Kafka broker address (default: localhost:19092) |
| `EVALUATOR_URL` | API | Python evaluator URL (default: http://localhost:8000) |

### Default Ports

| Service | Port | URL |
|---------|------|-----|
| Frontend | 5173 | http://localhost:5173 |
| API | 3000 | http://localhost:3000 |
| Evaluator | 8000 | http://localhost:8000 |
| PostgreSQL | 5432 | - |
| Redis | 6379 | - |
| Kafka (Redpanda) | 19092 | - |
| Redpanda Console | 8080 | http://localhost:8080 |
| Prometheus | 9090 | http://localhost:9090 |
| Grafana | 3030 | http://localhost:3030 |

---

## 🤝 Contributing

Contributions are welcome! Please read our contribution guidelines before submitting PRs.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Built with ☕ and late nights<br/>
  <strong>Star ⭐ this repo if you find it useful!</strong>
</p>
