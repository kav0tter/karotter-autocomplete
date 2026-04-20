// popup.js - 設定の読み込み・保存

const KEYS = ['enabled', 'baseUrl', 'apiKey', 'model', 'delay', 'systemPrompt', 'triggerMode', 'triggerCursor'];

const DEFAULTS = {
  model: 'codestral-latest',
  delay: 1,
  triggerMode: 'all',
  triggerCursor: false,
};

const DEFAULT_SYSTEM_PROMPT =
  'SNSの投稿の続きを自然に補完してください。' +
  '続きだけを出力し、入力済みのテキストは繰り返さないでください。' +
  '1文で簡潔に、改行なしで。';

// ── 初期ロード ──
chrome.storage.sync.get(KEYS, (data) => {
  document.getElementById('enabled').checked = data.enabled ?? true;
  document.getElementById('baseUrl').value   = data.baseUrl || '';
  document.getElementById('apiKey').value    = data.apiKey  || '';
  document.getElementById('model').value        = data.model        || DEFAULTS.model;
  document.getElementById('delay').value        = data.delay        ?? DEFAULTS.delay;
  document.getElementById('systemPrompt').value = data.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  document.getElementById('triggerMode').value  = data.triggerMode   || DEFAULTS.triggerMode;
  document.getElementById('triggerCursor').checked = data.triggerCursor ?? DEFAULTS.triggerCursor;
});

// ── enabled トグルは即時保存 ──
document.getElementById('enabled').addEventListener('change', (e) => {
  chrome.storage.sync.set({ enabled: e.target.checked });
});

// ── プリセット ──
const BUILTIN_PRESETS = [
  {
    id: '__codestral',
    name: 'Codestral (Mistral)',
    baseUrl: 'https://codestral.mistral.ai/v1/fim/completions',
    model: 'codestral-latest',
    systemPrompt: 'SNSの投稿の続きを自然に補完してください。続きだけを出力し、入力済みのテキストは繰り返さないでください。1文で簡潔に、改行なしで。',
  },
  {
    id: '__openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    systemPrompt: 'あなたはSNSの投稿入力補完アシスタントです。ユーザーが入力中のテキストの続きを自然に補完してください。入力済みのテキストを繰り返さず、続きだけを出力する。1文で簡潔に、改行なしで。既存のテキストの言語、トーン、スタイルに合わせる。',
  },
  {
    id: '__gemini',
    name: 'Gemini (Google)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: 'gemini-2.0-flash',
    systemPrompt: 'あなたはSNSの投稿入力補完アシスタントです。ユーザーが入力中のテキストの続きを自然に補完してください。入力済みのテキストを繰り返さず、続きだけを出力する。1文で簡潔に、改行なしで。既存のテキストの言語、トーン、スタイルに合わせる。',
  },
];

function loadPresets() {
  chrome.storage.sync.get(['configPresets', 'activePresetId'], ({ configPresets = [], activePresetId = '' }) => {
    const sel = document.getElementById('presetSelect');
    sel.innerHTML = '<option value="">— 選択して切り替え —</option>';

    const optGroup1 = document.createElement('optgroup');
    optGroup1.label = 'ビルトイン';
    BUILTIN_PRESETS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      optGroup1.appendChild(opt);
    });
    sel.appendChild(optGroup1);

    if (configPresets.length > 0) {
      const optGroup2 = document.createElement('optgroup');
      optGroup2.label = 'カスタム';
      configPresets.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.name;
        optGroup2.appendChild(opt);
      });
      sel.appendChild(optGroup2);
    }

    sel.value = activePresetId || '';
    document.getElementById('presetDeleteBtn').disabled = !sel.value;
  });
}

loadPresets();

function applyPreset(preset) {
  document.getElementById('baseUrl').value       = preset.baseUrl;
  document.getElementById('apiKey').value        = '';
  document.getElementById('model').value         = preset.model;
  if (preset.systemPrompt) document.getElementById('systemPrompt').value = preset.systemPrompt;
}

document.getElementById('presetSelect').addEventListener('change', (e) => {
  const id = e.target.value;
  const isBuiltin = id.startsWith('__');
  document.getElementById('presetDeleteBtn').disabled = !id || isBuiltin;
  if (!id) return;

  const builtin = BUILTIN_PRESETS.find(p => p.id === id);
  if (builtin) {
    applyPreset(builtin);
    chrome.storage.sync.set({ baseUrl: builtin.baseUrl, model: builtin.model, systemPrompt: builtin.systemPrompt || '', activePresetId: id });
    return;
  }

  chrome.storage.sync.get('configPresets', ({ configPresets = [] }) => {
    const preset = configPresets.find(p => p.id === id);
    if (!preset) return;
    document.getElementById('baseUrl').value = preset.baseUrl;
    document.getElementById('apiKey').value  = preset.apiKey;
    document.getElementById('model').value   = preset.model;
    if (preset.systemPrompt) document.getElementById('systemPrompt').value = preset.systemPrompt;
    chrome.storage.sync.set({ baseUrl: preset.baseUrl, apiKey: preset.apiKey, model: preset.model, systemPrompt: preset.systemPrompt || '', activePresetId: id });
  });
});

document.getElementById('presetSaveBtn').addEventListener('click', () => {
  const name    = document.getElementById('presetName').value.trim();
  const baseUrl = document.getElementById('baseUrl').value.trim();
  const apiKey  = document.getElementById('apiKey').value.trim();
  const model   = document.getElementById('model').value.trim() || DEFAULTS.model;
  if (!name)               { alert('プリセット名を入力してください'); return; }
  if (!baseUrl || !apiKey) { alert('エンドポイントURLとAPI Keyを入力してください'); return; }
  chrome.storage.sync.get('configPresets', ({ configPresets = [] }) => {
    const id = Date.now().toString();
    const updated = [...configPresets, { id, name, baseUrl, apiKey, model, systemPrompt: document.getElementById('systemPrompt').value.trim() }];
    chrome.storage.sync.set({ configPresets: updated }, () => {
      document.getElementById('presetName').value = '';
      loadPresets();
      document.getElementById('presetSelect').value = id;
      document.getElementById('presetDeleteBtn').disabled = false;
    });
  });
});

document.getElementById('presetDeleteBtn').addEventListener('click', () => {
  const id   = document.getElementById('presetSelect').value;
  const name = document.getElementById('presetSelect').selectedOptions[0]?.textContent;
  if (!id) return;
  if (!confirm(`「${name}」を削除しますか？`)) return;
  chrome.storage.sync.get(['configPresets', 'activePresetId'], ({ configPresets = [], activePresetId }) => {
    const updated = configPresets.filter(p => p.id !== id);
    const clear   = activePresetId === id ? { activePresetId: '' } : {};
    chrome.storage.sync.set({ configPresets: updated, ...clear }, loadPresets);
  });
});

// ── 使用状況 ──
function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function loadStats() {
  chrome.storage.local.get('stats', ({ stats = {} }) => {
    document.getElementById('statsRequests').textContent   = formatNumber(stats.requests         || 0);
    document.getElementById('statsPrompt').textContent     = formatNumber(stats.promptTokens     || 0);
    document.getElementById('statsCompletion').textContent = formatNumber(stats.completionTokens || 0);
  });
}

loadStats();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.stats) loadStats();
});

document.getElementById('statsResetBtn').addEventListener('click', () => {
  if (!confirm('使用状況をリセットしますか？')) return;
  chrome.storage.local.set({ stats: { requests: 0, promptTokens: 0, completionTokens: 0 } }, loadStats);
});

// ── 保存ボタン ──
document.getElementById('saveBtn').addEventListener('click', () => {
  const statusEl      = document.getElementById('status');
  const baseUrl       = document.getElementById('baseUrl').value.trim();
  const apiKey        = document.getElementById('apiKey').value.trim();
  const model         = document.getElementById('model').value.trim() || DEFAULTS.model;
  const delay         = document.getElementById('delay').valueAsNumber;
  const systemPrompt  = document.getElementById('systemPrompt').value.trim();
  const triggerMode   = document.getElementById('triggerMode').value;
  const triggerCursor = document.getElementById('triggerCursor').checked;

  if (Number.isNaN(delay) || delay <= 0) {
    statusEl.textContent = '遅延は0より大きい数値を入力してください';
    statusEl.className   = 'status error';
    return;
  }

  if (!baseUrl || !apiKey) {
    statusEl.textContent = 'エンドポイントURLとAPI Keyは必須です';
    statusEl.className   = 'status error';
    return;
  }

  chrome.storage.sync.set({ baseUrl, apiKey, model, delay, systemPrompt, triggerMode, triggerCursor }, () => {
    statusEl.textContent = '設定を保存しました';
    statusEl.className   = 'status success';
    setTimeout(() => { statusEl.className = 'status'; }, 2000);
  });
});
