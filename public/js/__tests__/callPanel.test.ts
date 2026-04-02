import { describe, it, expect } from 'vitest';
import { renderCallPanelTemplate } from '../components/callPanel.js';

describe('renderCallPanelTemplate', () => {
  it('renders default template correctly', () => {
    const html = renderCallPanelTemplate();
    expect(html).toContain('call-model-badge');
    expect(html).toContain('call-voice-info');
    expect(html).toContain('Agent Name');
  });

  it('renders without hidden details when hideDetails is false', () => {
    const html = renderCallPanelTemplate({ hideDetails: false });
    expect(html).toContain('call-model-badge');
    expect(html).toContain('call-voice-info');
    expect(html).toContain('Agent Name');
  });

  it('hides sensitive configuration when hideDetails is true', () => {
    const html = renderCallPanelTemplate({ hideDetails: true });
    expect(html).not.toContain('call-model-badge');
    expect(html).not.toContain('call-voice-info');
    expect(html).toContain('Agent Web Call Preview');
  });
});
