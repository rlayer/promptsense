import type { ProviderAdapter, ProviderId } from "../types";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { mockProvider } from "./mock";
import { openAIProvider } from "./openai";

export const PROVIDERS: ProviderAdapter[] = [
  mockProvider,
  openAIProvider,
  anthropicProvider,
  geminiProvider
];

/** Finds a provider adapter by id, falling back to demo mode. */
export function getProvider(providerId: ProviderId): ProviderAdapter {
  return PROVIDERS.find((provider) => provider.id === providerId) ?? mockProvider;
}
