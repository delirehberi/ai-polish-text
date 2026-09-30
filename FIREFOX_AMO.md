# Mozilla Add-ons (AMO) Submission Guide: LLM Text Polisher

Guidelines and metadata for submitting to Mozilla Add-ons (AMO).

---

## 1. Add-on Metadata

- **Name:** LLM Text Polisher
- **Summary:** Polish, rephrase, tone-adjust, and fix selected text anywhere using your preferred LLM provider.
- **Gecko Add-on ID:** `ai-polish-text@emre.xyz`
- **Homepage:** https://delirehberi.github.io/ai-polish-text/
- **Categories:** Writing & Language, Productivity

---

## 2. Review Notes for Mozilla AMO Reviewers

```
LLM Text Polisher is an open-source Manifest V3 web extension that allows users to polish and rewrite selected text on any webpage.

Key technical aspects:
1. Manifest V3 compliant using background event scripts and isolated Open Shadow DOM for overlay UI.
2. Built strictly with vanilla JavaScript and native browser Web APIs (zero external build obfuscation or minification). Source code is completely clean and readable.
3. No tracking or telemetry scripts included.
4. Host permissions (http://*/* and https://*/*) are utilized strictly to allow the background script to send completions requests to user-customizable endpoints (such as local Ollama instances at http://localhost:11434, OpenAI, or custom OpenAI-compatible proxies).

Repository: https://github.com/delirehberi/ai-polish-text
```

---

## 3. Upload File

- Upload archive: `dist/firefox.zip`
