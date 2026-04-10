# 🧪 EvalX — End-to-End Testing Guide

> Reference for running complete E2E tests with all credentials and step-by-step commands

---

## 📋 Quick Reference — All Credentials

| Service | URL | Username | Password |
|---------|-----|----------|----------|
| **Grafana** | http://localhost:3030 | `admin` | `evalx` |
| **PostgreSQL** | http://localhost:5432 | `evalx` | `evalx` |
| **Redpanda Console** | http://localhost:8080 | — | — |
| **Prometheus** | http://localhost:9090 | — | — |
| **Frontend** | http://localhost:5173 | — | — |
| **API** | http://localhost:3000 | — | — |
| **Evaluator** | http://localhost:8000 | — | — |

---

## 🚀 Step 1: Start Infrastructure

```bash
cd ~/Documents/GitHub/EvalX

# Start all Docker services
docker compose up -d

# Verify all containers are healthy
docker compose ps
```

**Expected output:**
```
NAME                  STATUS
evalx-grafana         running (healthy)
evalx-postgres        running (healthy)
evalx-prometheus      running
evalx-redis           running (healthy)
evalx-redpanda        running (healthy)
evalx-redpanda-console running
```

**Troubleshooting:**
```bash
# View logs if something fails
docker compose logs postgres
docker compose logs redpanda

# Restart everything fresh
docker compose down -v && docker compose up -d
```

---

## 🚀 Step 2: Start Application Services

Open **4 terminal windows/tabs**:

### Terminal 1 — API Server
```bash
cd ~/Documents/GitHub/EvalX/api
npm install  # first time only
npm run dev
```
**Expected:** `Server running on port 3000`

### Terminal 2 — Worker
```bash
cd ~/Documents/GitHub/EvalX/worker
npm install  # first time only
npm run dev
```
**Expected:** `Worker connected to Kafka, consuming from evaluation.tasks`

### Terminal 3 — Python Evaluator
```bash
cd ~/Documents/GitHub/EvalX/evaluator
pip install -r requirements.txt  # first time only
uvicorn src.main:app --reload --port 8000
```
**Expected:** `Uvicorn running on http://127.0.0.1:8000` + model loading logs

### Terminal 4 — Frontend
```bash
cd ~/Documents/GitHub/EvalX/frontend
npm install  # first time only
npm run dev
```
**Expected:** `VITE v5.x.x ready at http://localhost:5173`

---

## 🧪 Step 3: Run E2E Test Scenario

### 3.1 Open the Dashboard
Navigate to: **http://localhost:5173**

### 3.2 Create a Test Task

1. Click **"Tasks"** in the sidebar
2. Click **"+ New Task"** button
3. Fill in details:
   - **Name:** `Capital Cities Test`
   - **Description:** `Testing LLM knowledge of world capitals`
4. Add 3-5 dataset items:

| Input | Context | Ground Truth |
|-------|---------|--------------|
| What is the capital of France? | France is a country in Western Europe. Its capital city is known for the Eiffel Tower. | Paris |
| What is the capital of Japan? | Japan is an island nation in East Asia. Its capital is the world's most populous metropolitan area. | Tokyo |
| What is the capital of Brazil? | Brazil is the largest country in South America. Its capital was purpose-built in the 1960s. | Brasília |

5. Click **"Create Task"**

### 3.3 Add Prompt Variants

1. Click on your new task to expand it
2. Click **"Add Prompt"**
3. Add two variants:

**Variant 1 — Direct:**
```
Answer the following question concisely:
{{input}}
```

**Variant 2 — With Context:**
```
Using the context below, answer the question.

Context: {{context}}

Question: {{input}}

Answer:
```

### 3.4 Create an Evaluation Run

1. Click **"Runs"** in the sidebar
2. Click **"+ New Run"**
3. Configure:
   - **Task:** Select `Capital Cities Test`
   - **Models:** Check `llama-3.3-70b-versatile` and `gemini-1.5-flash`
   - **Prompt Variants:** Select both variants
   - **Repetitions:** `1`
4. Click **"Create Run"**
5. Click **"Start"** on the run card

### 3.5 Monitor Progress

- Watch the **progress bar** update in real-time
- Expected jobs: `3 items × 2 prompts × 2 models × 1 rep = 12 jobs`
- Should complete in ~30-60 seconds

### 3.6 View Results

1. Once complete, click the run card to view results
2. Verify you see:
   - ✅ Model comparison bar chart
   - ✅ Latency comparison
   - ✅ Success/failure pie chart
   - ✅ Expandable results table
   - ✅ Prompt comparison chart

---

## 🔍 Step 4: Verify All Systems

### PostgreSQL — Check Data
```bash
docker exec -it evalx-postgres psql -U evalx -d evalx -c "
SELECT 
  (SELECT COUNT(*) FROM evaluation_tasks) as tasks,
  (SELECT COUNT(*) FROM evaluation_runs) as runs,
  (SELECT COUNT(*) FROM execution_results) as results,
  (SELECT COUNT(*) FROM evaluation_failures) as failures;
"
```

### Redis — Check Progress Keys
```bash
docker exec -it evalx-redis redis-cli KEYS "run:*"
```

### Kafka — Check Topics
Open **http://localhost:8080** (Redpanda Console)
- Click **Topics**
- Verify `evaluation.tasks` and `evaluation.results` exist
- Check message counts match your test

### Grafana — Check Dashboard
1. Open **http://localhost:3030**
2. Login: `admin` / `evalx`
3. Navigate to **Dashboards → EvalX Overview**
4. Verify panels show data:
   - ✅ Total Runs count
   - ✅ Total Executions count
   - ✅ Avg Latency by Model (bar chart)
   - ✅ Recent Runs table

---

## 📊 Step 6: API Testing with cURL

### Create Task via API
```bash
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API Test Task",
    "description": "Created via cURL",
    "items": [
      {"input": "What is 2+2?", "ground_truth": "4"}
    ]
  }'
```

### List All Tasks
```bash
curl http://localhost:3000/api/tasks | jq
```

### Create Run via API
```bash
curl -X POST http://localhost:3000/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "task_id": "<TASK_UUID>",
    "models": ["llama-3.3-70b-versatile"],
    "repetitions": 1
  }'
```

### Start Run
```bash
curl -X POST http://localhost:3000/api/runs/<RUN_UUID>/start
```

### Get Run Status
```bash
curl http://localhost:3000/api/runs/<RUN_UUID> | jq
```

### Get Results
```bash
curl http://localhost:3000/api/results/run/<RUN_UUID> | jq
```

### Dashboard Stats
```bash
curl http://localhost:3000/api/stats/dashboard | jq
```

---

## 🧹 Step 7: Cleanup

### Stop All Services
```bash
# Stop app services (Ctrl+C in each terminal)

# Stop Docker infrastructure
docker compose down
```

### Full Reset (delete all data)
```bash
docker compose down -v
# This removes all volumes (PostgreSQL data, Redis data, etc.)
```

### Clear Just the Database
```bash
docker exec -it evalx-postgres psql -U evalx -d evalx -c "
TRUNCATE evaluation_failures, execution_results, evaluation_runs, 
         prompt_variants, evaluation_task_items, evaluation_tasks CASCADE;
"
```

---

## 🔑 Environment Files Reference

### api/.env
```env
DATABASE_URL=postgresql://evalx:evalx@localhost:5432/evalx
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:19092
EVALUATOR_URL=http://localhost:8000
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
GEMINI_API_KEY=AIzaxxxxxxxxxxxx
PORT=3000
```

### worker/.env
```env
KAFKA_BROKERS=localhost:19092
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
GEMINI_API_KEY=AIzaxxxxxxxxxxxx
```

### evaluator/.env
```env
GROQ_API_KEY=gsk_xxxxxxxxxxxxx
```

---

## 🎯 Performance Benchmarks

| Metric | Expected | Notes |
|--------|----------|-------|
| Job throughput | 10-20 jobs/sec | Limited by LLM API rate limits |
| Socket.io latency | < 100ms | Progress updates |
| Evaluation time | 200-500ms/job | Depends on embedding model load |
| E2E test (12 jobs) | 30-60 seconds | With 2 models |
