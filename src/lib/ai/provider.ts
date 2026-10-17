type AiConfig = Record<string, string>;

export type AiPurpose = 'text' | 'vision';

export interface AiEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const SWISSCOM_QWEN_BASE_URL = 'https://code.myai.swisscom.ch/v1';
const SWISSCOM_QWEN_MODEL = 'qwen3.5-397b-a17b';

/**
 * Swisscom Qwen is the primary provider for text and images. OpenRouter is
 * retained separately as the image-only fallback when Swisscom rejects a
 * vision request.
 */
export function resolveAiEndpoint(config: AiConfig, purpose: AiPurpose): AiEndpoint {
  const swisscomKey = process.env.SWISSCOM_QWEN_API_KEY ?? '';
  if (swisscomKey) {
    const configuredBaseUrl = String(config.base_url ?? '');
    const configuredModel = String(config.model ?? '');
    return {
      baseUrl: configuredBaseUrl.includes('myai.swisscom.ch')
        ? configuredBaseUrl
        : SWISSCOM_QWEN_BASE_URL,
      apiKey: swisscomKey,
      model: configuredModel.startsWith('qwen') ? configuredModel : SWISSCOM_QWEN_MODEL,
    };
  }

  return resolveOpenRouterEndpoint(config, purpose);
}

export function resolveOpenRouterEndpoint(config: AiConfig, purpose: AiPurpose): AiEndpoint {
  const isVision = purpose === 'vision';
  return {
    baseUrl: String(isVision ? (config.vision_base_url ?? OPENROUTER_BASE_URL) : (config.base_url ?? OPENROUTER_BASE_URL)),
    apiKey: String((isVision ? config.vision_api_key : config.api_key) ?? process.env.OPENROUTER_API_KEY ?? ''),
    model: String(isVision ? (config.model_vision ?? 'openai/gpt-4.1-mini') : (config.model ?? 'openai/gpt-4.1-nano')),
  };
}
