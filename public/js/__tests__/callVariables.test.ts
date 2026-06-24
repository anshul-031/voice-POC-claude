/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  renderCallVariableInputs,
  collectCallVariableValues,
} from '../components/callVariables.js';

describe('callVariables', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="call-variables" class="hidden"></div>';
  });

  describe('renderCallVariableInputs', () => {
    it('returns [] and does nothing when the container is missing', () => {
      document.body.innerHTML = '';
      expect(renderCallVariableInputs('Hi {{name}}')).toEqual([]);
    });

    it('hides the section when the prompt declares no variables', () => {
      const result = renderCallVariableInputs('Just a plain prompt');
      const container = document.getElementById('call-variables');
      expect(result).toEqual([]);
      expect(container?.classList.contains('hidden')).toBe(true);
      expect(container?.innerHTML).toBe('');
    });

    it('handles empty/undefined prompt', () => {
      expect(renderCallVariableInputs(undefined)).toEqual([]);
      expect(renderCallVariableInputs('')).toEqual([]);
    });

    it('renders an input per unique variable and reveals the section', () => {
      const result = renderCallVariableInputs('Hi {{name}}, order {{order_id}} for {{name}}');
      const container = document.getElementById('call-variables');

      expect(result).toEqual(['name', 'order_id']);
      expect(container?.classList.contains('hidden')).toBe(false);
      expect(container?.querySelector('.call-variables-header')).not.toBeNull();
      expect(container?.querySelector('.call-variables-hint')).not.toBeNull();

      const inputs = container?.querySelectorAll('input[data-variable-name]');
      expect(inputs?.length).toBe(2);
      expect((inputs?.[0] as HTMLInputElement).dataset.variableName).toBe('name');
      expect((inputs?.[1] as HTMLInputElement).id).toBe('call-variable-order_id');
    });
  });

  describe('collectCallVariableValues', () => {
    it('returns {} when the container is missing', () => {
      document.body.innerHTML = '';
      expect(collectCallVariableValues()).toEqual({});
    });

    it('collects trimmed, non-empty values keyed by variable name', () => {
      renderCallVariableInputs('Hi {{name}} from {{city}}');
      const nameInput = document.getElementById('call-variable-name') as HTMLInputElement;
      const cityInput = document.getElementById('call-variable-city') as HTMLInputElement;
      nameInput.value = '  Sam  ';
      cityInput.value = '';

      expect(collectCallVariableValues()).toEqual({ name: 'Sam' });
    });
  });
});
