import { describe, it, expect } from 'vitest';
import {
  extractTemplateVariables,
  substituteTemplateVariables,
} from '../utils/templateVariables.js';

describe('templateVariables (client)', () => {
  describe('extractTemplateVariables', () => {
    it('returns empty array for empty input', () => {
      expect(extractTemplateVariables('')).toEqual([]);
    });

    it('extracts unique names in order of first appearance', () => {
      const prompt = 'Hi {{name}}, your order {{order_id}} for {{name}} is ready.';
      expect(extractTemplateVariables(prompt)).toEqual(['name', 'order_id']);
    });

    it('tolerates whitespace and ignores malformed names', () => {
      expect(extractTemplateVariables('{{ first_1 }} {{bad-name}}')).toEqual(['first_1']);
    });
  });

  describe('substituteTemplateVariables', () => {
    it('returns the template unchanged when there are no values', () => {
      expect(substituteTemplateVariables('Hi {{name}}', undefined)).toBe('Hi {{name}}');
      expect(substituteTemplateVariables('Hi {{name}}', null)).toBe('Hi {{name}}');
    });

    it('returns empty template unchanged', () => {
      expect(substituteTemplateVariables('', { name: 'x' })).toBe('');
    });

    it('replaces matching placeholders and leaves unmatched ones', () => {
      const result = substituteTemplateVariables(
        'Hi {{name}} from {{city}}',
        { name: 'Sam', city: '' },
      );
      expect(result).toBe('Hi Sam from {{city}}');
    });
  });
});
