/**
 * LLM Text Polisher - Background Service Worker
 */

const DEFAULT_SYSTEM_PROMPT = `You are an expert editor and writing assistant. Your task is to polish, improve, or rephrase the provided text according to the requested tone and instructions.
Maintain the original meaning, intent, and language of the source text unless explicitly instructed otherwise.
Return ONLY the polished text without conversational filler, explanations, markdown quotes, or preamble.`;

const DEFAULT_USER_TEMPLATE = `Tone/Instruction: {{tone}}
{{instruction}}

Text to Polish:
"""
{{text}}
"""`;

const DEFAULT_TONES = [
  {
    id: 'professional',
    label: 'Professional / Business',
    prompt: 'Rewrite in a professional, clear, confident, and business-appropriate tone.',
  },
  {
    id: 'casual',
    label: 'Casual / Friendly',
    prompt: 'Rewrite in a warm, conversational, approachable, and friendly tone.',
  },
  {
    id: 'concise',
    label: 'Concise / Shorten',
    prompt: 'Make this text significantly more concise, removing fluff and redundancies while preserving key details.',
  },
  {
    id: 'academic',
    label: 'Academic / Formal',
    prompt: 'Rewrite in a sophisticated, formal, and academically rigorous tone with precise vocabulary.',
  },
  {
    id: 'grammar',
    label: 'Grammar & Clarity Fix Only',
    prompt: 'Fix all grammar, spelling, punctuation, syntax, and clarity issues without unnecessarily changing the tone or style.',
  },
  {
    id: 'custom',
    label: 'Custom Prompt...',
    prompt: 'Follow the specific custom refinement instruction provided by the user.',
  },
];

function getStorageArea() {
  if (typeof chrome === 'undefined') return null;
  return chrome?.storage?.sync || chrome?.storage?.local;
}

async function getStoredSettings() {
  const storage = getStorageArea();
  if (!storage) {
    return {
      provider: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      temperature: 0.3,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      userPromptTemplate: DEFAULT_USER_TEMPLATE,
      defaultTone: 'professional',
      tones: DEFAULT_TONES,
    };
  }

  return await storage.get({
    provider: 'openai',
    apiKey: '',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    temperature: 0.3,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userPromptTemplate: DEFAULT_USER_TEMPLATE,
    defaultTone: 'professional',
    tones: DEFAULT_TONES,
  });
}

/**
 * Rebuild context menus dynamically based on user settings
 */
async function setupContextMenus() {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;

  try {
    await chrome.contextMenus.removeAll();

    const settings = await getStoredSettings();
    const tones = Array.isArray(settings.tones) ? settings.tones : DEFAULT_TONES;

    chrome.contextMenus.create({
      id: 'llm-polisher-root',
      title: 'Polish Text ✨',
      contexts: ['selection'],
    });

    tones.forEach((tone) => {
      chrome.contextMenus.create({
        id: `tone-${tone.id}`,
        parentId: 'llm-polisher-root',
        title: tone.label,
        contexts: ['selection'],
      });
    });
  } catch (err) {
    console.error('Failed to setup context menus:', err);
  }
}

/**
 * Format prompt text replacing template placeholders
 */
function buildPrompt(template, { text, tonePrompt, customInstruction }) {
  let prompt = template || DEFAULT_USER_TEMPLATE;
  prompt = prompt.replace(/\{\{text\}\}/g, text || '');
  prompt = prompt.replace(/\{\{tone\}\}/g, tonePrompt || '');

  if (customInstruction) {
    prompt = prompt.replace(/\{\{instruction\}\}/g, `Additional instructions: ${customInstruction}`);
  } else {
    prompt = prompt.replace(/\{\{instruction\}\}/g, '');
  }

  return prompt.trim();
}

/**
 * Clean URL formatting
 */
function normalizeBaseUrl(url) {
  let cleanUrl = (url || '').trim();
  while (cleanUrl.endsWith('/')) {
    cleanUrl = cleanUrl.slice(0, -1);
  }
  return cleanUrl;
}

/**
 * Call LLM API across providers
 */
async function fetchLLM({
  text,
  toneId,
  customInstruction = '',
  settingsOverride = null,
}) {
  const settings = settingsOverride || (await getStoredSettings());
  const provider = settings.provider || 'openai';
  const apiKey = (settings.apiKey || '').trim();
  const baseUrl = normalizeBaseUrl(settings.baseUrl);
  const model = (settings.model || '').trim();
  const temperature = typeof settings.temperature === 'number' ? settings.temperature : 0.3;
  const systemPrompt = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;

  // Validation
  if (provider !== 'ollama' && !apiKey) {
    throw new Error(`API Key is missing for ${provider}. Please configure it in extension Settings.`);
  }

  const toneList = settings.tones || DEFAULT_TONES;
  const toneObj = toneList.find((t) => t.id === toneId) || toneList[0];
  const tonePrompt = toneObj ? toneObj.prompt : '';

  const userPrompt = buildPrompt(settings.userPromptTemplate, {
    text,
    tonePrompt,
    customInstruction,
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    if (provider === 'openai' || provider === 'custom') {
      const endpoint = `${baseUrl}/chat/completions`;
      const headers = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`[${provider.toUpperCase()}] ${errorMsg}`);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Invalid response format received from LLM endpoint.');
      }
      return content.trim();
    }

    if (provider === 'anthropic') {
      const endpoint = `${baseUrl}/v1/messages`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }],
          max_tokens: 4096,
          temperature,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data?.error?.message || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`[Anthropic] ${errorMsg}`);
      }

      const content = data?.content?.[0]?.text;
      if (typeof content !== 'string') {
        throw new Error('Invalid response format received from Anthropic API.');
      }
      return content.trim();
    }

    if (provider === 'ollama') {
      const endpoint = `${baseUrl}/api/chat`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          stream: false,
          options: {
            temperature,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const errorMsg = data?.error || `HTTP ${response.status}: ${response.statusText}`;
        throw new Error(`[Ollama] ${errorMsg}`);
      }

      const content = data?.message?.content;
      if (typeof content !== 'string') {
        throw new Error('Invalid response format received from Ollama.');
      }
      return content.trim();
    }

    throw new Error(`Unsupported provider: ${provider}`);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out after 60 seconds.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Attach event listeners when running in extension environment
if (typeof chrome !== 'undefined') {
  if (chrome.contextMenus?.onClicked) {
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
      if (!tab?.id || !info.menuItemId) return;

      const menuItemId = String(info.menuItemId);
      if (!menuItemId.startsWith('tone-')) return;

      const toneId = menuItemId.replace('tone-', '');
      const selectedText = (info.selectionText || '').trim();

      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'CONTEXT_MENU_POLISH',
          toneId,
          selectedText,
        });
      } catch (err) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          await chrome.tabs.sendMessage(tab.id, {
            type: 'CONTEXT_MENU_POLISH',
            toneId,
            selectedText,
          });
        } catch (injErr) {
          console.error('Failed to communicate with content script:', injErr);
        }
      }
    });
  }

  if (chrome.commands?.onCommand) {
    chrome.commands.onCommand.addListener(async (command) => {
      if (command === 'polish-selection') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) return;

        const settings = await getStoredSettings();
        const defaultTone = settings.defaultTone || 'professional';

        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'SHORTCUT_POLISH',
            toneId: defaultTone,
          });
        } catch {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content.js'],
            });
            await chrome.tabs.sendMessage(tab.id, {
              type: 'SHORTCUT_POLISH',
              toneId: defaultTone,
            });
          } catch (err) {
            console.error('Failed to trigger shortcut polish:', err);
          }
        }
      }
    });
  }

  if (chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) return false;

      if (message.type === 'TEST_CONNECTION') {
        (async () => {
          try {
            const sampleResponse = await fetchLLM({
              text: 'Hello world',
              toneId: 'concise',
              customInstruction: 'Respond with exactly: "Connection successful."',
              settingsOverride: message.config,
            });
            sendResponse({ success: true, sampleResponse });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      }

      if (message.type === 'EXECUTE_POLISH') {
        (async () => {
          try {
            const polishedText = await fetchLLM({
              text: message.text,
              toneId: message.toneId,
              customInstruction: message.customInstruction,
            });
            sendResponse({ success: true, polishedText });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      }

      if (message.type === 'EXECUTE_POLISH_ON_ACTIVE_TAB') {
        (async () => {
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab?.id) return;

            await chrome.tabs.sendMessage(tab.id, {
              type: 'SHORTCUT_POLISH',
              toneId: message.toneId || 'professional',
            });
            sendResponse({ success: true });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        })();
        return true;
      }

      if (message.type === 'SETTINGS_UPDATED') {
        setupContextMenus();
        sendResponse({ success: true });
        return false;
      }

      if (message.type === 'OPEN_OPTIONS_PAGE') {
        if (chrome.runtime.openOptionsPage) {
          chrome.runtime.openOptionsPage();
        }
        sendResponse({ success: true });
        return false;
      }

      return false;
    });
  }

  if (chrome.runtime?.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
      setupContextMenus();
    });
  }

  if (chrome.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      setupContextMenus();
    });
  }
}

// Export helper functions for automated testing if in node environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    buildPrompt,
    normalizeBaseUrl,
    fetchLLM,
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_USER_TEMPLATE,
    DEFAULT_TONES,
  };
}
