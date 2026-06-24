/**
 * Renders and collects values for `{{variable}}` placeholders found in an agent's
 * system prompt, shown inside the web-call panel before a call starts.
 */
import { UI_STRINGS } from '../constants/uiStrings.js';
import { extractTemplateVariables } from '../utils/templateVariables.js';

const CONTAINER_ID = 'call-variables';

/**
 * @param {string} name
 * @returns {HTMLDivElement}
 */
function buildVariableField(name) {
  const field = document.createElement('div');
  field.className = 'call-variable-field';

  const label = document.createElement('label');
  label.className = 'call-variable-label';
  label.textContent = name;
  label.setAttribute('for', `call-variable-${name}`);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'call-variable-input';
  input.id = `call-variable-${name}`;
  input.dataset.variableName = name;
  input.setAttribute('placeholder', UI_STRINGS.callPanel.variables.placeholder(name));

  field.appendChild(label);
  field.appendChild(input);
  return field;
}

/**
 * Render an input for each variable referenced in the system prompt.
 * Hides the section entirely when the prompt declares no variables.
 * @param {string | undefined | null} systemPrompt
 * @returns {string[]} the variable names that were rendered
 */
export function renderCallVariableInputs(systemPrompt) {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return [];

  const variables = extractTemplateVariables(systemPrompt || '');
  container.innerHTML = '';

  if (variables.length === 0) {
    container.classList.add('hidden');
    return [];
  }

  const header = document.createElement('div');
  header.className = 'call-variables-header';
  header.textContent = UI_STRINGS.callPanel.variables.title;
  container.appendChild(header);

  const hint = document.createElement('div');
  hint.className = 'call-variables-hint';
  hint.textContent = UI_STRINGS.callPanel.variables.hint;
  container.appendChild(hint);

  variables.forEach((name) => container.appendChild(buildVariableField(name)));
  container.classList.remove('hidden');
  return variables;
}

/**
 * Read the current variable values entered by the user.
 * @returns {Record<string, string>}
 */
export function collectCallVariableValues() {
  const container = document.getElementById(CONTAINER_ID);
  if (!container) return {};

  /** @type {Record<string, string>} */
  const values = {};
  const inputs = container.querySelectorAll('input[data-variable-name]');
  inputs.forEach((node) => {
    const input = /** @type {HTMLInputElement} */ (node);
    const name = input.dataset.variableName;
    const value = input.value.trim();
    if (name && value) {
      values[name] = value;
    }
  });
  return values;
}
