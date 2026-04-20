// content.js - テキストエリアへのゴーストテキスト補完を注入する

const FW = {
  observed: new WeakMap(),
  settings: { enabled: true, delay: 1, baseUrl: '', apiKey: '', model: 'gpt-4o-mini', systemPrompt: '' },
};

// 設定の初期ロードと変更監視
chrome.storage.sync.get(
  ['enabled', 'delay', 'baseUrl', 'apiKey', 'model', 'systemPrompt'],
  (data) => Object.assign(FW.settings, data)
);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  for (const [k, v] of Object.entries(changes)) FW.settings[k] = v.newValue;
});

// テキストエリアのスタイルをオーバーレイにコピーするプロパティ
const STYLE_PROPS = [
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant',
  'lineHeight', 'letterSpacing', 'textIndent', 'wordSpacing',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
  'boxSizing', 'textAlign', 'direction',
];

function initTextarea(el) {
  if (FW.observed.has(el)) return;
  FW.observed.set(el, true);

  let timer = null;
  let suggestion = '';
  let overlay = null;
  let tabHint = null;
  let abortController = null;

  // ── オーバーレイ生成 ──
  function setupOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'fw-ghost';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    tabHint = document.createElement('div');
    tabHint.className = 'fw-tab-hint';
    tabHint.textContent = '↹ Tab で確定';
    tabHint.style.display = 'none';
    document.body.appendChild(tabHint);
  }

  function syncPosition() {
    if (!overlay) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const cs = window.getComputedStyle(el);

    overlay.style.top    = rect.top    + 'px';
    overlay.style.left   = rect.left   + 'px';
    overlay.style.width  = rect.width  + 'px';
    overlay.style.height = rect.height + 'px';

    STYLE_PROPS.forEach(p => { overlay.style[p] = cs[p]; });

    if (tabHint && tabHint.style.display !== 'none') {
      tabHint.style.top  = (rect.bottom + 4) + 'px';
      tabHint.style.left = rect.left + 'px';
    }
  }

  // ── 補完表示・消去 ──
  function showSuggestion(text) {
    suggestion = text;
    if (!overlay) return;

    overlay.innerHTML = '';

    const typed = document.createElement('span');
    typed.style.visibility = 'hidden';
    typed.textContent = el.value;

    const ghost = document.createElement('span');
    ghost.className = 'fw-ghost-text';
    ghost.textContent = text;

    overlay.appendChild(typed);
    overlay.appendChild(ghost);
    overlay.scrollTop = el.scrollTop;

    if (tabHint) {
      syncPosition();
      tabHint.style.display = '';
    }
  }

  function clearSuggestion() {
    suggestion = '';
    if (overlay) overlay.innerHTML = '';
    if (tabHint) tabHint.style.display = 'none';
    if (abortController) { abortController.abort(); abortController = null; }
  }

  // ── API リクエスト ──
  async function fetchCompletion() {
    if (!FW.settings.enabled || !FW.settings.baseUrl || !FW.settings.apiKey) return;
    const text = el.value;
    if (!text.trim()) return;

    abortController = new AbortController();

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'AUTOCOMPLETE',
        payload: {
          text,
          model: FW.settings.model,
          systemPrompt: FW.settings.systemPrompt,
        },
      });

      // 入力内容が変わっていたら破棄
      if (el.value !== text) return;
      if (resp?.success && resp.data) showSuggestion(resp.data);
    } catch (_) {
      // 無視
    }
  }

  // ── イベントハンドラ ──
  function onInput() {
    clearSuggestion();
    clearTimeout(timer);
    const delayMs = Math.max(100, (FW.settings.delay ?? 1) * 1000);
    timer = setTimeout(fetchCompletion, delayMs);
  }

  const IGNORE_KEYS = new Set([
    'Shift', 'Control', 'Alt', 'Meta', 'CapsLock',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Home', 'End', 'PageUp', 'PageDown',
    'F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12',
  ]);

  function onKeydown(e) {
    if (e.key === 'Tab' && suggestion) {
      e.preventDefault();
      const start = el.selectionStart;
      const val   = el.value;
      el.value = val.slice(0, start) + suggestion + val.slice(el.selectionEnd);
      el.selectionStart = el.selectionEnd = start + suggestion.length;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      clearSuggestion();
      return;
    }
    if (e.key === 'Escape') { clearSuggestion(); return; }
    if (!IGNORE_KEYS.has(e.key)) clearSuggestion();
  }

  function onFocus() {
    if (!overlay) setupOverlay();
    syncPosition();
  }

  function onBlur() {
    clearSuggestion();
    clearTimeout(timer);
  }

  function onScroll() {
    if (overlay) overlay.scrollTop = el.scrollTop;
  }

  el.addEventListener('input',   onInput);
  el.addEventListener('keydown', onKeydown);
  el.addEventListener('focus',   onFocus);
  el.addEventListener('blur',    onBlur);
  el.addEventListener('scroll',  onScroll);

  // ウィンドウスクロール・リサイズ時に位置を同期
  window.addEventListener('scroll', syncPosition, { capture: true, passive: true });
  window.addEventListener('resize', syncPosition, { passive: true });
}

// ── DOM スキャン ──
function scan() {
  document.querySelectorAll('textarea').forEach(initTextarea);
}

scan();
new MutationObserver(scan).observe(
  document.body || document.documentElement,
  { childList: true, subtree: true }
);
