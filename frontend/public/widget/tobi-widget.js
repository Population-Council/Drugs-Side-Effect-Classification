(() => {
  // Prevent double-inject
  if (window.__TOBI_WIDGET_LOADED__) return;
  window.__TOBI_WIDGET_LOADED__ = true;

  const SCRIPT = document.currentScript;
  const cfg = {
    api: (SCRIPT.dataset.api || '').replace(/\/+$/, '') || 'https://main.d2bc2oeybri07n.amplifyapp.com',
    projectId: SCRIPT.dataset.projectId || '',
    position: (SCRIPT.dataset.position || 'bottom-right').toLowerCase(),
    autoOpen: (SCRIPT.dataset.autoOpen || 'false') === 'true',
    title: SCRIPT.dataset.title || 'Tobi',
    zIndex: parseInt(SCRIPT.dataset.zIndex || '2147483000', 10)
  };

  // Shadow root to isolate styles
  const host = document.createElement('div');
  host.setAttribute('id', 'tobi-widget-host');
  host.style.all = 'initial';
  host.style.position = 'fixed';
  host.style.zIndex = String(cfg.zIndex);
  host.style.pointerEvents = 'none';
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .tw-container { pointer-events: auto; position: fixed; inset: auto; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    .tw-btn {
      position: fixed;
      width: 56px; height: 56px; border-radius: 50%;
      display: inline-flex; align-items: center; justify-content: center;
      background: #1f2937; color: #fff; border: 0; cursor: pointer;
      box-shadow: 0 10px 30px rgba(0,0,0,.25);
      transition: transform .15s ease, box-shadow .15s ease, opacity .2s ease;
    }
    .tw-btn:focus { outline: none; box-shadow: 0 0 0 3px rgba(59,130,246,.4), 0 10px 30px rgba(0,0,0,.25); }
    .tw-btn:hover { transform: translateY(-1px); }
    .tw-panel {
      position: fixed;
      width: min(380px, calc(100vw - 24px));
      height: min(560px, calc(100vh - 24px));
      max-height: calc(100vh - 24px);
      background: #fff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 18px 60px rgba(0,0,0,.35);
      opacity: 0; transform: translateY(8px);
      pointer-events: none;
      transition: opacity .18s ease, transform .18s ease;
    }
    .tw-panel.open { opacity: 1; transform: translateY(0); pointer-events: auto; }
    .tw-iframe { width: 100%; height: 100%; border: 0; display: block; }
    .tw-close {
      position: absolute; top: 8px; right: 8px; width: 36px; height: 36px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 0; border-radius: 10px; background: rgba(0,0,0,.05); cursor: pointer;
    }
    .tw-close:focus { outline: none; box-shadow: 0 0 0 2px rgba(59,130,246,.4); }
    @media (max-width: 768px) {
      .tw-panel {
        width: min(100vw - 8px, 480px);
        height: calc(100vh - 8px - env(safe-area-inset-bottom, 0));
        border-radius: 14px;
      }
    }
  `;
  root.appendChild(style);

  // Positioning
  const pos = cfg.position === 'bottom-left' ? 'bottom-left' : 'bottom-right';
  const side = pos.endsWith('left') ? 'left' : 'right';

  // Launcher button
  const btn = document.createElement('button');
  btn.className = 'tw-btn';
  btn.setAttribute('aria-label', `${cfg.title} chat`);
  btn.style.bottom = '16px';
  btn.style[side] = '16px';
  btn.innerHTML = `
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M4 4h16v10H7l-3 3V4z"/>
    </svg>
  `;

  // Panel + iframe
  const panel = document.createElement('div');
  panel.className = 'tw-panel';
  panel.style.bottom = '80px';
  panel.style[side] = '16px';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'tw-close';
  closeBtn.setAttribute('aria-label', 'Close chat');
  closeBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>
  `;

  const iframe = document.createElement('iframe');
  const qs = new URLSearchParams({
    embedded: '1',
    projectId: cfg.projectId || ''
  });
  iframe.className = 'tw-iframe';
  iframe.setAttribute('title', cfg.title);
  iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
  iframe.src = `${cfg.api}/?${qs.toString()}`;

  panel.appendChild(closeBtn);
  panel.appendChild(iframe);

  // Mount
  const frag = document.createDocumentFragment();
  frag.appendChild(btn);
  frag.appendChild(panel);
  root.appendChild(frag);

  // Helpers
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  const lockScroll = (lock) => {
    if (!isMobile()) return;
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    document.body.style.overflow = lock ? 'hidden' : '';
    document.body.style.touchAction = lock ? 'none' : '';
  };

  const open = () => {
    panel.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    lockScroll(true);
    // Handshake to iframe
    try { iframe.contentWindow && iframe.contentWindow.postMessage({ type: 'TOBI_WIDGET_OPEN' }, '*'); } catch {}
  };

  const close = () => {
    panel.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    lockScroll(false);
    try { iframe.contentWindow && iframe.contentWindow.postMessage({ type: 'TOBI_WIDGET_CLOSE' }, '*'); } catch {}
  };

  // Events
  btn.addEventListener('click', () => {
    if (panel.classList.contains('open')) close(); else open();
  });
  closeBtn.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });
  window.addEventListener('message', (e) => {
    const msg = e && e.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'TOBI_OPEN') open();
    if (msg.type === 'TOBI_CLOSE') close();
  });

  // Respect safe-areas on iOS when open (minor polish)
  const applySafeArea = () => {
    const inset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('padding-bottom') || '0', 10);
    panel.style.bottom = isMobile() ? `max(8px, env(safe-area-inset-bottom, 0))` : '80px';
    btn.style.bottom = `max(16px, calc(16px + env(safe-area-inset-bottom, 0)))`;
  };
  applySafeArea();
  window.addEventListener('resize', applySafeArea);

  // Auto-open if requested
  if (cfg.autoOpen) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(open, 300);
    } else {
      document.addEventListener('DOMContentLoaded', () => setTimeout(open, 300));
    }
  }
})();