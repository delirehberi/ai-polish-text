# Chrome Web Store Submission Guide: LLM Text Polisher

Single source of truth for the Chrome Web Store listing metadata, permissions justifications, and privacy disclosures.

---

## 1. Store Listing Information

- **Extension Name:** LLM Text Polisher
- **Short Description (max 132 chars):**
  > Polish, rephrase, tone-adjust, and fix selected text anywhere using your preferred LLM provider.
- **Category:** Productivity / Workflow
- **Language:** English

### Detailed Description (Formatted for Chrome Web Store)

```markdown
Transform and polish your writing anywhere on the web with instant AI text enhancement. 

LLM Text Polisher allows you to select any text on any webpage, right-click (or press Alt+P), and polish it in real time using your choice of LLM provider — OpenAI, Anthropic Claude, local Ollama, or any custom OpenAI-compatible endpoint (Groq, Together AI, vLLM, OpenRouter, LM Studio).

KEY FEATURES:
✨ Multi-Tone Rewriting: Professional, Casual, Concise, Academic, Grammar & Clarity, or Custom prompt.
🔍 Interactive Diff Viewer: Compare original vs. polished text with word-level deletion/addition highlights or side-by-side view.
🔄 One-Click In-Place Replacement: Automatically replaces selected text in form inputs, textareas, and rich-text editors (X / Twitter, Slack, Gmail, Notion, etc.) while preserving browser undo/redo history.
💬 Iterative Tweaking: Refine outputs on the fly with follow-up instructions (e.g. "make it punchier", "translate to French").
⚡ Global Keyboard Shortcut: Press Alt+P (Option+P on macOS) to instantly polish your current selection.
🛡️ Zero Data Collection & Private: Direct browser-to-API calls. Your API keys and text are never sent to third-party tracking servers.

SUPPORTED PROVIDERS:
- OpenAI (gpt-4o, gpt-4o-mini, o3-mini)
- Anthropic Claude (Claude 3.5 Sonnet, Claude 3.5 Haiku)
- Ollama (Local self-hosted models like Llama 3.2, Mistral, DeepSeek — no API key needed)
- Custom OpenAI-Compatible (Groq, Together AI, vLLM, OpenRouter, LM Studio)

Open-source and customizable: https://github.com/delirehberi/ai-polish-text
```

---

## 2. Permissions Justifications (For Chrome Reviewers)

| Permission | Reviewer Justification |
| :--- | :--- |
| `contextMenus` | Needed to create the right-click "Polish Text" menu item and tone selection submenus when text is selected. |
| `storage` | Needed to persist user settings (chosen LLM provider, custom base URLs, model name, system prompts, and API keys) via `chrome.storage.sync`. |
| `activeTab` | Needed to access and inspect text selections in the current active tab when invoked via keyboard shortcut or context menu. |
| `scripting` | Needed to inject the isolated Shadow DOM overlay card into active webpages on demand if not already loaded. |
| `clipboardWrite` | Needed to provide the 1-click "Copy to Clipboard" action for polished text. |
| `http://*/*` & `https://*/*` (`host_permissions`) | Required so the extension background service worker can dispatch API requests directly to user-configured LLM endpoints (including local endpoints like `http://localhost:11434` or custom LLM gateways). |

---

## 3. Privacy & Data Use Disclosures

- **Single Purpose:** Enhancing and transforming user-selected text via user-configured LLM APIs.
- **Data Collection:**
  - **Does the extension collect personally identifiable information?** No.
  - **Does the extension transmit user data to any external server other than the user-configured API?** No.
  - **Where are API keys stored?** Securely stored locally inside the user's browser via `chrome.storage.sync`.
- **Privacy Policy URL:** https://delirehberi.github.io/ai-polish-text/#privacy

---

## 4. Visual Assets Checklist

- [x] **Icon 16x16:** `icons/icon-16.png`
- [x] **Icon 48x48:** `icons/icon-48.png`
- [x] **Icon 128x128:** `icons/icon-128.png`
- [x] **Screenshots (1280x800 or 640x400):**
  - `diff-view-demo.png`
  - `side-by-side-demo.png`
  - `polished-text-demo.png`
- [x] **Store Package:** `dist/chrome.zip`
