const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchLLM } = require('../background.js');

test('fetchLLM throws when API key is missing for OpenAI', async () => {
  await assert.rejects(
    async () => {
      await fetchLLM({
        text: 'Test',
        toneId: 'professional',
        settingsOverride: {
          provider: 'openai',
          apiKey: '',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-4o-mini',
        },
      });
    },
    {
      name: 'Error',
      message: /API Key is missing for openai/,
    }
  );
});

test('fetchLLM handles OpenAI chat completions response format', async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key-123');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.messages[0].role, 'system');

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Polished professional sentence.',
            },
          },
        ],
      }),
    };
  };

  try {
    const result = await fetchLLM({
      text: 'Rough sentence',
      toneId: 'professional',
      settingsOverride: {
        provider: 'openai',
        apiKey: 'test-key-123',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        temperature: 0.3,
      },
    });

    assert.equal(result, 'Polished professional sentence.');
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchLLM handles Anthropic messages response format', async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(options.headers['x-api-key'], 'anthropic-key-abc');
    assert.equal(options.headers['anthropic-version'], '2023-06-01');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'claude-3-5-sonnet-20241022');
    assert.ok(body.system);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: 'Anthropic polished text output.',
          },
        ],
      }),
    };
  };

  try {
    const result = await fetchLLM({
      text: 'Draft text',
      toneId: 'academic',
      settingsOverride: {
        provider: 'anthropic',
        apiKey: 'anthropic-key-abc',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3-5-sonnet-20241022',
      },
    });

    assert.equal(result, 'Anthropic polished text output.');
  } finally {
    global.fetch = originalFetch;
  }
});

test('fetchLLM handles Ollama local endpoint format without requiring API key', async () => {
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    assert.equal(url, 'http://localhost:11434/api/chat');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'llama3.2');
    assert.equal(body.stream, false);

    return {
      ok: true,
      status: 200,
      json: async () => ({
        message: {
          role: 'assistant',
          content: 'Local Ollama polished response.',
        },
      }),
    };
  };

  try {
    const result = await fetchLLM({
      text: 'Local test text',
      toneId: 'concise',
      settingsOverride: {
        provider: 'ollama',
        apiKey: '',
        baseUrl: 'http://localhost:11434',
        model: 'llama3.2',
      },
    });

    assert.equal(result, 'Local Ollama polished response.');
  } finally {
    global.fetch = originalFetch;
  }
});
