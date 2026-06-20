import { useEffect, useRef } from 'react';
import { registerFloorEditorPanel } from '@core/floor-editor.js';
import { PanoramaWorkspace } from '@core/workspace-shell.js';

// The floor editor is a large, self-contained imperative subsystem. Rather than
// rewrite it, we reuse the v1 implementation: register its panel type once, then
// call its mount(container) into a React-owned element. It manages its own DOM,
// drag handles and IndexedDB persistence inside the container.
/* eslint-disable @typescript-eslint/no-explicit-any */
let registered = false;
function ensureRegistered() {
  if (registered) return;
  registerFloorEditorPanel();
  registered = true;
}

export function FloorEditorView() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ensureRegistered();
    const el = ref.current;
    if (!el) return;
    const def = (PanoramaWorkspace as any).getRegistry().get('floor-editor');
    el.innerHTML = '';
    def?.mount?.(el);
    return () => { el.innerHTML = ''; };
  }, []);

  return <div ref={ref} style={{ height: '100%' }} />;
}
