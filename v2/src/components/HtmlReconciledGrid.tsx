import { useEffect, useRef } from 'react';
import { reconcileGrid } from '@core/ui/reconcile-grid.js';

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => string;
  emptyHTML?: string;
  className?: string;
  id?: string;
  onClick?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

/**
 * Renders an HTML-string list (the ported v1 card markup) through the keyed
 * `reconcileGrid` instead of `dangerouslySetInnerHTML`. React owns the wrapper
 * element but none of its children — the effect reconciles them, diffing each
 * card by its rendered markup so an unchanged card keeps its exact DOM node (and
 * its external-sprite icons never re-resolve). Only the cards whose markup
 * actually changed are rewritten; the rest are left untouched on every poll.
 */
export function HtmlReconciledGrid<T>({ items, keyOf, renderItem, emptyHTML, className, id, onClick, onKeyDown }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  // Reconcile after every render. The diff is cheap (a string compare per card)
  // and skips every card that didn't change, so this is effectively free when
  // the poll returns identical data.
  useEffect(() => {
    if (ref.current) reconcileGrid(ref.current, items, { keyOf, renderItem, emptyHTML });
  });
  return <div ref={ref} className={className} id={id} onClick={onClick} onKeyDown={onKeyDown} />;
}
