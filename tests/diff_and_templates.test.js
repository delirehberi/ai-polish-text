const test = require('node:test');
const assert = require('node:assert/strict');

const { buildPrompt, normalizeBaseUrl, DEFAULT_USER_TEMPLATE } = require('../background.js');
const { computeWordDiff, escapeHtml, isNodeEditable } = require('../content.js');

test('normalizeBaseUrl removes trailing slashes', () => {
  assert.equal(normalizeBaseUrl('https://api.openai.com/v1/'), 'https://api.openai.com/v1');
  assert.equal(normalizeBaseUrl('https://api.openai.com/v1///'), 'https://api.openai.com/v1');
  assert.equal(normalizeBaseUrl('http://localhost:11434'), 'http://localhost:11434');
  assert.equal(normalizeBaseUrl('  https://api.groq.com/openai/v1/  '), 'https://api.groq.com/openai/v1');
});

test('buildPrompt correctly interpolates variables into template', () => {
  const template = 'Tone: {{tone}}\nText: {{text}}\n{{instruction}}';
  const result = buildPrompt(template, {
    text: 'Hello world',
    tonePrompt: 'Be professional',
    customInstruction: 'Keep it short',
  });

  assert.ok(result.includes('Tone: Be professional'));
  assert.ok(result.includes('Text: Hello world'));
  assert.ok(result.includes('Additional instructions: Keep it short'));
});

test('buildPrompt works with default template and empty custom instruction', () => {
  const result = buildPrompt(DEFAULT_USER_TEMPLATE, {
    text: 'Sample input text',
    tonePrompt: 'Casual tone',
    customInstruction: '',
  });

  assert.ok(result.includes('Tone/Instruction: Casual tone'));
  assert.ok(result.includes('Sample input text'));
  assert.ok(!result.includes('Additional instructions:'));
});

test('escapeHtml prevents XSS injection in DOM rendering', () => {
  const dangerous = '<script>alert("xss")</script> & "test" \'quote\'';
  const escaped = escapeHtml(dangerous);

  assert.equal(escaped, '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &quot;test&quot; &#039;quote&#039;');
});

test('computeWordDiff detects identical text', () => {
  const diff = computeWordDiff('Hello world', 'Hello world');
  assert.ok(diff.every((seg) => seg.type === 'equal'));
  const reconstructed = diff.map((seg) => seg.text).join('');
  assert.equal(reconstructed, 'Hello world');
});

test('computeWordDiff detects insertions and deletions accurately', () => {
  const original = 'The quick brown fox';
  const polished = 'The fast brown fox jumps';

  const diff = computeWordDiff(original, polished);
  
  const hasDelete = diff.some((seg) => seg.type === 'delete' && seg.text === 'quick');
  const hasInsertFast = diff.some((seg) => seg.type === 'insert' && seg.text === 'fast');
  const hasInsertJumps = diff.some((seg) => seg.type === 'insert' && seg.text === 'jumps');

  assert.ok(hasDelete, 'Should mark "quick" as deleted');
  assert.ok(hasInsertFast, 'Should mark "fast" as inserted');
  assert.ok(hasInsertJumps, 'Should mark "jumps" as inserted');
});

test('isNodeEditable detects textareas, inputs, contenteditables, and rich-text editors', () => {
  // Mock element structure
  const textarea = { nodeType: 1, tagName: 'TEXTAREA' };
  assert.equal(isNodeEditable(textarea), true);

  const textInput = { nodeType: 1, tagName: 'INPUT', type: 'text' };
  assert.equal(isNodeEditable(textInput), true);

  const directContentEditable = { nodeType: 1, tagName: 'DIV', isContentEditable: true };
  assert.equal(isNodeEditable(directContentEditable), true);

  const richTextSpan = {
    nodeType: 1,
    tagName: 'SPAN',
    isContentEditable: false,
    closest: (selector) => {
      if (selector.includes('[role="textbox"]') || selector.includes('.DraftEditor-root')) {
        return { nodeType: 1, tagName: 'DIV' };
      }
      return null;
    },
  };
  assert.equal(isNodeEditable(richTextSpan), true);

  const readOnlyParagraph = {
    nodeType: 1,
    tagName: 'P',
    isContentEditable: false,
    closest: () => null,
  };
  assert.equal(isNodeEditable(readOnlyParagraph), false);
});
