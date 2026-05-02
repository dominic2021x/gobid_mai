'use client';

import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';

/**
 * Drag & drop pentru miniaturi imagini (ordinea în array = ordinea salvată).
 */
export function useManualListingImageDnD(onReorder: (fromIndex: number, toIndex: number) => void) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = useCallback((e: DragEvent<HTMLElement>, index: number) => {
    setDraggedIndex(index);
    try {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
    } catch {
      /* ignore */
    }
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLElement>, index: number) => {
      const types = e.dataTransfer?.types ? Array.from(e.dataTransfer.types) : [];
      const isOsFileDrag = types.includes('Files');
      e.preventDefault();
      try {
        e.dataTransfer.dropEffect = isOsFileDrag ? 'copy' : 'move';
      } catch {
        /* ignore */
      }
      if (isOsFileDrag) {
        return;
      }
      e.stopPropagation();
      if (draggedIndex !== null && draggedIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [draggedIndex]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>, targetIndex: number) => {
      const from = draggedIndex;
      const hasFiles = (e.dataTransfer?.files?.length ?? 0) > 0;
      if (hasFiles && from === null) {
        e.preventDefault();
        setDraggedIndex(null);
        setDragOverIndex(null);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (from === null || from === targetIndex) {
        setDraggedIndex(null);
        setDragOverIndex(null);
        return;
      }
      onReorder(from, targetIndex);
      setDraggedIndex(null);
      setDragOverIndex(null);
    },
    [draggedIndex, onReorder]
  );

  const getSortableItemProps = useCallback(
    (index: number) => ({
      draggable: true as const,
      onDragStart: (ev: DragEvent<HTMLElement>) => handleDragStart(ev, index),
      onDragEnd: (_ev: DragEvent<HTMLElement>) => handleDragEnd(),
      onDragOver: (ev: DragEvent<HTMLElement>) => handleDragOver(ev, index),
      onDrop: (ev: DragEvent<HTMLElement>) => handleDrop(ev, index),
    }),
    [handleDragStart, handleDragEnd, handleDragOver, handleDrop]
  );

  /** Zonă țintă pentru drop (container); fără draggable — altfel butoanele din interior blochează drag-ul. */
  const getSortableTargetProps = useCallback(
    (index: number) => ({
      onDragOver: (ev: DragEvent<HTMLElement>) => handleDragOver(ev, index),
      onDrop: (ev: DragEvent<HTMLElement>) => handleDrop(ev, index),
    }),
    [handleDragOver, handleDrop]
  );

  /** Mâner de tragere (singurul element draggable). */
  const getSortableHandleProps = useCallback(
    (index: number) => ({
      draggable: true as const,
      onDragStart: (ev: DragEvent<HTMLElement>) => handleDragStart(ev, index),
      onDragEnd: () => handleDragEnd(),
    }),
    [handleDragStart, handleDragEnd]
  );

  return { draggedIndex, dragOverIndex, getSortableItemProps, getSortableTargetProps, getSortableHandleProps };
}
