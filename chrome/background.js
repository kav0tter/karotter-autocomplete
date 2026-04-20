// background.js - FIM APIへの補完リクエストをservice workerで処理

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'AUTOCOMPLETE') {
    handleAutocomplete(message.payload)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

const DEFAULT_SYSTEM_PROMPT =
  'SNSの投稿の続きを自然に補完してください。' +
  '続きだけを出力し、入力済みのテキストは繰り返さないでください。' +
  '1文で簡潔に、改行なしで。';

async function handleAutocomplete({ text, cursor, model, systemPrompt }) {
  const { baseUrl, apiKey } = await chrome.storage.sync.get(['baseUrl', 'apiKey']);

  if (!baseUrl || !apiKey) {
    throw new Error('API が設定されていません。サイドパネルで設定してください。');
  }

  const endpoint = baseUrl.replace(/\/$/, '');
  const rawPrompt = text.slice(0, cursor ?? text.length);
  const suffix = text.slice(cursor ?? text.length);
  const instruction = systemPrompt || DEFAULT_SYSTEM_PROMPT;
  const prompt = `[${instruction}]\n\n${rawPrompt}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'codestral-latest',
      prompt,
      suffix: suffix || undefined,
      stop: ['\n'],
      max_tokens: 120,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API エラー (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0];
  const completion = (choice?.message?.content ?? choice?.text)?.trim();

  if (!completion) return null;

  const usage = data.usage;
  if (usage) {
    const { stats = {} } = await chrome.storage.local.get('stats');
    await chrome.storage.local.set({
      stats: {
        requests:         (stats.requests         || 0) + 1,
        promptTokens:     (stats.promptTokens     || 0) + (usage.prompt_tokens     || 0),
        completionTokens: (stats.completionTokens || 0) + (usage.completion_tokens || 0),
      },
    });
  }

  return completion;
}
