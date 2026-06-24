/**
 * Utilities for working with `{{variable}}` placeholders inside system prompts.
 *
 * A variable name may contain letters, digits and underscores (e.g. `{{variable_1}}`).
 * These helpers are shared by the live-call path (runtime substitution) and will be
 * reused by the upcoming call-campaign feature (bulk substitution from spreadsheet rows).
 */

/** Matches `{{ name }}` placeholders, capturing the trimmed variable name. */
const TEMPLATE_VARIABLE_PATTERN = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

/**
 * Extract the unique variable names referenced in a template, in order of first appearance.
 */
export function extractTemplateVariables(template: string): string[] {
  if (!template) return [];

  const seen = new Set<string>();
  const ordered: string[] = [];
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
 *
 * Placeholders without a matching value (or whose value is empty) are left untouched
 * so a misconfigured call never silently strips meaningful prompt text.
 */
export function substituteTemplateVariables(
  template: string,
  values: Record<string, string> | undefined | null,
): string {
  if (!template) return template;
  if (!values) return template;

  return template.replace(TEMPLATE_VARIABLE_PATTERN, (token, name: string) => {
    const value = values[name];
    if (typeof value !== 'string' || value.length === 0) {
      return token;
    }
    return value;
  });
}
