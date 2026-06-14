/**
 * Keyed in-place reconciliation for a list container.
 *
 * Instead of `container.innerHTML = items.map(render).join('')` — which destroys
 * and recreates every node on each poll and therefore resets the container's
 * scroll position — this keeps existing nodes alive across renders:
 *
 *   - Unchanged items keep their exact DOM node (no work, no scroll jump).
 *   - Changed items keep their node; only the markup inside is refreshed.
 *   - New items are created; removed items are dropped; order is fixed up by
 *     moving (not recreating) surviving nodes.
 *
 * Because untouched nodes are never detached, the browser has no reason to move
 * the scroll position when the polled data is identical (the common case).
 *
 * @param {Element} container - the list element whose children are the cards.
 * @param {Array} items - the new data, in desired display order.
 * @param {object} opts
 * @param {(item:any)=>string} opts.keyOf - stable identity for an item.
 * @param {(item:any)=>string} opts.renderItem - full card markup for an item.
 * @param {string} [opts.emptyHTML] - markup shown when items is empty.
 * @param {(html:string)=>Element} [opts.createNode] - builds a node from card
 *   markup (injectable for tests; defaults to a detached-div parse).
 */
export function reconcileGrid(container, items, opts) {
  const { keyOf, renderItem, emptyHTML = '' } = opts;
  const createNode = opts.createNode || defaultCreateNode;

  if (!items || items.length === 0) {
    if (container.innerHTML !== emptyHTML) container.innerHTML = emptyHTML;
    return;
  }

  // Index surviving nodes by key. A node carries its last rendered markup so we
  // can skip touching it when nothing changed.
  const existing = new Map();
  for (const node of Array.from(container.children)) {
    const key = node.dataset ? node.dataset.id : undefined;
    if (key != null && key !== '' && !existing.has(key)) existing.set(key, node);
    else container.removeChild(node); // stray/placeholder/duplicate node
  }

  let cursor = container.firstChild;
  for (const item of items) {
    const key = String(keyOf(item));
    const html = renderItem(item);
    let node = existing.get(key);

    if (node) {
      existing.delete(key);
      if (node._renderedHTML !== html) {
        node.innerHTML = html;
        node._renderedHTML = html;
      }
    } else {
      node = createNode(html);
      node._renderedHTML = html;
    }

    if (cursor === node) {
      cursor = node.nextSibling;
    } else {
      container.insertBefore(node, cursor);
    }
  }

  // Anything left in `existing` was removed from the data set.
  for (const node of existing.values()) container.removeChild(node);
}

function defaultCreateNode(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.firstElementChild || tmp;
}
