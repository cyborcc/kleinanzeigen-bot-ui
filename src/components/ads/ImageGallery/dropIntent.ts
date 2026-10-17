export type DropIntent = 'reorder' | 'upload' | 'none';

/**
 * Custom drag type set when a gallery tile is dragged. Chromium lists "Files" in
 * `dataTransfer.types` for such a drag as well, so form-level drop zones use this marker to
 * tell a tile move apart from files dragged in from outside the page.
 */
export const GALLERY_TILE_DRAG_TYPE = 'application/x-kleinanzeigen-gallery-tile';

export function isGalleryTileDrag(types: ReadonlyArray<string>): boolean {
  return types.includes(GALLERY_TILE_DRAG_TYPE);
}

/**
 * Decide what a drop inside the gallery means.
 *
 * A drag that started on a gallery tile always wins over files in `dataTransfer`: Chromium
 * attaches the dragged <img> itself as a File, so checking for files first re-uploads the
 * tile as a duplicate image instead of reordering it. Firefox sends no file, which is why
 * only Chromium-based browsers showed the bug.
 */
export function resolveDropIntent(dragIndex: number | null, hasFiles: boolean): DropIntent {
  if (dragIndex !== null) return 'reorder';
  return hasFiles ? 'upload' : 'none';
}
