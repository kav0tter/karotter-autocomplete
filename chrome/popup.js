// popup.js - 設定の読み込み・保存

const KEYS = ['enabled', 'baseUrl', 'apiKey', 'model', 'delay', 'systemPrompt'];

// ── 初期ロード ──
chrome.storage.sync.get(KEYS, (data) => {
  document.getElementById('enabled').checked       = data.enabled       ?? true;
  document.getElementById('baseUrl').value         = data.baseUrl       || '';
  document.getElementById('apiKey').value          = data.apiKey        || '';
  document.getElementById('model').value           = data.model         || 'gpt-4o-mini';
  document.getElementById('delay').value           = data.delay         ?? 1;
  document.getElementById('systemPrompt').value    = data.systemPrompt  || '';
});

// ── enabled トグルは即時保存 ──
document.getElementById('enabled').addEventListener('change', (e) => {
  chrome.storage.sync.set({ enabled: e.target.checked });
});

// ── プリセット ──
function loadPresets() {
  chrome.storage.sync.get(['configPresets', 'activePresetId'], ({ configPresets = [], activePresetId = '' }) => {
    const sel = document.getElementById('presetSelect');
    sel.innerHTML = '<option value="">— 選択して切り替え —</option>';
    configPresets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      sel.appendChild(opt);
    });
    sel.value = activePresetId || '';
    document.getElementById('presetDeleteBtn').disabled = !sel.value;
  });
}

loadPresets();

document.getElementById('presetSelect').addEventListener('change', (e) => {
  const id = e.target.value;
  document.getElementById('presetDeleteBtn').disabled = !id;
  if (!id) return;
  chrome.storage.sync.get('configPresets', ({ configPresets = [] }) => {
    const preset = configPresets.find(p => p.id === id);
    if (!preset) return;
    document.getElementById('baseUrl').value = preset.baseUrl;
    document.getElementById('apiKey').value  = preset.apiKey;
    document.getElementById('model').value   = preset.model;
    chrome.storage.sync.set({ baseUrl: preset.baseUrl, apiKey: preset.apiKey, model: preset.model, activePresetId: id });
  });
});

document.getElementById('presetSaveBtn').addEventListener('click', () => {
  const name    = document.getElementById('presetName').value.trim();
  const baseUrl = document.getElementById('baseUrl').value.trim();
  const apiKey  = document.getElementById('apiKey').value.trim();
  const model   = document.getElementById('model').value.trim() || 'gpt-4o-mini';
  if (!name)               { alert('プリセット名を入力してください'); return; }
  if (!baseUrl || !apiKey) { alert('Base URL と API Key を入力してください'); return; }
  chrome.storage.sync.get('configPresets', ({ configPresets = [] }) => {
    const id = Date.now().toString();
    const updated = [...configPresets, { id, name, baseUrl, apiKey, model }];
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
  const baseUrl      = document.getElementById('baseUrl').value.trim();
  const apiKey       = document.getElementById('apiKey').value.trim();
  const model        = document.getElementById('model').value.trim() || 'gpt-4o-mini';
  const delay        = parseFloat(document.getElementById('delay').value) || 1;
  const systemPrompt = document.getElementById('systemPrompt').value.trim();
  const statusEl     = document.getElementById('status');

  if (!baseUrl || !apiKey) {
    statusEl.textContent = 'Base URL と API Key は必須です';
    statusEl.className   = 'status error';
    return;
  }

  chrome.storage.sync.set({ baseUrl, apiKey, model, delay, systemPrompt }, () => {
    statusEl.textContent = '設定を保存しました';
    statusEl.className   = 'status success';
    setTimeout(() => { statusEl.className = 'status'; }, 2000);
  });
});
