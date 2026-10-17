type AiConfig = Record<string, string>;

export type AiPurpose = 'text' | 'vision';

export interface AiEndpoint {
  /** Human readable provider name, shown in settings and logs. Never contains secrets. */
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Merged into the request body (provider specific switches, e.g. thinking off). */
  extraBody?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const SWISSCOM_BASE_URL = 'https://code.myai.swisscom.ch/v1';
const SWISSCOM_PRIMARY_MODEL = 'qwen3.5-397b-a17b';
// glm-5.2 returns empty answers within a small token budget (it thinks first); the flash
// variant answers directly and also understands images.
const SWISSCOM_FALLBACK_MODEL = 'glm-5.3-flash';
const KICONNECT_BASE_URL = 'https://chat.kiconnect.nrw/api/v1';
// Qwen38.S on KI-Connect is a thinking model and returns empty content for short replies;
// Mistral Small 4 answers in well under a second, matches the reply tone and reads images.
const KICONNECT_MODEL = 'inferenz-mistral-small-4-119b';

function swisscomPrimary(config: AiConfig, apiKey: string): AiEndpoint {
  const configuredBaseUrl = String(config.base_url ?? '');
  const configuredModel = String(config.model ?? '');
  const model = configuredModel.startsWith('qwen') ? configuredModel : SWISSCOM_PRIMARY_MODEL;
  return {
    label: 'Swisscom',
    baseUrl: configuredBaseUrl.includes('myai.swisscom.ch') ? configuredBaseUrl : SWISSCOM_BASE_URL,
    apiKey,
    model,
    // Qwen spends the whole token budget on invisible reasoning unless thinking is switched
    // off, which leaves short answers (replies, category ids) empty.
    extraBody: model.startsWith('qwen') ? { chat_template_kwargs: { enable_thinking: false } } : undefined,
  };
}

function legacyEndpoint(config: AiConfig, purpose: AiPurpose): AiEndpoint {
  const isVision = purpose === 'vision';
  return {
    label: 'OpenRouter',
    baseUrl: String(isVision ? (config.vision_base_url ?? OPENROUTER_BASE_URL) : (config.base_url ?? OPENROUTER_BASE_URL)),
    apiKey: String((isVision ? config.vision_api_key : config.api_key) ?? process.env.OPENROUTER_API_KEY ?? ''),
    model: String(isVision ? (config.model_vision ?? 'openai/gpt-4.1-mini') : (config.model ?? 'openai/gpt-4.1-nano')),
    extraHeaders: {
      ...(config.referer ? { 'HTTP-Referer': String(config.referer) } : {}),
      ...(config.app_name ? { 'X-Title': String(config.app_name) } : {}),
    },
  };
}

/**
 * Ordered list of providers to try for a request. Each one is only included when its key is
 * configured on the server:
 *   1. Swisscom Qwen 3.5      (SWISSCOM_QWEN_API_KEY) - primary for text and images
 *   2. KI-Connect NRW Mistral (KICONNECT_API_KEY)     - independent provider, covers a Swisscom outage
 *   3. Swisscom GLM 5.3 Flash (SWISSCOM_QWEN_API_KEY) - covers a model-specific failure
 * Without a Swisscom key the OpenRouter-style settings from config.yaml are used as primary.
 * OpenRouter is never a fallback: its key variable may hold a key of another provider.
 */
export function resolveAiEndpoints(config: AiConfig, purpose: AiPurpose): AiEndpoint[] {
  const swisscomKey = process.env.SWISSCOM_QWEN_API_KEY ?? '';
  const kiconnectKey = process.env.KICONNECT_API_KEY ?? '';
  const endpoints: AiEndpoint[] = [];

  if (swisscomKey) {
    endpoints.push(swisscomPrimary(config, swisscomKey));
  } else {
    const legacy = legacyEndpoint(config, purpose);
    if (legacy.apiKey) endpoints.push(legacy);
  }

  if (kiconnectKey) {
    endpoints.push({
      label: 'KI-Connect NRW',
      baseUrl: KICONNECT_BASE_URL,
      apiKey: kiconnectKey,
      model: process.env.KICONNECT_MODEL || KICONNECT_MODEL,
    });
  }

  if (swisscomKey) {
    endpoints.push({
      label: 'Swisscom',
      baseUrl: SWISSCOM_BASE_URL,
      apiKey: swisscomKey,
      model: process.env.SWISSCOM_FALLBACK_MODEL || SWISSCOM_FALLBACK_MODEL,
    });
  }

  return endpoints;
}

/** First (primary) provider, or an empty-key endpoint when nothing is configured. */
export function resolveAiEndpoint(config: AiConfig, purpose: AiPurpose): AiEndpoint {
  return resolveAiEndpoints(config, purpose)[0] ?? legacyEndpoint(config, purpose);
}

/** True when the server (environment) decides the provider, so the config.yaml AI fields are ignored. */
export function isAiServerManaged(): boolean {
  return Boolean(process.env.SWISSCOM_QWEN_API_KEY);
}

/** Provider chain for display only: no keys, no URLs. */
export function describeAiProviders(config: AiConfig): Array<{ provider: string; model: string }> {
  return resolveAiEndpoints(config, 'text').map(({ label, model }) => ({ provider: label, model }));
}
