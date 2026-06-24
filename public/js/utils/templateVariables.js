/**
 * Client-side helpers for `{{variable}}` placeholders inside system prompts.
 * Mirrors the server implementation in src/utils/templateVariables.ts.
 */

/** Matches `{{ name }}` placeholders, capturing the trimmed variable name. */
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Extract the unique variable names referenced in a template, in order of first appearance.
 * @param {string} template
 * @returns {string[]}
 */
export function extractTemplateVariables(template) {
  if (!template) return [];

  const seen = new Set();
  const ordered = [];
  for (const match of template.matchAll(TEMPLATE_VARIABLE_PATTERN)) {
    const name = match[1];
    if (!seen.has(name)) {
      seen.add(name);
      ordered.push(name);
    }
  }
  return ordered;
}

/**
 * Replace `{{variable}}` placeholders with their provided values.
 * Placeholders without a matching (non-empty) value are left untouched.
 * @param {string} template
 * @param {Record<string, string> | null | undefined} values
 * @returns {string}
 */
export function substituteTemplateVariables(template, values) {
  if (!template || !values) return template;

  return template.replace(TEMPLATE_VARIABLE_PATTERN, (token, name) => {
    const value = values[name];
    if (typeof value !== 'string' || value.length === 0) {
      return token;
    }
    return value;
  });
}
