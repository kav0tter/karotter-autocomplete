// background.js - OpenAI互換APIへの補完リクエストをservice workerで処理

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const DEFAULT_SYSTEM_PROMPT =
  'You are an inline text autocomplete assistant. ' +
  'The user is typing text and needs a natural continuation. ' +
  'Return ONLY the continuation — do not repeat or include any of the original text. ' +
  'Be concise: typically a few words to one sentence. ' +
  'Match the language, tone, and style of the existing text.';

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'AUTOCOMPLETE') {
    handleAutocomplete(message.payload)
      .then(data => sendResponse({ success: true, data }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleAutocomplete({ text, model, systemPrompt }) {
  const { baseUrl, apiKey } = await chrome.storage.sync.get(['baseUrl', 'apiKey']);

  if (!baseUrl || !apiKey) {
    throw new Error('API が設定されていません。サイドパネルで設定してください。');
  }

  const endpoint = baseUrl.replace(/\/$/, '') + '/chat/completions';

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ],
      max_tokens: 120,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API エラー (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const completion = data.choices?.[0]?.message?.content?.trim();

  if (!completion) throw new Error('API から空のレスポンスが返されました');

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
