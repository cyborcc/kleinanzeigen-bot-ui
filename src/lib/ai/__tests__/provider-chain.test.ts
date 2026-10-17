// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAiEndpoints, resolveAiEndpoint, isAiServerManaged } from '../provider';
import { chatCompletion } from '../chat';

const ENV_KEYS = ['SWISSCOM_QWEN_API_KEY', 'KICONNECT_API_KEY', 'OPENROUTER_API_KEY', 'KICONNECT_MODEL', 'SWISSCOM_FALLBACK_MODEL'] as const;
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('resolveAiEndpoints', () => {
  it('orders Swisscom Qwen, KI-Connect, Swisscom GLM when both keys are set', () => {
    process.env.SWISSCOM_QWEN_API_KEY = 'sw-key';
    process.env.KICONNECT_API_KEY = 'ki-key';
    const eps = resolveAiEndpoints({}, 'text');
    expect(eps.map((e) => [e.label, e.model])).toEqual([
      ['Swisscom', 'qwen3.5-397b-a17b'],
      ['KI-Connect NRW', 'inferenz-mistral-small-4-119b'],
      ['Swisscom', 'glm-5.3-flash'],
    ]);
  });

  it('switches thinking off only for Qwen, GLM and Mistral get no extra body', () => {
    process.env.SWISSCOM_QWEN_API_KEY = 'sw-key';
    process.env.KICONNECT_API_KEY = 'ki-key';
    const [qwen, mistral, glm] = resolveAiEndpoints({}, 'text');
    expect(qwen.extraBody).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(mistral.extraBody).toBeUndefined();
    expect(glm.extraBody).toBeUndefined();
  });

  it('works without a KI-Connect key (Swisscom only)', () => {
    process.env.SWISSCOM_QWEN_API_KEY = 'sw-key';
    expect(resolveAiEndpoints({}, 'vision').map((e) => e.model)).toEqual(['qwen3.5-397b-a17b', 'glm-5.3-flash']);
  });

  it('uses KI-Connect alone when there is no Swisscom key', () => {
    process.env.KICONNECT_API_KEY = 'ki-key';
    expect(resolveAiEndpoints({}, 'text').map((e) => e.label)).toEqual(['KI-Connect NRW']);
  });

  it('never adds OpenRouter as a fallback behind Swisscom, even if OPENROUTER_API_KEY is set', () => {
    process.env.SWISSCOM_QWEN_API_KEY = 'sw-key';
    process.env.OPENROUTER_API_KEY = 'other-provider-key';
    const urls = resolveAiEndpoints({}, 'vision').map((e) => e.baseUrl);
    expect(urls.some((u) => u.includes('openrouter.ai'))).toBe(false);
    expect(resolveAiEndpoints({}, 'vision').some((e) => e.apiKey === 'other-provider-key')).toBe(false);
  });

  it('falls back to the config.yaml / OpenRouter settings when no server keys exist', () => {
    process.env.OPENROUTER_API_KEY = 'or-key';
    const eps = resolveAiEndpoints({ model: 'openai/gpt-4.1-nano' }, 'text');
    expect(eps).toHaveLength(1);
    expect(eps[0]).toMatchObject({ label: 'OpenRouter', apiKey: 'or-key', model: 'openai/gpt-4.1-nano' });
  });

  it('reports no endpoint and an empty key when nothing is configured', () => {
    expect(resolveAiEndpoints({}, 'text')).toEqual([]);
    expect(resolveAiEndpoint({}, 'text').apiKey).toBe('');
  });

  it('reports server managed only with a Swisscom key', () => {
    expect(isAiServerManaged()).toBe(false);
    process.env.SWISSCOM_QWEN_API_KEY = 'sw-key';
    expect(isAiServerManaged()).toBe(true);
  });
});

function jsonResponse(content: string | null, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200, ...init });
}

describe('chatCompletion fallback', () => {
  beforeEach(() => {
    process.env.SWISSCOM_QWEN_API_KEY = 'sw-key';
    process.env.KICONNECT_API_KEY = 'ki-key';
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  const req = { messages: [{ role: 'user', content: 'hi' }], temperature: 0.7, max_tokens: 300 };

  it('returns the primary answer without calling the others', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse('Hey, ja noch da. VG'));
    const r = await chatCompletion({}, 'text', req, { timeoutMs: 5000, fetchImpl });
    expect(r).toMatchObject({ ok: true, content: 'Hey, ja noch da. VG', provider: 'Swisscom', model: 'qwen3.5-397b-a17b' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(body.max_tokens).toBe(300);
  });

  it('switches to KI-Connect when Swisscom answers with an HTTP error, with that provider key and model', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('upstream down', { status: 504 }))
      .mockResolvedValueOnce(jsonResponse('Servus! VG'));
    const r = await chatCompletion({}, 'text', req, { timeoutMs: 5000, fetchImpl });
    expect(r).toMatchObject({ ok: true, provider: 'KI-Connect NRW', model: 'inferenz-mistral-small-4-119b' });
    const [url, init] = fetchImpl.mock.calls[1];
    expect(String(url)).toBe('https://chat.kiconnect.nrw/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ki-key');
    expect(JSON.parse(init.body as string).chat_template_kwargs).toBeUndefined();
  });

  it('treats an empty answer as a failure and tries the next provider', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(''))
      .mockResolvedValueOnce(jsonResponse('Antwort von KI-Connect'));
    const r = await chatCompletion({}, 'text', req, { timeoutMs: 5000, fetchImpl });
    expect(r).toMatchObject({ ok: true, content: 'Antwort von KI-Connect' });
  });

  it('rejects an unusable answer via accept() and uses the next provider', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse('Das ist leider kein JSON'))
      .mockResolvedValueOnce(jsonResponse('{"title":"ok"}'));
    const r = await chatCompletion({}, 'text', req, {
      timeoutMs: 5000,
      fetchImpl,
      accept: (c) => c.trim().startsWith('{'),
    });
    expect(r).toMatchObject({ ok: true, content: '{"title":"ok"}', provider: 'KI-Connect NRW' });
  });

  it('continues after a network error and reaches the last provider', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(jsonResponse('GLM antwortet'));
    const r = await chatCompletion({}, 'text', req, { timeoutMs: 5000, fetchImpl });
    expect(r).toMatchObject({ ok: true, content: 'GLM antwortet', provider: 'Swisscom', model: 'glm-5.3-flash' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails with the last HTTP status and every provider named when all fail, without leaking keys', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('nope', { status: 503 }));
    const r = await chatCompletion({}, 'text', req, { timeoutMs: 5000, fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(503);
      expect(r.detail).toContain('Swisscom');
      expect(r.detail).toContain('KI-Connect NRW');
      expect(r.detail).not.toContain('sw-key');
      expect(r.detail).not.toContain('ki-key');
    }
  });

  it('answers 400 without any request when no provider is configured', async () => {
    delete process.env.SWISSCOM_QWEN_API_KEY;
    delete process.env.KICONNECT_API_KEY;
    const fetchImpl = vi.fn();
    const r = await chatCompletion({}, 'text', req, { timeoutMs: 5000, fetchImpl });
    expect(r).toMatchObject({ ok: false, status: 400 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
