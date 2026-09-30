/**
 * LLM Text Polisher - Content Script & Shadow DOM Floating UI
 */

(function () {
  // Prevent duplicate script execution in browser
  if (typeof window !== 'undefined') {
    if (window.__llmTextPolisherInjected) return;
    window.__llmTextPolisherInjected = true;
  }

  const HOST_ID = 'llm-text-polisher-host';
  let activeHost = null;
  let activeShadowRoot = null;
  let activeSelectionContext = null;
  let isReplacing = false;

  /**
   * Simple Word-Level Diff Algorithm (LCS-based)
   */
  function computeWordDiff(original, polished) {
    const origWords = (original || '').split(/(\s+|[^\s\w]+|\w+)/).filter(Boolean);
    const polWords = (polished || '').split(/(\s+|[^\s\w]+|\w+)/).filter(Boolean);

    const m = origWords.length;
    const n = polWords.length;

    // LCS table
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        if (origWords[i] === polWords[j]) {
          dp[i + 1][j + 1] = dp[i][j] + 1;
        } else {
          dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
    }

    // Backtrack to build diff segments
    let i = m;
    let j = n;
    const diff = [];

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && origWords[i - 1] === polWords[j - 1]) {
        diff.unshift({ type: 'equal', text: origWords[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.unshift({ type: 'insert', text: polWords[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        diff.unshift({ type: 'delete', text: origWords[i - 1] });
        i--;
      }
    }

    return diff;
  }

  /**
   * Escape HTML helper
   */
  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Detect if a DOM node or element is part of an editable container
   */
  function isNodeEditable(node) {
    if (!node) return false;

    // Check designMode if document is available
    if (typeof document !== 'undefined' && document.designMode && document.designMode.toLowerCase() === 'on') {
      return true;
    }

    const isElement = node.nodeType === 1 || (typeof Node !== 'undefined' && node.nodeType === Node.ELEMENT_NODE);
    let el = isElement ? node : node.parentElement;
    if (!el) return false;

    // Native form inputs
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT' && /^(text|search|url|tel|email|password)$/i.test(el.type || 'text')) {
      return true;
    }

    // Element-level isContentEditable check
    if (el.isContentEditable === true) return true;

    // Rich text editor wrappers & ARIA roles (Twitter/X, DraftJS, Lexical, ProseMirror, Slate, Notion, etc.)
    if (typeof el.closest === 'function') {
      const editableAncestor = el.closest(
        '[contenteditable]:not([contenteditable="false"]), [contenteditable="plaintext-only"], [role="textbox"], [role="combobox"], [data-lexical-editor], [data-slate-editor], .DraftEditor-root, .ProseMirror, .ql-editor, .monaco-editor, .CodeMirror'
      );
      if (editableAncestor) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get closest editable root element for a node
   */
  function getEditableRoot(node) {
    if (!node) return null;
    const isElement = node.nodeType === 1 || (typeof Node !== 'undefined' && node.nodeType === Node.ELEMENT_NODE);
    let el = isElement ? node : node.parentElement;
    if (!el) return null;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return el;
    if (el.isContentEditable) return el;

    if (typeof el.closest === 'function') {
      return (
        el.closest(
          '[contenteditable]:not([contenteditable="false"]), [contenteditable="plaintext-only"], [role="textbox"], [role="combobox"], [data-lexical-editor], [data-slate-editor], .DraftEditor-root, .ProseMirror, .ql-editor'
        ) || el
      );
    }
    return el;
  }

  /**
   * Extract current text selection and editable target
   */
  function captureSelection() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return null;

    const activeEl = document.activeElement;

    // 1. Check if active element is an input or textarea
    if (activeEl && (activeEl.tagName === 'TEXTAREA' || (activeEl.tagName === 'INPUT' && /^(text|search|url|tel|email|password)$/i.test(activeEl.type || 'text')))) {
      const start = activeEl.selectionStart;
      const end = activeEl.selectionEnd;
      if (typeof start === 'number' && typeof end === 'number' && start !== end) {
        const selectedText = activeEl.value.substring(start, end);
        const rect = activeEl.getBoundingClientRect();
        return {
          text: selectedText,
          isEditable: true,
          element: activeEl,
          editableContainer: activeEl,
          start,
          end,
          rect,
        };
      }
    }

    // 2. Standard DOM selection
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;

    const selectedText = selection.toString().trim();
    if (!selectedText) return null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();

    // Check if anchor, focus, common ancestor or activeElement is editable
    const container = range.commonAncestorContainer;
    const isEditable =
      isNodeEditable(container) ||
      isNodeEditable(range.startContainer) ||
      isNodeEditable(range.endContainer) ||
      isNodeEditable(selection.anchorNode) ||
      isNodeEditable(selection.focusNode) ||
      isNodeEditable(activeEl);

    // If activeEl is a textarea/input even if range is inside it
    let targetEl = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
    if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
      targetEl = activeEl;
    }

    const editableContainer = getEditableRoot(targetEl) || getEditableRoot(activeEl);

    return {
      text: selectedText,
      isEditable,
      range: range.cloneRange(),
      element: targetEl,
      editableContainer,
      rect,
    };
  }

  /**
   * Explicitly remove floating UI and clear all selection tracking
   */
  function removeCard() {
    if (activeHost && activeHost.parentElement) {
      activeHost.parentElement.removeChild(activeHost);
    }
    activeHost = null;
    activeShadowRoot = null;
    activeSelectionContext = null;
    isReplacing = false;
  }

  /**
   * Create or retrieve existing Shadow Root (preserves activeSelectionContext)
   */
  function initShadowHost() {
    if (activeHost && activeShadowRoot && document.body.contains(activeHost)) {
      return activeShadowRoot;
    }

    // If a detached host exists, clean it up
    if (activeHost && activeHost.parentElement) {
      activeHost.parentElement.removeChild(activeHost);
    }

    const host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });

    // Load stylesheet into shadow root
    const style = document.createElement('link');
    style.rel = 'stylesheet';
    style.href = chrome.runtime.getURL('content.css');
    shadow.appendChild(style);

    activeHost = host;
    activeShadowRoot = shadow;
    return shadow;
  }

  /**
   * Position the card near the selection
   */
  function positionCard(rect) {
    if (!activeHost || typeof window === 'undefined' || !rect) return;

    const cardWidth = 440;
    const cardHeightEstimate = 320;
    const padding = 12;

    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;

    let targetLeft = rect.left + scrollX;
    let targetTop = rect.bottom + scrollY + 8; // Default: below selection

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Check bottom boundary -> flip above if necessary
    if (rect.bottom + cardHeightEstimate > viewportHeight && rect.top - cardHeightEstimate > 0) {
      targetTop = rect.top + scrollY - cardHeightEstimate - 8;
    }

    // Check horizontal boundaries
    if (targetLeft + cardWidth > scrollX + viewportWidth - padding) {
      targetLeft = scrollX + viewportWidth - cardWidth - padding;
    }
    if (targetLeft < scrollX + padding) {
      targetLeft = scrollX + padding;
    }

    activeHost.style.left = `${Math.max(0, targetLeft)}px`;
    activeHost.style.top = `${Math.max(0, targetTop)}px`;
  }

  /**
   * Perform single-pass replacement on target node
   */
  function replaceSelectedText(ctx, newText) {
    if (!ctx || !ctx.isEditable || typeof document === 'undefined') return false;

    // 1. Textarea and Form Inputs (Use standard W3C setRangeText)
    const targetEl = ctx.element || ctx.editableContainer;
    if (targetEl && (targetEl.tagName === 'TEXTAREA' || targetEl.tagName === 'INPUT')) {
      targetEl.focus();

      const start = typeof ctx.start === 'number' ? ctx.start : targetEl.selectionStart;
      const end = typeof ctx.end === 'number' ? ctx.end : targetEl.selectionEnd;

      if (typeof targetEl.setRangeText === 'function' && typeof start === 'number' && typeof end === 'number') {
        targetEl.setRangeText(newText, start, end, 'end');
      } else {
        const val = targetEl.value;
        targetEl.value = val.substring(0, start) + newText + val.substring(end);
        targetEl.setSelectionRange(start + newText.length, start + newText.length);
      }

      // Single change notification event
      targetEl.dispatchEvent(new Event('input', { bubbles: true }));
      targetEl.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }

    // 2. Rich Text / ContentEditable (Twitter/X, DraftJS, Lexical, ProseMirror, Slate, etc.)
    if (ctx.range && typeof window !== 'undefined') {
      const containerEl = ctx.editableContainer || ctx.element || document.activeElement;
      if (containerEl && typeof containerEl.focus === 'function') {
        containerEl.focus();
      }

      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(ctx.range);

      let success = false;
      try {
        // execCommand('insertText') automatically triggers native beforeinput and input events in one pass
        success = document.execCommand('insertText', false, newText);
      } catch {}

      if (!success) {
        try {
          ctx.range.deleteContents();
          const textNode = document.createTextNode(newText);
          ctx.range.insertNode(textNode);
          ctx.range.setStartAfter(textNode);
          ctx.range.setEndAfter(textNode);
          selection.removeAllRanges();
          selection.addRange(ctx.range);
          if (containerEl) {
            containerEl.dispatchEvent(new Event('input', { bubbles: true }));
          }
          success = true;
        } catch (err) {
          console.error('DOM replacement fallback error:', err);
        }
      }

      return success;
    }

    return false;
  }

  /**
   * Safe message dispatcher with extension invalidation detection
   */
  async function sendExtensionMessage(payload) {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) {
      throw new Error('EXTENSION_CONTEXT_INVALIDATED');
    }

    try {
      return await chrome.runtime.sendMessage(payload);
    } catch (err) {
      const msg = err?.message || '';
      if (
        msg.includes('Receiving end does not exist') ||
        msg.includes('Extension context invalidated') ||
        msg.includes('context invalidated')
      ) {
        throw new Error('EXTENSION_CONTEXT_INVALIDATED');
      }
      throw err;
    }
  }

  /**
   * Render Floating UI Card
   */
  function renderCard({
    toneId = 'professional',
    toneLabel = 'Professional',
    state = 'loading', // 'loading' | 'custom_input' | 'result' | 'error'
    originalText = '',
    polishedText = '',
    errorMessage = '',
    isDisconnected = false,
    viewMode = 'diff', // 'diff' | 'side' | 'polished'
  }) {
    const shadow = activeShadowRoot;
    if (!shadow || typeof document === 'undefined') return;

    // Clean previous card markup but preserve <link> stylesheet
    const existingCard = shadow.querySelector('.polisher-card');
    if (existingCard) {
      existingCard.remove();
    }

    const card = document.createElement('div');
    card.className = 'polisher-card';

    // Header
    const header = document.createElement('div');
    header.className = 'polisher-header';
    header.innerHTML = `
      <div class="polisher-title">
        <span class="polisher-icon">✨</span>
        <span>LLM Text Polisher</span>
        <span class="tone-pill">${escapeHtml(toneLabel)}</span>
      </div>
      <div class="header-controls">
        <button class="btn-close" title="Close (Esc)">✕</button>
      </div>
    `;
    card.appendChild(header);

    // Body container
    const body = document.createElement('div');
    body.className = 'polisher-body';

    if (state === 'loading') {
      body.innerHTML = `
        <div class="loading-view">
          <div class="loading-status">
            <div class="spinner"></div>
            <span>Polishing text with AI...</span>
          </div>
          <div class="skeleton-line w-95"></div>
          <div class="skeleton-line w-80"></div>
          <div class="skeleton-line w-60"></div>
        </div>
      `;
    } else if (state === 'custom_input') {
      body.innerHTML = `
        <div class="custom-prompt-container">
          <label class="input-label" for="custom-instruction">Enter your custom polishing instruction:</label>
          <textarea
            id="custom-instruction"
            class="prompt-textarea"
            placeholder="e.g. Make it more punchy, translate into formal French, shorten to 1 tweet..."
            autofocus
          ></textarea>
        </div>
      `;
    } else if (state === 'result') {
      let contentHtml = '';

      if (viewMode === 'diff') {
        const diffSegments = computeWordDiff(originalText, polishedText);
        const diffHtml = diffSegments
          .map((seg) => {
            if (seg.type === 'insert') {
              return `<ins class="diff-ins">${escapeHtml(seg.text)}</ins>`;
            }
            if (seg.type === 'delete') {
              return `<del class="diff-del">${escapeHtml(seg.text)}</del>`;
            }
            return escapeHtml(seg.text);
          })
          .join('');

        contentHtml = `<div class="result-box">${diffHtml}</div>`;
      } else if (viewMode === 'side') {
        contentHtml = `
          <div class="side-by-side-grid">
            <div>
              <div class="side-col-header">Original</div>
              <div class="side-box">${escapeHtml(originalText)}</div>
            </div>
            <div>
              <div class="side-col-header">Polished</div>
              <div class="side-box">${escapeHtml(polishedText)}</div>
            </div>
          </div>
        `;
      } else {
        contentHtml = `<div class="result-box">${escapeHtml(polishedText)}</div>`;
      }

      body.innerHTML = `
        <div class="view-tabs">
          <button class="tab-btn ${viewMode === 'diff' ? 'active' : ''}" data-mode="diff">Diff View</button>
          <button class="tab-btn ${viewMode === 'side' ? 'active' : ''}" data-mode="side">Side-by-Side</button>
          <button class="tab-btn ${viewMode === 'polished' ? 'active' : ''}" data-mode="polished">Polished Text</button>
        </div>
        ${contentHtml}
        <div class="tweak-section">
          <input type="text" class="tweak-input" placeholder="Refine further (e.g. make it shorter, warmer)..." />
          <button class="btn btn-secondary btn-sm btn-tweak-submit">Tweak</button>
        </div>
      `;
    } else if (state === 'error') {
      if (isDisconnected) {
        body.innerHTML = `
          <div class="error-box">
            <div class="error-title">
              <span>🔄</span>
              <span>Extension Reconnection Required</span>
            </div>
            <div class="error-message">
              The extension was updated or reloaded in the background. Please refresh this webpage to reconnect.
            </div>
            <div class="error-actions">
              <button class="btn btn-primary btn-sm btn-refresh-page">🔄 Refresh Webpage</button>
            </div>
          </div>
        `;
      } else {
        body.innerHTML = `
          <div class="error-box">
            <div class="error-title">
              <span>⚠️</span>
              <span>Polishing Request Failed</span>
            </div>
            <div class="error-message">${escapeHtml(errorMessage)}</div>
            <div class="error-actions">
              <button class="btn btn-secondary btn-sm btn-open-settings">Open Settings</button>
              <button class="btn btn-primary btn-sm btn-retry">Retry</button>
            </div>
          </div>
        `;
      }
    }

    card.appendChild(body);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'polisher-footer';

    if (state === 'custom_input') {
      footer.innerHTML = `
        <div class="footer-left"></div>
        <div class="footer-right">
          <button class="btn btn-secondary btn-dismiss">Cancel</button>
          <button class="btn btn-primary btn-submit-custom">✨ Polish</button>
        </div>
      `;
    } else if (state === 'result') {
      const isEditable = activeSelectionContext?.isEditable;
      footer.innerHTML = `
        <div class="footer-left">
          ${!isEditable ? '<span class="badge-read-only" title="Cannot replace text on read-only pages">Read-Only</span>' : ''}
        </div>
        <div class="footer-right">
          <button class="btn btn-secondary btn-copy">📋 Copy</button>
          <button class="btn btn-primary btn-replace" ${!isEditable ? 'disabled title="Selection is not editable"' : ''}>
            🔄 Replace
          </button>
        </div>
      `;
    } else if (state === 'loading') {
      footer.innerHTML = `
        <div class="footer-left"></div>
        <div class="footer-right">
          <button class="btn btn-secondary btn-dismiss">Cancel</button>
        </div>
      `;
    } else {
      footer.innerHTML = `
        <div class="footer-left"></div>
        <div class="footer-right">
          <button class="btn btn-secondary btn-dismiss">Dismiss</button>
        </div>
      `;
    }

    card.appendChild(footer);
    shadow.appendChild(card);

    // Bind Card Events
    bindCardEvents(card, {
      toneId,
      toneLabel,
      originalText,
      polishedText,
      viewMode,
    });
  }

  /**
   * Bind event listeners inside Shadow Root
   */
  function bindCardEvents(card, ctx) {
    const closeBtn = card.querySelector('.btn-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', removeCard);
    }

    const dismissBtns = card.querySelectorAll('.btn-dismiss');
    dismissBtns.forEach((btn) => btn.addEventListener('click', removeCard));

    // Refresh page button on disconnected extension
    const refreshPageBtn = card.querySelector('.btn-refresh-page');
    if (refreshPageBtn) {
      refreshPageBtn.addEventListener('click', () => {
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      });
    }

    // Mode tabs switch
    const tabBtns = card.querySelectorAll('.tab-btn');
    tabBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const mode = e.target.getAttribute('data-mode');
        renderCard({
          toneId: ctx.toneId,
          toneLabel: ctx.toneLabel,
          state: 'result',
          originalText: ctx.originalText,
          polishedText: ctx.polishedText,
          viewMode: mode,
        });
      });
    });

    // Custom instruction submit
    const submitCustomBtn = card.querySelector('.btn-submit-custom');
    const customTextarea = card.querySelector('#custom-instruction');
    if (submitCustomBtn && customTextarea) {
      const executeSubmit = () => {
        const customPrompt = customTextarea.value.trim();
        executePolishFlow({
          toneId: 'custom',
          toneLabel: 'Custom',
          customInstruction: customPrompt,
          selectionOverride: activeSelectionContext,
        });
      };

      submitCustomBtn.addEventListener('click', executeSubmit);
      customTextarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          executeSubmit();
        }
      });
    }

    // Tweak submit
    const tweakInput = card.querySelector('.tweak-input');
    const tweakSubmitBtn = card.querySelector('.btn-tweak-submit');
    if (tweakSubmitBtn && tweakInput) {
      const executeTweak = () => {
        const tweakInstruction = tweakInput.value.trim();
        if (!tweakInstruction) return;

        executePolishFlow({
          toneId: ctx.toneId,
          toneLabel: ctx.toneLabel,
          customInstruction: tweakInstruction,
          textOverride: ctx.polishedText || ctx.originalText,
          selectionOverride: activeSelectionContext,
        });
      };

      tweakSubmitBtn.addEventListener('click', executeTweak);
      tweakInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          executeTweak();
        }
      });
    }

    // Replace button (single execution guarded)
    const replaceBtn = card.querySelector('.btn-replace');
    if (replaceBtn) {
      replaceBtn.addEventListener('click', () => {
        if (isReplacing) return;
        isReplacing = true;

        const success = replaceSelectedText(activeSelectionContext, ctx.polishedText);
        if (success) {
          replaceBtn.textContent = '✓ Replaced!';
          replaceBtn.style.background = '#10b981';
          setTimeout(removeCard, 400);
        } else {
          isReplacing = false;
        }
      });
    }

    // Copy button
    const copyBtn = card.querySelector('.btn-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(ctx.polishedText);
          copyBtn.textContent = '✓ Copied!';
          copyBtn.style.borderColor = '#10b981';
          copyBtn.style.color = '#34d399';
          setTimeout(() => {
            copyBtn.textContent = '📋 Copy';
            copyBtn.style.borderColor = '';
            copyBtn.style.color = '';
          }, 2000);
        } catch (err) {
          console.error('Clipboard copy failed:', err);
        }
      });
    }

    // Error actions
    const openSettingsBtn = card.querySelector('.btn-open-settings');
    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', async () => {
        try {
          await sendExtensionMessage({ type: 'OPEN_OPTIONS_PAGE' });
        } catch {
          window.location.reload();
        }
      });
    }

    const retryBtn = card.querySelector('.btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        executePolishFlow({
          toneId: ctx.toneId,
          toneLabel: ctx.toneLabel,
          selectionOverride: activeSelectionContext,
        });
      });
    }
  }

  /**
   * Main flow controller: manages state transitions and background communication
   */
  async function executePolishFlow({
    toneId,
    toneLabel = '',
    customInstruction = '',
    textOverride = null,
    selectionOverride = null,
  }) {
    const sel = selectionOverride || activeSelectionContext || captureSelection();
    if (!sel || !sel.text) {
      return;
    }

    activeSelectionContext = sel;
    const textToPolish = textOverride || sel.text;
    const resolvedToneLabel = toneLabel || (toneId.charAt(0).toUpperCase() + toneId.slice(1));

    initShadowHost();
    if (sel.rect) {
      positionCard(sel.rect);
    }

    if (toneId === 'custom' && !customInstruction) {
      // Prompt user for custom instruction first
      renderCard({
        toneId,
        toneLabel: 'Custom Prompt',
        state: 'custom_input',
        originalText: textToPolish,
      });
      return;
    }

    // Render loading state
    renderCard({
      toneId,
      toneLabel: resolvedToneLabel,
      state: 'loading',
      originalText: textToPolish,
    });

    try {
      const response = await sendExtensionMessage({
        type: 'EXECUTE_POLISH',
        text: textToPolish,
        toneId,
        customInstruction,
      });

      if (!response || !response.success) {
        renderCard({
          toneId,
          toneLabel: resolvedToneLabel,
          state: 'error',
          originalText: textToPolish,
          errorMessage: response?.error || 'Unknown error occurred while contacting AI service.',
        });
        return;
      }

      renderCard({
        toneId,
        toneLabel: resolvedToneLabel,
        state: 'result',
        originalText: textToPolish,
        polishedText: response.polishedText,
        viewMode: 'diff',
      });
    } catch (err) {
      const isContextInvalidated = err.message === 'EXTENSION_CONTEXT_INVALIDATED';
      renderCard({
        toneId,
        toneLabel: resolvedToneLabel,
        state: 'error',
        originalText: textToPolish,
        isDisconnected: isContextInvalidated,
        errorMessage: err.message || 'Failed to send message to extension background worker.',
      });
    }
  }

  // Global dismissal handlers
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activeHost) {
        removeCard();
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (activeHost && !activeHost.contains(e.target) && e.target !== activeHost) {
        // Don't close immediately if clicking inside shadow root
        const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
        if (!path.includes(activeHost)) {
          removeCard();
        }
      }
    });
  }

  // Extension message listener
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!message || !message.type) return;

      if (message.type === 'CONTEXT_MENU_POLISH' || message.type === 'SHORTCUT_POLISH') {
        const selection = captureSelection();
        if (!selection && message.selectedText) {
          // Fallback context if context menu provided selection text
          activeSelectionContext = {
            text: message.selectedText,
            isEditable: false,
            rect: {
              left: (typeof window !== 'undefined' ? window.innerWidth : 800) / 2 - 200,
              right: (typeof window !== 'undefined' ? window.innerWidth : 800) / 2 + 200,
              top: (typeof window !== 'undefined' ? window.innerHeight : 600) / 3,
              bottom: (typeof window !== 'undefined' ? window.innerHeight : 600) / 3 + 40,
              width: 400,
              height: 40,
            },
          };
        } else if (selection) {
          activeSelectionContext = selection;
        }

        if (activeSelectionContext) {
          executePolishFlow({
            toneId: message.toneId || 'professional',
            selectionOverride: activeSelectionContext,
          });
        }
        sendResponse({ received: true });
      }
    });
  }

  // Export internal helpers for unit testing if in Node environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      computeWordDiff,
      escapeHtml,
      isNodeEditable,
    };
  }
})();
