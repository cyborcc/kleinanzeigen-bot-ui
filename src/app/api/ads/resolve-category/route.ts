import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { aiLimiter } from '@/lib/auth/rate-limiter';
import { readMergedConfig } from '@/lib/yaml/config';
import { resolveAiEndpoints } from '@/lib/ai/provider';
import { loadCatAttrsData } from '@/lib/ads/normalize-attributes';
import { resolveCategoryAndAttributes, type AiCallConfig } from '@/lib/ads/resolve-category-attributes';

// Quick-edit autosuggest: resolves { category, special_attributes } from an article
// using the same SoT pipeline as the AI generator, so both paths return identical results.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ detail: 'Authentication required' }, { status: 401 });
  }

  const emptyResult = { category: null, special_attributes: {} };

  try {
    const body = (await req.json()) as { title?: string; description?: string };
    const title = body.title?.trim();
    if (!title) return NextResponse.json(emptyResult);

    const catAttrsData = loadCatAttrsData();
    if (!catAttrsData) return NextResponse.json(emptyResult);

    const config = readMergedConfig(user.workspace);
    const aiConfig = (config?.ai as Record<string, string>) ?? {};
    if (resolveAiEndpoints(aiConfig, 'text').length === 0) return NextResponse.json(emptyResult);

    // Rate-limit per user — shared budget with the generator
    aiLimiter.check(user.id);

    const cfg: AiCallConfig = { aiConfig };

    const result = await resolveCategoryAndAttributes(
      { title, description: body.description ?? '' },
      catAttrsData,
      cfg,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(emptyResult);
  }
}
