import { resolveAiEndpoints, type AiPurpose } from './provider';

export interface ChatRequest {
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
}

export type ChatResult =
  | { ok: true; content: string; provider: string; model: string }
  | { ok: false; status: number; detail: string };

interface ChatOptions {
  /** Timeout of a single attempt. The whole call is capped at twice this value. */
  timeoutMs: number;
  /** Rejects an answer that arrived with HTTP 200 but is unusable, so the next provider is tried. */
  accept?: (content: string) => boolean;
  fetchImpl?: typeof fetch;
}

interface ChatCompletionBody {
  choices?: Array<{ message?: { content?: string | null } }>;
}

/**
 * Chat completion across the configured provider chain (see resolveAiEndpoints). The next
 * provider is tried when a request errors, times out, answers with an HTTP error or returns
 * no content. Every provider gets its own model and body switches, so callers stay provider
 * agnostic.
 */
export async function chatCompletion(
  aiConfig: Record<string, string>,
  purpose: AiPurpose,
  request: ChatRequest,
  options: ChatOptions,
): Promise<ChatResult> {
  const endpoints = resolveAiEndpoints(aiConfig, purpose);
  if (endpoints.length === 0) {
    return {
      ok: false,
      status: 400,
      detail: 'No AI API key configured. Set SWISSCOM_QWEN_API_KEY or KICONNECT_API_KEY on the server.',
    };
  }

  const doFetch = options.fetchImpl ?? fetch;
  const deadline = Date.now() + options.timeoutMs * 2;
  const failures: string[] = [];
  let lastStatus = 502;

  for (const endpoint of endpoints) {
    const remaining = deadline - Date.now();
    if (failures.length > 0 && remaining < 1000) break;
    const timeout = Math.max(1000, Math.min(options.timeoutMs, remaining));

    try {
      const resp = await doFetch(`${endpoint.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${endpoint.apiKey}`,
          'Content-Type': 'application/json',
          ...endpoint.extraHeaders,
        },
        body: JSON.stringify({ model: endpoint.model, ...request, ...endpoint.extraBody }),
        signal: AbortSignal.timeout(timeout),
      });

      if (!resp.ok) {
        lastStatus = resp.status;
        const text = await resp.text().catch(() => '');
        failures.push(`${endpoint.label}: HTTP ${resp.status} ${text.slice(0, 120)}`.trim());
        continue;
      }

      const data = (await resp.json()) as ChatCompletionBody;
      const content = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!content) {
        failures.push(`${endpoint.label}: leere Antwort`);
        continue;
      }
      if (options.accept && !options.accept(content)) {
        failures.push(`${endpoint.label}: Antwort nicht verwertbar`);
        continue;
      }

      if (failures.length > 0) {
        console.warn(`[AI] Fallback auf ${endpoint.label} (${endpoint.model}) nach: ${failures.join(' | ')}`);
      }
      return { ok: true, content, provider: endpoint.label, model: endpoint.model };
    } catch (err) {
      failures.push(`${endpoint.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.warn(`[AI] Alle Anbieter fehlgeschlagen: ${failures.join(' | ')}`);
  return { ok: false, status: lastStatus, detail: failures.join(' | ').slice(0, 400) };
}
