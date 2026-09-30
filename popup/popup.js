/**
 * LLM Text Polisher - Popup Controller
 */

function getStorageArea() {
  return chrome?.storage?.sync || chrome?.storage?.local;
}

const providerBadge = document.getElementById('provider-badge');
const modelBadge = document.getElementById('model-badge');
const statusWarning = document.getElementById('status-warning');
const popupToneSelect = document.getElementById('popup-tone-select');
const polishBtn = document.getElementById('polish-btn');
const openOptionsBtn = document.getElementById('open-options-btn');
const setupLink = document.getElementById('setup-link');
const settingsFooterLink = document.getElementById('settings-footer-link');

function openOptions() {
  if (chrome?.runtime?.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options/options.html'));
  }
}

async function initPopup() {
  const storage = getStorageArea();
  if (!storage) return;

  const data = await storage.get({
    provider: 'openai',
    apiKey: '',
    model: 'gpt-4o-mini',
    defaultTone: 'professional',
  });

  providerBadge.textContent = data.provider;
  modelBadge.textContent = data.model;
  popupToneSelect.value = data.defaultTone;

  const requiresKey = data.provider !== 'ollama';
  if (requiresKey && !data.apiKey) {
    statusWarning.classList.remove('hidden');
  } else {
    statusWarning.classList.add('hidden');
  }
}

async function triggerPolish() {
  const tone = popupToneSelect.value;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;

    // Send action to background script
    await chrome.runtime.sendMessage({
      type: 'EXECUTE_POLISH_ON_ACTIVE_TAB',
      toneId: tone,
    });
    window.close();
  } catch (err) {
    console.error('Failed to trigger polish from popup:', err);
  }
}

openOptionsBtn.addEventListener('click', openOptions);
setupLink.addEventListener('click', (e) => {
  e.preventDefault();
  openOptions();
});
settingsFooterLink.addEventListener('click', (e) => {
  e.preventDefault();
  openOptions();
});
polishBtn.addEventListener('click', triggerPolish);

document.addEventListener('DOMContentLoaded', initPopup);
