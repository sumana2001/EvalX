/**
 * Prompt Formatter - Substitutes placeholders in prompt templates.
 * 
 * Placeholders:
 *   {{input}}   - The user's input/question
 *   {{context}} - RAG context (retrieved documents)
 * 
 * Example:
 *   template: "Answer: {{input}}\n\nContext: {{context}}"
 *   input: "What is the capital of France?"
 *   context: "France is a country in Europe. Its capital is Paris."
 *   result: "Answer: What is the capital of France?\n\nContext: France is a country..."
 */

/**
 * Format a prompt template with the given variables.
 * 
 * @param {string} template - Prompt template with {{placeholders}}
 * @param {object} variables - Key-value pairs to substitute
 * @returns {string} - Formatted prompt
 */
export function formatPrompt(template, variables = {}) {
  let formatted = template;

  // Replace each placeholder
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    // Replace all occurrences (global replace)
    formatted = formatted.split(placeholder).join(value ?? '');
  }

  // Warn about any remaining placeholders
  const remaining = formatted.match(/\{\{[^}]+\}\}/g);
  if (remaining) {
    console.warn(`[PromptFormatter] Unresolved placeholders: ${remaining.join(', ')}`);
  }

  return formatted;
}

/**
 * Format a job's prompt using task item data.
 * 
 * @param {object} job - Job from Kafka
 * @returns {string} - Formatted prompt ready for LLM
 */
export function formatJobPrompt(job) {
  const { task_item, prompt_variant } = job;

  return formatPrompt(prompt_variant.template, {
    input: task_item.input,
    context: task_item.context || '',
  });
}

/**
 * Validate that a template has required placeholders.
 * 
 * @param {string} template - Prompt template
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateTemplate(template) {
  const required = ['{{input}}'];
  const missing = required.filter((p) => !template.includes(p));

  return {
    valid: missing.length === 0,
    missing,
  };
}
