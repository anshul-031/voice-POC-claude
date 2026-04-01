/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as apiModule from '../api.js';
import * as utils from '../utils.js';
import { buildPreviewUrl, copyPreviewUrl, togglePublicPreview } from '../previewLinks.js';

describe('previewLinks.js', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('location', {
      origin: 'http://localhost:3000',
    });
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    vi.spyOn(apiModule, 'api').mockResolvedValue({});
    vi.spyOn(utils, 'showToast').mockImplementation(() => {});
  });

  it('buildPreviewUrl should format share URL', () => {
    expect(buildPreviewUrl('agent-1')).toBe('http://localhost:3000/preview/agent-1');
    expect(buildPreviewUrl('a b')).toBe('http://localhost:3000/preview/a%20b');
  });

  it('copyPreviewUrl should write to clipboard and show success toast', async () => {
    await copyPreviewUrl('agent-1');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:3000/preview/agent-1');
    expect(utils.showToast).toHaveBeenCalled();
  });

  it('copyPreviewUrl should fallback to info toast on clipboard failure', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('clipboard')) },
    });

    await copyPreviewUrl('agent-2');
    expect(utils.showToast).toHaveBeenCalledWith('http://localhost:3000/preview/agent-2', 'info');
  });

  it('togglePublicPreview should call API and rethrow on failure', async () => {
    await togglePublicPreview('agent-1', true);
    expect(apiModule.api).toHaveBeenCalledWith('/agents/agent-1', {
      method: 'PUT',
      body: JSON.stringify({ publicPreviewEnabled: true }),
    });

    vi.mocked(apiModule.api).mockRejectedValueOnce(new Error('fail'));
    await expect(togglePublicPreview('agent-2', false)).rejects.toThrow('fail');
    expect(utils.showToast).toHaveBeenCalled();

    vi.mocked(apiModule.api).mockRejectedValueOnce('plain-string');
    await expect(togglePublicPreview('agent-3', false)).rejects.toEqual('plain-string');
  });
});
