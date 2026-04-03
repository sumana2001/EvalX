from fastapi import FastAPI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="EvalX Evaluator",
    description="Python evaluation service for schema validation, RAG metrics, and LLM-as-a-Judge",
    version="1.0.0"
)


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "evalx-evaluator"}


# Placeholder - POST /evaluate endpoint will be implemented in Phase 4
