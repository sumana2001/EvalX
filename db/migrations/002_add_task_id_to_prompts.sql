-- EvalX Database Schema
-- Migration: 002_add_task_id_to_prompts.sql
-- Description: Link prompt variants to tasks for easier management

-- Add task_id column to prompt_variants (optional, for task-specific prompts)
ALTER TABLE prompt_variants 
ADD COLUMN task_id UUID REFERENCES evaluation_tasks(id) ON DELETE CASCADE;

-- Index for looking up prompts by task
CREATE INDEX idx_prompt_variants_task_id ON prompt_variants(task_id);

-- Drop the unique constraint on (name, version) since we now scope by task
ALTER TABLE prompt_variants DROP CONSTRAINT IF EXISTS prompt_variants_name_version_key;

-- Add new unique constraint scoped to task
ALTER TABLE prompt_variants ADD CONSTRAINT prompt_variants_task_name_version_key 
UNIQUE(task_id, name, version);
