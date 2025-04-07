// lib/googleAiClient.ts

import { GoogleGenerativeAI, GenerativeModel } from "@google/generative-ai";
import { ChatMessage } from "@/types";
import { createHash } from "crypto";
import { getCache, setCache } from "./redisClient";

/**
 * Cria um hash para usar como chave de cache para prompts
 * @param input String para gerar o hash
 */
export function createPromptHash(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Constrói um prompt estruturado para o modelo LLM
 */
export function buildPrompt(
  systemInstruction: string,
  history: ChatMessage[],
  userQuery: string,
  ragContext?: string,
): string {
  let prompt = `${systemInstruction}\n\n`;

  // Adicionar contexto RAG se disponível
  if (ragContext && ragContext.trim()) {
    prompt += `Contexto Relevante:\n${ragContext}\n\n`;
  }

  // Adicionar histórico da conversa
  if (history.length > 0) {
    prompt += "Histórico da conversa:\n";
    for (const message of history) {
      const role = message.role === "user" ? "Usuário" : "Assistente";
      prompt += `${role}: ${message.content}\n`;
    }
    prompt += "\n";
  }

  // Adicionar a consulta atual
  prompt += `Usuário: ${userQuery}\n\nAssistente: `;

  return prompt;
}

/**
 * Obtém resposta do LLM com suporte a cache
 */
export async function getLLMResponse(
  prompt: string,
  apiKey: string,
  useCaching: boolean = true,
): Promise<string> {
  try {
    // Verificar cache se habilitado
    if (useCaching) {
      const cacheKey = `llm_cache:${createPromptHash(prompt)}`;
      const cachedResponse = await getCache<string>(cacheKey);

      if (cachedResponse) {
        console.log("LLM cache hit");
        return cachedResponse;
      }
    }

    // Inicializar cliente Google AI
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
    });

    // Gerar resposta
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // Armazenar em cache se habilitado
    if (useCaching) {
      const cacheKey = `llm_cache:${createPromptHash(prompt)}`;
      await setCache(cacheKey, text, 3600 * 24); // Cache por 24 horas
    }

    return text;
  } catch (error) {
    console.error("Error getting LLM response:", error);
    throw new Error(`Falha ao obter resposta do modelo de IA: ${error}`);
  }
}
