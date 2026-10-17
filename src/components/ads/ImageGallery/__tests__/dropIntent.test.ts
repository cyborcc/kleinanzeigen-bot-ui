// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { resolveDropIntent } from '../dropIntent';

describe('resolveDropIntent', () => {
  it('reorders when a gallery tile is dragged and the browser sends no file (Firefox)', () => {
    expect(resolveDropIntent(2, false)).toBe('reorder');
  });

  it('reorders when a gallery tile is dragged and the browser attaches the image as a file (Chromium)', () => {
    expect(resolveDropIntent(0, true)).toBe('reorder');
  });

  it('treats index 0 as an active drag, not as "no drag"', () => {
    expect(resolveDropIntent(0, false)).toBe('reorder');
  });

  it('uploads files dropped from outside the gallery', () => {
    expect(resolveDropIntent(null, true)).toBe('upload');
  });

  it('ignores drops that carry neither a tile drag nor files', () => {
    expect(resolveDropIntent(null, false)).toBe('none');
  });
});
