/**
 * LLM Text Polisher - Options Management
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

const PROVIDER_DEFAULTS = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    presets: ['gpt-4o-mini', 'gpt-4o', 'o3-mini'],
    requiresKey: true,
    keyPlaceholder: 'sk-proj-...',
    hint: 'OpenAI API key from platform.openai.com',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-20241022',
    presets: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    requiresKey: true,
    keyPlaceholder: 'sk-ant-...',
    hint: 'Anthropic API key from console.anthropic.com',
  },
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.2',
    presets: ['llama3.2', 'mistral', 'qwen2.5', 'deepseek-r1'],
    requiresKey: false,
    keyPlaceholder: 'Not required for local Ollama',
    hint: 'Local Ollama endpoint (default: http://localhost:11434)',
  },
  custom: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    presets: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'mistral-large-latest'],
    requiresKey: true,
    keyPlaceholder: 'API key for custom endpoint',
    hint: 'Any OpenAI-compatible endpoint (Groq, Together AI, vLLM, OpenRouter, LM Studio)',
  },
};

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

// DOM elements
const providerSelect = document.getElementById('provider-select');
const apiKeyInput = document.getElementById('api-key-input');
const apiKeyHint = document.getElementById('api-key-hint');
const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
const baseUrlInput = document.getElementById('base-url-input');
const baseUrlHint = document.getElementById('base-url-hint');
const modelInput = document.getElementById('model-input');
const modelPresetsContainer = document.getElementById('model-presets');
const temperatureInput = document.getElementById('temperature-input');
const temperatureVal = document.getElementById('temperature-val');
const systemPromptInput = document.getElementById('system-prompt-input');
const userPromptTemplate = document.getElementById('user-prompt-template');
const defaultToneSelect = document.getElementById('default-tone-select');
const tonesTableBody = document.getElementById('tones-table-body');
const saveBtn = document.getElementById('save-btn');
const testConnectionBtn = document.getElementById('test-connection-btn');
const resetPromptBtn = document.getElementById('reset-prompt-btn');
const toastBanner = document.getElementById('toast-banner');

let currentTones = JSON.parse(JSON.stringify(DEFAULT_TONES));
let toastTimeoutId = null;

// Helpers
function getStorageArea() {
  return chrome?.storage?.sync || chrome?.storage?.local;
}

function showToast(message, type = 'success', durationMs = 4000) {
  if (toastTimeoutId) {
    clearTimeout(toastTimeoutId);
  }
  toastBanner.textContent = message;
  toastBanner.className = `toast-banner ${type}`;
  toastTimeoutId = setTimeout(() => {
    toastBanner.className = 'toast-banner hidden';
  }, durationMs);
}

function renderModelPresets(provider) {
  const config = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai;
  modelPresetsContainer.replaceChildren();
  config.presets.forEach((preset) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `preset-chip ${modelInput.value === preset ? 'active' : ''}`;
    chip.textContent = preset;
    chip.addEventListener('click', () => {
      modelInput.value = preset;
      renderModelPresets(provider);
    });
    modelPresetsContainer.appendChild(chip);
  });
}

function updateProviderUI(provider, updateDefaults = false) {
  const config = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS.openai;
  apiKeyInput.placeholder = config.keyPlaceholder;
  apiKeyHint.textContent = config.hint;

  if (updateDefaults) {
    baseUrlInput.value = config.baseUrl;
    modelInput.value = config.model;
  }
  baseUrlHint.textContent = `Default: ${config.baseUrl}`;
  renderModelPresets(provider);
}

function renderTonesTable(tones) {
  tonesTableBody.replaceChildren();
  tones.forEach((tone, index) => {
    const row = document.createElement('tr');

    const labelCell = document.createElement('td');
    labelCell.textContent = tone.label;
    labelCell.style.fontWeight = '500';

    const promptCell = document.createElement('td');
    const promptInput = document.createElement('input');
    promptInput.type = 'text';
    promptInput.value = tone.prompt;
    promptInput.disabled = tone.id === 'custom';
    if (tone.id === 'custom') {
      promptInput.placeholder = '(Specified dynamically during execution)';
    }
    promptInput.addEventListener('input', (e) => {
      currentTones[index].prompt = e.target.value;
    });

    promptCell.appendChild(promptInput);
    row.appendChild(labelCell);
    row.appendChild(promptCell);
    tonesTableBody.appendChild(row);
  });
}

// Load Settings
async function loadSettings() {
  const storage = getStorageArea();
  if (!storage) {
    showToast('Storage API unavailable', 'error');
    return;
  }

  const data = await storage.get({
    provider: 'openai',
    apiKey: '',
    baseUrl: PROVIDER_DEFAULTS.openai.baseUrl,
    model: PROVIDER_DEFAULTS.openai.model,
    temperature: 0.3,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    userPromptTemplate: DEFAULT_USER_TEMPLATE,
    defaultTone: 'professional',
    tones: DEFAULT_TONES,
  });

  providerSelect.value = data.provider;
  apiKeyInput.value = data.apiKey;
  baseUrlInput.value = data.baseUrl;
  modelInput.value = data.model;
  temperatureInput.value = String(data.temperature);
  temperatureVal.textContent = String(data.temperature);
  systemPromptInput.value = data.systemPrompt;
  userPromptTemplate.value = data.userPromptTemplate;
  defaultToneSelect.value = data.defaultTone;

  currentTones = Array.isArray(data.tones) && data.tones.length > 0 ? data.tones : DEFAULT_TONES;
  renderTonesTable(currentTones);
  updateProviderUI(data.provider, false);
}

// Save Settings
async function saveSettings() {
  const storage = getStorageArea();
  if (!storage) {
    showToast('Storage API unavailable', 'error');
    return;
  }

  const settings = {
    provider: providerSelect.value,
    apiKey: apiKeyInput.value.trim(),
    baseUrl: baseUrlInput.value.trim(),
    model: modelInput.value.trim() || PROVIDER_DEFAULTS[providerSelect.value].model,
    temperature: parseFloat(temperatureInput.value),
    systemPrompt: systemPromptInput.value.trim() || DEFAULT_SYSTEM_PROMPT,
    userPromptTemplate: userPromptTemplate.value.trim() || DEFAULT_USER_TEMPLATE,
    defaultTone: defaultToneSelect.value,
    tones: currentTones,
  };

  try {
    await storage.set(settings);
    showToast('Settings saved successfully!', 'success');

    // Notify background script to refresh menus if needed
    if (chrome?.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATED', settings }).catch(() => {});
    }
  } catch (err) {
    showToast(`Failed to save settings: ${err.message}`, 'error');
  }
}

function setButtonContent(btn, icon, text) {
  btn.replaceChildren();
  const span = document.createElement('span');
  span.className = 'icon';
  span.textContent = icon;
  btn.append(span, document.createTextNode(' ' + text));
}

// Test Connection
async function testConnection() {
  testConnectionBtn.disabled = true;
  setButtonContent(testConnectionBtn, '⏳', 'Testing...');
  showToast('Testing connection to LLM endpoint...', 'info', 10000);

  const provider = providerSelect.value;
  const apiKey = apiKeyInput.value.trim();
  const baseUrl = baseUrlInput.value.trim();
  const model = modelInput.value.trim();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_CONNECTION',
      config: { provider, apiKey, baseUrl, model },
    });

    if (response && response.success) {
      showToast(`Connection successful! Response: "${response.sampleResponse}"`, 'success', 6000);
    } else {
      showToast(`Connection failed: ${response?.error || 'Unknown error'}`, 'error', 8000);
    }
  } catch (err) {
    showToast(`Connection test error: ${err.message}`, 'error', 8000);
  } finally {
    testConnectionBtn.disabled = false;
    setButtonContent(testConnectionBtn, '⚡', 'Test Connection');
  }
}

// Event Listeners
providerSelect.addEventListener('change', () => {
  updateProviderUI(providerSelect.value, true);
});

modelInput.addEventListener('input', () => {
  renderModelPresets(providerSelect.value);
});

temperatureInput.addEventListener('input', () => {
  temperatureVal.textContent = temperatureInput.value;
});

toggleKeyVisibilityBtn.addEventListener('click', () => {
  const isPassword = apiKeyInput.type === 'password';
  apiKeyInput.type = isPassword ? 'text' : 'password';
  toggleKeyVisibilityBtn.textContent = isPassword ? '🔒' : '👁️';
});

resetPromptBtn.addEventListener('click', () => {
  systemPromptInput.value = DEFAULT_SYSTEM_PROMPT;
  userPromptTemplate.value = DEFAULT_USER_TEMPLATE;
  showToast('Reset prompts to default template.', 'info');
});

saveBtn.addEventListener('click', saveSettings);
testConnectionBtn.addEventListener('click', testConnection);

document.addEventListener('DOMContentLoaded', loadSettings);
