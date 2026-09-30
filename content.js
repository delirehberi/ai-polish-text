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
   * Pure safe DOM-based Card Builder (Zero innerHTML for strict AMO/CWS compliance)
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

    // Clean previous card markup safely
    const existingCard = shadow.querySelector('.polisher-card');
    if (existingCard) {
      existingCard.remove();
    }

    const card = document.createElement('div');
    card.className = 'polisher-card';

    // 1. Header
    const header = document.createElement('div');
    header.className = 'polisher-header';

    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'polisher-title';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'polisher-icon';
    iconSpan.textContent = '✨';

    const textSpan = document.createElement('span');
    textSpan.textContent = 'LLM Text Polisher';

    const tonePill = document.createElement('span');
    tonePill.className = 'tone-pill';
    tonePill.textContent = toneLabel;

    titleWrapper.append(iconSpan, textSpan, tonePill);

    const controlsWrapper = document.createElement('div');
    controlsWrapper.className = 'header-controls';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-close';
    closeBtn.title = 'Close (Esc)';
    closeBtn.textContent = '✕';

    controlsWrapper.appendChild(closeBtn);
    header.append(titleWrapper, controlsWrapper);
    card.appendChild(header);

    // 2. Body container
    const body = document.createElement('div');
    body.className = 'polisher-body';

    if (state === 'loading') {
      const loadingView = document.createElement('div');
      loadingView.className = 'loading-view';

      const statusRow = document.createElement('div');
      statusRow.className = 'loading-status';

      const spinner = document.createElement('div');
      spinner.className = 'spinner';

      const statusText = document.createElement('span');
      statusText.textContent = 'Polishing text with AI...';

      statusRow.append(spinner, statusText);

      const line1 = document.createElement('div');
      line1.className = 'skeleton-line w-95';

      const line2 = document.createElement('div');
      line2.className = 'skeleton-line w-80';

      const line3 = document.createElement('div');
      line3.className = 'skeleton-line w-60';

      loadingView.append(statusRow, line1, line2, line3);
      body.appendChild(loadingView);
    } else if (state === 'custom_input') {
      const customContainer = document.createElement('div');
      customContainer.className = 'custom-prompt-container';

      const label = document.createElement('label');
      label.className = 'input-label';
      label.htmlFor = 'custom-instruction';
      label.textContent = 'Enter your custom polishing instruction:';

      const textarea = document.createElement('textarea');
      textarea.id = 'custom-instruction';
      textarea.className = 'prompt-textarea';
      textarea.placeholder = 'e.g. Make it more punchy, translate into formal French, shorten to 1 tweet...';
      textarea.autofocus = true;

      customContainer.append(label, textarea);
      body.appendChild(customContainer);
    } else if (state === 'result') {
      const tabsRow = document.createElement('div');
      tabsRow.className = 'view-tabs';

      const tabDiff = document.createElement('button');
      tabDiff.className = `tab-btn ${viewMode === 'diff' ? 'active' : ''}`;
      tabDiff.dataset.mode = 'diff';
      tabDiff.textContent = 'Diff View';

      const tabSide = document.createElement('button');
      tabSide.className = `tab-btn ${viewMode === 'side' ? 'active' : ''}`;
      tabSide.dataset.mode = 'side';
      tabSide.textContent = 'Side-by-Side';

      const tabPolished = document.createElement('button');
      tabPolished.className = `tab-btn ${viewMode === 'polished' ? 'active' : ''}`;
      tabPolished.dataset.mode = 'polished';
      tabPolished.textContent = 'Polished Text';

      tabsRow.append(tabDiff, tabSide, tabPolished);
      body.appendChild(tabsRow);

      if (viewMode === 'diff') {
        const resultBox = document.createElement('div');
        resultBox.className = 'result-box';

        const diffSegments = computeWordDiff(originalText, polishedText);
        diffSegments.forEach((seg) => {
          if (seg.type === 'insert') {
            const ins = document.createElement('ins');
            ins.className = 'diff-ins';
            ins.textContent = seg.text;
            resultBox.appendChild(ins);
          } else if (seg.type === 'delete') {
            const del = document.createElement('del');
            del.className = 'diff-del';
            del.textContent = seg.text;
            resultBox.appendChild(del);
          } else {
            resultBox.appendChild(document.createTextNode(seg.text));
          }
        });

        body.appendChild(resultBox);
      } else if (viewMode === 'side') {
        const grid = document.createElement('div');
        grid.className = 'side-by-side-grid';

        const col1 = document.createElement('div');
        const header1 = document.createElement('div');
        header1.className = 'side-col-header';
        header1.textContent = 'Original';
        const box1 = document.createElement('div');
        box1.className = 'side-box';
        box1.textContent = originalText;
        col1.append(header1, box1);

        const col2 = document.createElement('div');
        const header2 = document.createElement('div');
        header2.className = 'side-col-header';
        header2.textContent = 'Polished';
        const box2 = document.createElement('div');
        box2.className = 'side-box';
        box2.textContent = polishedText;
        col2.append(header2, box2);

        grid.append(col1, col2);
        body.appendChild(grid);
      } else {
        const resultBox = document.createElement('div');
        resultBox.className = 'result-box';
        resultBox.textContent = polishedText;
        body.appendChild(resultBox);
      }

      // Tweak section
      const tweakSection = document.createElement('div');
      tweakSection.className = 'tweak-section';

      const tweakInput = document.createElement('input');
      tweakInput.type = 'text';
      tweakInput.className = 'tweak-input';
      tweakInput.placeholder = 'Refine further (e.g. make it shorter, warmer)...';

      const tweakSubmit = document.createElement('button');
      tweakSubmit.className = 'btn btn-secondary btn-sm btn-tweak-submit';
      tweakSubmit.textContent = 'Tweak';

      tweakSection.append(tweakInput, tweakSubmit);
      body.appendChild(tweakSection);
    } else if (state === 'error') {
      const errorBox = document.createElement('div');
      errorBox.className = 'error-box';

      const errorTitle = document.createElement('div');
      errorTitle.className = 'error-title';

      const errorIcon = document.createElement('span');
      errorIcon.textContent = isDisconnected ? '🔄' : '⚠️';

      const errorHeading = document.createElement('span');
      errorHeading.textContent = isDisconnected ? 'Extension Reconnection Required' : 'Polishing Request Failed';

      errorTitle.append(errorIcon, errorHeading);

      const errorMsg = document.createElement('div');
      errorMsg.className = 'error-message';
      errorMsg.textContent = isDisconnected
        ? 'The extension was updated or reloaded in the background. Please refresh this webpage to reconnect.'
        : errorMessage;

      const errorActions = document.createElement('div');
      errorActions.className = 'error-actions';

      if (isDisconnected) {
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'btn btn-primary btn-sm btn-refresh-page';
        refreshBtn.textContent = '🔄 Refresh Webpage';
        errorActions.appendChild(refreshBtn);
      } else {
        const openSettingsBtn = document.createElement('button');
        openSettingsBtn.className = 'btn btn-secondary btn-sm btn-open-settings';
        openSettingsBtn.textContent = 'Open Settings';

        const retryBtn = document.createElement('button');
        retryBtn.className = 'btn btn-primary btn-sm btn-retry';
        retryBtn.textContent = 'Retry';

        errorActions.append(openSettingsBtn, retryBtn);
      }

      errorBox.append(errorTitle, errorMsg, errorActions);
      body.appendChild(errorBox);
    }

    card.appendChild(body);

    // 3. Footer
    const footer = document.createElement('div');
    footer.className = 'polisher-footer';

    const footerLeft = document.createElement('div');
    footerLeft.className = 'footer-left';

    const footerRight = document.createElement('div');
    footerRight.className = 'footer-right';

    if (state === 'custom_input') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary btn-dismiss';
      cancelBtn.textContent = 'Cancel';

      const submitBtn = document.createElement('button');
      submitBtn.className = 'btn btn-primary btn-submit-custom';
      submitBtn.textContent = '✨ Polish';

      footerRight.append(cancelBtn, submitBtn);
    } else if (state === 'result') {
      const isEditable = activeSelectionContext?.isEditable;
      if (!isEditable) {
        const readOnlyBadge = document.createElement('span');
        readOnlyBadge.className = 'badge-read-only';
        readOnlyBadge.title = 'Cannot replace text on read-only pages';
        readOnlyBadge.textContent = 'Read-Only';
        footerLeft.appendChild(readOnlyBadge);
      }

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-secondary btn-copy';
      copyBtn.textContent = '📋 Copy';

      const replaceBtn = document.createElement('button');
      replaceBtn.className = 'btn btn-primary btn-replace';
      replaceBtn.textContent = '🔄 Replace';
      if (!isEditable) {
        replaceBtn.disabled = true;
        replaceBtn.title = 'Selection is not editable';
      }

      footerRight.append(copyBtn, replaceBtn);
    } else if (state === 'loading') {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn-secondary btn-dismiss';
      cancelBtn.textContent = 'Cancel';
      footerRight.appendChild(cancelBtn);
    } else {
      const dismissBtn = document.createElement('button');
      dismissBtn.className = 'btn btn-secondary btn-dismiss';
      dismissBtn.textContent = 'Dismiss';
      footerRight.appendChild(dismissBtn);
    }

    footer.append(footerLeft, footerRight);
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

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
