import { describe, it, expect } from 'vitest';
import {
  extractTemplateVariables,
  substituteTemplateVariables,
} from '../utils/templateVariables.js';

describe('templateVariables (server)', () => {
  describe('extractTemplateVariables', () => {
    it('returns empty array for empty/blank input', () => {
      expect(extractTemplateVariables('')).toEqual([]);
      expect(extractTemplateVariables('no placeholders here')).toEqual([]);
    });

    it('extracts unique names in order of first appearance', () => {
      const prompt = 'Hi {{name}}, your order {{order_id}} for {{name}} is ready.';
      expect(extractTemplateVariables(prompt)).toEqual(['name', 'order_id']);
    });

    it('tolerates whitespace inside the braces', () => {
      expect(extractTemplateVariables('Hello {{  customer_name  }}')).toEqual(['customer_name']);
    });

    it('ignores malformed or unsupported placeholders', () => {
      expect(extractTemplateVariables('{{ bad-name }} {{good_1}} {{}}')).toEqual(['good_1']);
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

    it('replaces matching placeholders with their values', () => {
      const result = substituteTemplateVariables(
        'Hi {{name}}, balance is {{amount}}.',
        { name: 'Sam', amount: '$10' },
      );
      expect(result).toBe('Hi Sam, balance is $10.');
    });

    it('leaves placeholders without a (non-empty) value untouched', () => {
      const result = substituteTemplateVariables(
        'Hi {{name}} from {{city}}',
        { name: 'Sam', city: '' },
      );
      expect(result).toBe('Hi Sam from {{city}}');
    });

    it('handles a repeated placeholder', () => {
      expect(substituteTemplateVariables('{{x}}-{{x}}', { x: 'A' })).toBe('A-A');
    });
  });
});
