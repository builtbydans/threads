import "server-only";

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import { env, isGeminiConfigured } from "@/lib/env";

export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

let client: GoogleGenAI | null | undefined;

export const getGeminiClient = (): GoogleGenAI | null => {
  if (!isGeminiConfigured || !env.geminiApiKey) return null;
  if (client === undefined) client = new GoogleGenAI({ apiKey: env.geminiApiKey });
  return client;
};

export const getGeminiModel = () =>
  env.geminiModel ?? DEFAULT_GEMINI_MODEL;

export const getGeminiThinkingConfig = () =>
  getGeminiModel().startsWith("gemini-3")
    ? ({ thinkingLevel: ThinkingLevel.MINIMAL } as const)
    : ({ thinkingBudget: 0 } as const);
