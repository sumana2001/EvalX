-- EvalX Database Schema
-- Migration: 001_init.sql
-- Description: Core tables, pgvector extension, and indexes

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";  -- UUID generation
CREATE EXTENSION IF NOT EXISTS "vector";      -- pgvector for embeddings

-- ============================================================
-- Enum Types
-- ============================================================

-- Run lifecycle states
CREATE TYPE run_status AS ENUM (
    'pending',      -- Created, not yet started
    'running',      -- Jobs being processed
    'completed',    -- All jobs finished
    'failed',       -- Critical failure, run aborted
    'cancelled'     -- User cancelled
);

-- Failure classification from spec
CREATE TYPE failure_type AS ENUM (
    'SCHEMA_VIOLATION',       -- Output is not valid JSON or fails schema
    'INCOMPLETE_OUTPUT',      -- Completeness score < 0.5
    'HALLUCINATION_DETECTED', -- Faithfulness < 0.4 AND hallucination flag
    'LOW_QUALITY',            -- Judge score < 4
    'TIMEOUT',                -- LLM API timed out
    'PROVIDER_ERROR',         -- LLM API returned error
    'EVALUATOR_ERROR'         -- Python evaluator failed
);

-- ============================================================
-- Core Tables
-- ============================================================

-- Evaluation Tasks: Defines a test suite with expected schema
CREATE TABLE evaluation_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- JSON Schema that LLM outputs must conform to
    expected_schema JSONB NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing tasks by name
CREATE INDEX idx_evaluation_tasks_name ON evaluation_tasks(name);

-- ============================================================
-- Task Items: Individual dataset rows within a task
-- ============================================================
CREATE TABLE evaluation_task_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES evaluation_tasks(id) ON DELETE CASCADE,
    
    -- Input data for the evaluation
    input TEXT NOT NULL,                           -- The question/prompt input
    context TEXT,                                  -- RAG context (retrieved docs)
    ground_truth TEXT,                             -- Expected correct answer
    
    -- Pre-computed embeddings (384 dimensions for all-MiniLM-L6-v2)
    -- Stored here to avoid re-computing during evaluation
    input_embedding vector(384),
    context_embedding vector(384),
    
    -- Optional metadata
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by task
CREATE INDEX idx_task_items_task_id ON evaluation_task_items(task_id);

-- HNSW index for vector similarity search (cosine distance)
-- ef_construction: build-time accuracy (higher = slower build, better recall)
-- m: connections per node (higher = more memory, better recall)
CREATE INDEX idx_task_items_input_embedding ON evaluation_task_items 
    USING hnsw (input_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX idx_task_items_context_embedding ON evaluation_task_items 
    USING hnsw (context_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- ============================================================
-- Prompt Variants: Reusable prompt templates
-- ============================================================
CREATE TABLE prompt_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Template with placeholders: {{input}}, {{context}}
    template TEXT NOT NULL,
    
    -- Optional system prompt
    system_prompt TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE(name, version)
);

-- ============================================================
-- Evaluation Runs: A specific execution instance
-- ============================================================
CREATE TABLE evaluation_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES evaluation_tasks(id) ON DELETE CASCADE,
    
    -- Run configuration
    name VARCHAR(255),
    status run_status NOT NULL DEFAULT 'pending',
    
    -- Models to test (e.g., ["llama-3.3-70b", "gemini-1.5-pro"])
    models TEXT[] NOT NULL,
    
    -- Number of times to repeat each (input × prompt × model) combination
    repetitions INTEGER NOT NULL DEFAULT 1 CHECK (repetitions >= 1),
    
    -- Computed counts (set when run starts)
    total_jobs INTEGER NOT NULL DEFAULT 0,
    completed_jobs INTEGER NOT NULL DEFAULT 0,
    failed_jobs INTEGER NOT NULL DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for listing runs by status
CREATE INDEX idx_evaluation_runs_status ON evaluation_runs(status);
CREATE INDEX idx_evaluation_runs_task_id ON evaluation_runs(task_id);

-- ============================================================
-- Run-Prompt Junction: Links runs to prompt variants
-- ============================================================
CREATE TABLE run_prompt_variants (
    run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    prompt_variant_id UUID NOT NULL REFERENCES prompt_variants(id) ON DELETE CASCADE,
    
    PRIMARY KEY (run_id, prompt_variant_id)
);

-- ============================================================
-- Execution Results: Core metrics for each job
-- ============================================================
CREATE TABLE execution_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    task_item_id UUID NOT NULL REFERENCES evaluation_task_items(id) ON DELETE CASCADE,
    prompt_variant_id UUID NOT NULL REFERENCES prompt_variants(id) ON DELETE CASCADE,
    
    -- Execution context
    model VARCHAR(255) NOT NULL,
    repetition_index INTEGER NOT NULL DEFAULT 1,
    
    -- Raw LLM output
    raw_output TEXT,
    
    -- The 5 Pillars (from spec)
    schema_valid BOOLEAN,                    -- Pillar 1: JSON schema validation
    completeness FLOAT CHECK (completeness >= 0 AND completeness <= 1),  -- Pillar 2
    context_relevance FLOAT CHECK (context_relevance >= 0 AND context_relevance <= 1),  -- Pillar 3
    faithfulness FLOAT CHECK (faithfulness >= 0 AND faithfulness <= 1),  -- Pillar 4
    judge_score INTEGER CHECK (judge_score >= 1 AND judge_score <= 10),  -- Pillar 5
    
    -- Additional metrics (flexible JSONB for future expansion)
    metrics JSONB DEFAULT '{}',
    
    -- Performance data
    latency_ms INTEGER,                      -- Time to first token or completion
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_usd NUMERIC(10, 6),       -- Cost estimate in USD
    
    -- Timestamps
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite indexes for common query patterns
CREATE INDEX idx_execution_results_run_id ON execution_results(run_id);
CREATE INDEX idx_execution_results_model ON execution_results(model);
CREATE INDEX idx_execution_results_run_model ON execution_results(run_id, model);

-- Index for aggregation queries (avg score by model/prompt)
CREATE INDEX idx_execution_results_aggregation ON execution_results(
    run_id, model, prompt_variant_id
);

-- ============================================================
-- Evaluation Failures: Dead-letter queue for failed jobs
-- ============================================================
CREATE TABLE evaluation_failures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES evaluation_runs(id) ON DELETE CASCADE,
    task_item_id UUID NOT NULL REFERENCES evaluation_task_items(id) ON DELETE CASCADE,
    prompt_variant_id UUID NOT NULL REFERENCES prompt_variants(id) ON DELETE CASCADE,
    
    model VARCHAR(255) NOT NULL,
    repetition_index INTEGER NOT NULL DEFAULT 1,
    
    -- Failure details
    failure_type failure_type NOT NULL,
    error_message TEXT,
    error_stack TEXT,
    
    -- Raw output that caused failure (for debugging)
    raw_output TEXT,
    
    -- Retry tracking
    retry_count INTEGER NOT NULL DEFAULT 0,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evaluation_failures_run_id ON evaluation_failures(run_id);
CREATE INDEX idx_evaluation_failures_type ON evaluation_failures(failure_type);

-- ============================================================
-- Trigger: Auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_evaluation_tasks_updated_at
    BEFORE UPDATE ON evaluation_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
