// content.js - テキストエリアへのゴーストテキスト補完を注入する

const FW = {
  observed: new WeakMap(),
  settings: { enabled: true, delay: 1, baseUrl: '', apiKey: '', model: 'codestral-latest', systemPrompt: '', triggerMode: 'all', triggerCursor: false },
};

// 設定の初期ロードと変更監視
chrome.storage.sync.get(
  ['enabled', 'delay', 'baseUrl', 'apiKey', 'model', 'systemPrompt', 'triggerMode', 'triggerCursor'],
  (data) => {
    Object.assign(FW.settings, data);
    console.log('[Flash Writer] settings loaded:', { enabled: FW.settings.enabled, hasBaseUrl: !!FW.settings.baseUrl, hasApiKey: !!FW.settings.apiKey, model: FW.settings.model });
  }
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
  let suggestionCursor = 0;
  let overlay = null;
  let tabHint = null;

  // ── オーバーレイ生成 ──
  function setupOverlay() {
    overlay = document.createElement('div');
    overlay.className = 'fw-ghost';
    overlay.setAttribute('aria-hidden', 'true');
    document.body.appendChild(overlay);

    tabHint = document.createElement('div');
    tabHint.className = 'fw-tab-hint';
    tabHint.textContent = '\u21B9 Tab \u3067\u78BA\u5B9A';
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
  function showSuggestion(text, cursorPos) {
    suggestion = text;
    suggestionCursor = cursorPos;
    if (!overlay) return;

    overlay.innerHTML = '';

    const before = document.createElement('span');
    before.style.visibility = 'hidden';
    before.textContent = el.value.slice(0, cursorPos);

    const ghost = document.createElement('span');
    ghost.className = 'fw-ghost-text';
    ghost.textContent = text;

    const after = document.createElement('span');
    after.style.visibility = 'hidden';
    after.textContent = el.value.slice(cursorPos);

    overlay.appendChild(before);
    overlay.appendChild(ghost);
    overlay.appendChild(after);
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
  }

  // ── API リクエスト ──
  async function fetchCompletion() {
    if (!FW.settings.enabled) return;
    if (!FW.settings.baseUrl || !FW.settings.apiKey) {
      console.warn('[Flash Writer] API\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002\u30B5\u30A4\u30C9\u30D1\u30CD\u30EB\u3067\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002');
      return;
    }
    const text = el.value;
    if (!text.trim()) return;
    const cursor = el.selectionStart;

    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'AUTOCOMPLETE',
        payload: {
          text,
          cursor,
          model: FW.settings.model,
          systemPrompt: FW.settings.systemPrompt,
        },
      });

      // 入力内容が変わっていたら破棄
      if (el.value !== text) return;

      if (resp?.success && resp.data) {
        showSuggestion(resp.data, cursor);
      } else if (!resp?.success && resp?.error) {
        console.warn('[Flash Writer] API error:', resp.error);
      }
    } catch (err) {
      console.warn('[Flash Writer] completion failed:', err?.message || err);
    }
  }

  // ── イベントハンドラ ──
  function shouldTrigger(e) {
    const mode = FW.settings.triggerMode || 'all';
    if (mode === 'all') return true;
    const it = e.inputType || '';
    if (mode === 'input') return !it.startsWith('delete');
    if (mode === 'whitespace') {
      if (it.startsWith('delete')) return false;
      if (it === 'insertLineBreak' || it === 'insertParagraph') return true;
      if (it === 'insertText') return e.data != null && /\s/.test(e.data);
      return false;
    }
    return true;
  }

  function onInput(e) {
    clearSuggestion();
    if (!shouldTrigger(e)) return;
    clearTimeout(timer);
    const delayMs = Math.max(100, (FW.settings.delay ?? 1) * 1000);
    timer = setTimeout(fetchCompletion, delayMs);
  }

  function onCursorMove() {
    if (!FW.settings.triggerCursor) return;
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
      const pos = suggestionCursor;
      const val = el.value;
      el.value = val.slice(0, pos) + suggestion + val.slice(pos);
      el.selectionStart = el.selectionEnd = pos + suggestion.length;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: suggestion }));
      clearSuggestion();
      return;
    }
    if (e.key === 'Escape') { clearSuggestion(); return; }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) {
      onCursorMove();
      return;
    }
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
  el.addEventListener('click',   onCursorMove);

  // ウィンドウスクロール・リサイズ時に位置を同期
  window.addEventListener('scroll', syncPosition, { capture: true, passive: true });
  window.addEventListener('resize', syncPosition, { passive: true });
}

// ── DOM スキャン ──
function scan() {
  document.querySelectorAll('textarea').forEach(initTextarea);
}

scan();

// document.documentElement は置き換わらないため、SPAでもObserverが外れない
const observerTarget = document.documentElement;
new MutationObserver(scan).observe(
  observerTarget,
  { childList: true, subtree: true }
);
