/**
 * Region selection overlay, injected on demand into the active tab.
 *
 * Everything lives inside a closed shadow root on a single host element, so
 * the page cannot style it, read it, or reach into it. The host is the only
 * trace left in the page, and it is removed as soon as the capture is taken.
 */
(() => {
  const HOST_ID = 'snaplocal-area-overlay';
  const MIN_SIZE = 5;

  const CSS = `
    :host { all: initial; }
    /* Author rules beat the browser's own [hidden] rule, and .bar/.hint both
       set display, so the attribute needs to be enforced explicitly here. */
    [hidden] { display: none !important; }
    .layer { position: fixed; inset: 0; cursor: crosshair; }
    .dim { position: fixed; inset: 0; background: rgba(12, 16, 22, .42); }

    .cross { position: fixed; background: rgba(255,255,255,.75);
             box-shadow: 0 0 0 1px rgba(0,0,0,.35); pointer-events: none; }
    .cross.v { top: 0; bottom: 0; width: 1px; }
    .cross.h { left: 0; right: 0; height: 1px; }

    /* One huge spread shadow dims everything outside the selection, so the
       chosen region stays perfectly untinted with no second element. */
    .sel { position: fixed; box-shadow: 0 0 0 100vmax rgba(12, 16, 22, .42);
           outline: 1px solid rgba(255,255,255,.9);
           outline-offset: -1px; pointer-events: none; }

    .size { position: absolute; top: -26px; left: 0; white-space: nowrap;
            font: 600 12px/1 ui-monospace, "Segoe UI", system-ui, sans-serif;
            color: #fff; background: rgba(12,16,22,.88); padding: 5px 8px;
            border-radius: 5px; font-variant-numeric: tabular-nums; }
    .size[data-inside] { top: 6px; left: 6px; }

    .hint { position: fixed; left: 50%; top: 24px; transform: translateX(-50%);
            display: flex; gap: 14px; align-items: center; pointer-events: none;
            font: 13px/1.2 "Segoe UI", system-ui, sans-serif; color: #fff;
            background: rgba(12,16,22,.88); padding: 10px 16px; border-radius: 999px; }
    .hint b { font-weight: 600; }
    .hint span { opacity: .72; font-size: 12px; }

    .bar { position: fixed; display: flex; gap: 6px; padding: 6px;
           background: #1e2126; border: 1px solid #32363d; border-radius: 10px;
           box-shadow: 0 6px 20px rgba(0,0,0,.35); }
    .bar button { font: 13px "Segoe UI", system-ui, sans-serif; color: #e8eaed;
                  background: transparent; border: 1px solid transparent;
                  border-radius: 7px; padding: 7px 13px; cursor: pointer; }
    .bar button:hover { background: #2a2e35; }
    .bar button.primary { background: #2563eb; border-color: #2563eb; color: #fff; }
    .bar button.primary:hover { filter: brightness(1.1); }
  `;

  /**
   * `options.instant` captures the moment the mouse is released. The action bar
   * is the deliberate, reviewable path; instant is the fast one, and it is the
   * default because the common case is knowing what you want before you drag.
   */
  function open(strings, options = {}) {
    document.getElementById(HOST_ID)?.remove();

    const host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });

    // Montado nó a nó em vez de por innerHTML. O template era estático e não
    // levava dado do usuário, mas a validação da AMO sinaliza a atribuição
    // mesmo assim, e um aviso de segurança numa extensão que se vende como
    // auditável custa mais do que este punhado de linhas.
    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    const style = make('style');
    style.textContent = CSS;

    const dim = make('div', 'dim');
    const crossV = make('div', 'cross v');
    const crossH = make('div', 'cross h');

    const hint = make('div', 'hint');
    hint.append(make('b', null, strings.hint),
                make('span', null, strings.fullscreen),
                make('span', null, strings.cancel));

    const size = make('div', 'size');
    const sel = make('div', 'sel');
    sel.hidden = true;
    sel.append(size);

    const cancelButton = make('button', 'cancel', strings.cancelAction);
    const saveButton = make('button', 'save', strings.save);
    const captureButton = make('button', 'primary capture', strings.capture);
    const bar = make('div', 'bar');
    bar.hidden = true;
    bar.append(cancelButton, saveButton, captureButton);

    const layer = make('div', 'layer');
    layer.append(dim, crossV, crossH, hint, sel, bar);

    root.append(style, layer);
    document.documentElement.append(host);

    let start = null;
    let rect = null;
    let done = false;

    const norm = (a, b) => ({
      x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
      w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y)
    });

    function paint() {
      sel.hidden = false;
      dim.hidden = true;
      Object.assign(sel.style, {
        left: `${rect.x}px`, top: `${rect.y}px`,
        width: `${rect.w}px`, height: `${rect.h}px`
      });
      size.textContent = strings.dimensions
        .replace('{w}', Math.round(rect.w))
        .replace('{h}', Math.round(rect.h));
      // The readout sits above the selection, unless the selection is hard
      // against the top of the viewport and there is no room for it there.
      size.toggleAttribute('data-inside', rect.y < 30);
    }

    function placeBar() {
      bar.hidden = false;
      const width = bar.offsetWidth;
      const height = bar.offsetHeight;
      const below = rect.y + rect.h + 10;
      const top = below + height < innerHeight ? below
        : Math.max(10, rect.y - height - 10);
      const left = Math.min(Math.max(10, rect.x + rect.w - width), innerWidth - width - 10);
      bar.style.top = `${top}px`;
      bar.style.left = `${left}px`;
    }

    function close() {
      done = true;
      removeEventListener('keydown', onKey, true);
      host.remove();
    }

    /**
     * Hides the overlay, waits for the browser to actually paint that, and only
     * then asks for the capture: otherwise the dimming and the toolbar end up
     * baked into the screenshot.
     */
    function confirm(action) {
      if (!rect || rect.w < MIN_SIZE || rect.h < MIN_SIZE) return;
      done = true;
      removeEventListener('keydown', onKey, true);
      host.style.display = 'none';

      requestAnimationFrame(() => requestAnimationFrame(() => {
        chrome.runtime.sendMessage({
          type: 'area-selected',
          action,
          rect,
          viewport: { w: innerWidth, h: innerHeight }
        }, () => host.remove());
      }));
    }

    function onMove(event) {
      crossV.style.left = `${event.clientX}px`;
      crossH.style.top = `${event.clientY}px`;
      if (!start) return;
      rect = norm(start, { x: event.clientX, y: event.clientY });
      paint();
    }

    layer.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || done) return;
      if (bar.contains(event.composedPath()[0])) return;
      event.preventDefault();
      bar.hidden = true;
      start = { x: event.clientX, y: event.clientY };
      rect = { x: start.x, y: start.y, w: 0, h: 0 };
      layer.setPointerCapture(event.pointerId);
    });

    layer.addEventListener('pointermove', onMove);

    layer.addEventListener('pointerup', () => {
      if (!start) return;
      start = null;
      crossV.hidden = crossH.hidden = true;
      hint.hidden = true;
      if (rect.w < MIN_SIZE || rect.h < MIN_SIZE) {
        sel.hidden = true;
        dim.hidden = false;
        crossV.hidden = crossH.hidden = false;
        hint.hidden = false;
        rect = null;
        return;
      }
      if (options.instant) confirm('edit');
      else placeBar();
    });

    captureButton.addEventListener('click', () => confirm('edit'));
    saveButton.addEventListener('click', () => confirm('save'));
    cancelButton.addEventListener('click', close);

    function onKey(event) {
      if (done) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      } else if (event.key === ' ' && !rect) {
        event.preventDefault();
        event.stopPropagation();
        rect = { x: 0, y: 0, w: innerWidth, h: innerHeight };
        confirm('edit');
      } else if (event.key === 'Enter' && rect) {
        event.preventDefault();
        event.stopPropagation();
        confirm('edit');
      }
    }

    addEventListener('keydown', onKey, true);
  }

  globalThis.__snapLocalArea = { open };
})();
