export type DropIntent = 'reorder' | 'upload' | 'none';

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
