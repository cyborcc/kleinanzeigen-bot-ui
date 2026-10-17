// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { GALLERY_TILE_DRAG_TYPE, isGalleryTileDrag, resolveDropIntent } from '../dropIntent';

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

describe('isGalleryTileDrag', () => {
  it('recognises a tile move even though Chromium also lists "Files" for it', () => {
    expect(isGalleryTileDrag(['Files', GALLERY_TILE_DRAG_TYPE])).toBe(true);
  });

  it('does not treat files dragged in from outside as a tile move', () => {
    expect(isGalleryTileDrag(['Files'])).toBe(false);
  });
});
