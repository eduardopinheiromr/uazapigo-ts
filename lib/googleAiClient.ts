// lib/googleAiClient.ts

import {
  GoogleGenerativeAI,
  GenerativeModel,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";
import { ChatMessage, BusinessConfig } from "@/types";
import { createHash } from "crypto";
import { getCache, setCache } from "./redisClient";
import logger from "./logger";

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
  businessConfig: BusinessConfig,
  ragContext?: string,
): string {
  // Obter data e hora atual formatadas
  const currentDate = new Date();
  const formattedDateTime = currentDate.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "long",
  });

  let prompt = `${systemInstruction}\n\n`;

  // Adicionar contexto temporal claro
  prompt += `Data e hora atual: ${formattedDateTime}\n\n`;

  // Adicionar limitações claras para evitar alucinações
  prompt += `IMPORTANTE - SUAS LIMITAÇÕES:
Você é apenas um assistente de atendimento para ${businessConfig.name}.

Você PODE:
- Responder perguntas sobre os serviços disponíveis
- Fornecer informações sobre horários de funcionamento
- Auxiliar com agendamentos, reagendamentos e cancelamentos
- Responder dúvidas sobre a ${businessConfig.name}

Você NÃO PODE e NÃO DEVE:
- Gerenciar estoque (você não tem essa funcionalidade)
- Processar pagamentos online
- Modificar preços ou criar novos serviços
- Acessar informações que não foram explicitamente compartilhadas
- Fingir ter funcionalidades que não existem

Responda apenas sobre o que tem certeza, diga "não sei" quando necessário.
\n\n`;

  // Adicionar informações sobre horários de funcionamento
  prompt += `Horários de funcionamento:\n`;
  prompt += `- Segunda-feira: ${formatBusinessHours(businessConfig.businessHours.monday)}\n`;
  prompt += `- Terça-feira: ${formatBusinessHours(businessConfig.businessHours.tuesday)}\n`;
  prompt += `- Quarta-feira: ${formatBusinessHours(businessConfig.businessHours.wednesday)}\n`;
  prompt += `- Quinta-feira: ${formatBusinessHours(businessConfig.businessHours.thursday)}\n`;
  prompt += `- Sexta-feira: ${formatBusinessHours(businessConfig.businessHours.friday)}\n`;
  prompt += `- Sábado: ${formatBusinessHours(businessConfig.businessHours.saturday)}\n`;
  prompt += `- Domingo: ${formatBusinessHours(businessConfig.businessHours.sunday)}\n\n`;

  // Adicionar contexto RAG se disponível
  if (ragContext && ragContext.trim()) {
    prompt += `Contexto Relevante para sua resposta:\n${ragContext}\n\n`;
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
 * Formata as horas de funcionamento para exibição
 */
function formatBusinessHours(dayHours: {
  start: string | null;
  end: string | null;
}): string {
  if (!dayHours.start || !dayHours.end) {
    return "Fechado";
  }
  return `${dayHours.start} às ${dayHours.end}`;
}

/**
 * Obtém resposta do LLM com suporte a cache
 */
export async function getLLMResponse(
  prompt: string,
  apiKey: string,
  businessId: string,
  useCaching: boolean = true,
  cacheHours: number = 24,
): Promise<string> {
  try {
    // Criar hash para o prompt
    const promptHash = createPromptHash(prompt);

    // Verificar cache se habilitado
    if (useCaching) {
      const cacheKey = `llm_cache:${businessId}:${promptHash}`;
      const cachedResponse = await getCache<string>(cacheKey);

      if (cachedResponse) {
        logger.info("LLM cache hit", {
          businessId,
          promptLength: prompt.length,
          promptFirstChars: prompt.substring(0, 50),
        });
        return cachedResponse;
      }
    }

    // Registrar a chamada à API
    logger.info("Calling LLM API", {
      businessId,
      promptLength: prompt.length,
      modelName: "gemini-1.5-flash-latest",
    });

    // Inicializar cliente Google AI
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        },
      ],
    });

    // Configurar timeout para a chamada
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("LLM request timeout")), 15000); // 15 segundos
    });

    // Gerar resposta com timeout
    const responsePromise = model.generateContent(prompt);
    const result = (await Promise.race([
      responsePromise,
      timeoutPromise,
    ])) as any;

    const response = result.response;
    const text = response.text();

    // Registrar resposta obtida
    logger.info("LLM response received", {
      businessId,
      responseLength: text.length,
      responseFirstChars: text.substring(0, 50),
    });

    // Verificar se a resposta não está vazia
    if (!text || text.trim() === "") {
      throw new Error("Empty response from LLM");
    }

    // Armazenar em cache se habilitado
    if (useCaching) {
      const cacheKey = `llm_cache:${businessId}:${promptHash}`;
      await setCache(cacheKey, text, cacheHours * 3600); // Cache por horas configuráveis
      logger.debug("Response stored in cache", {
        businessId,
        cacheKey,
        cacheHours,
      });
    }

    return text;
  } catch (error) {
    logger.error("Error getting LLM response", {
      businessId,
      error: error instanceof Error ? error.message : String(error),
      promptExcerpt: prompt.substring(0, 100) + "...",
    });

    // Resposta de fallback em caso de erro
    return "Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes ou entre em contato diretamente pelo telefone da empresa.";
  }
}

/**
 * Extrai e limpa uma entidade específica do texto da resposta do LLM
 *
 * @param text Texto da resposta do LLM
 * @param entityType Tipo de entidade a ser extraída
 * @returns Entidade extraída ou null
 */
export function extractEntityFromLLM(
  text: string,
  entityType: "date" | "time" | "service" | "confirmation",
): string | null {
  try {
    // Textos de busca para diferentes entidades
    const searchTexts: Record<string, string[]> = {
      date: [
        "data selecionada",
        "data escolhida",
        "data para",
        "agendamento para o dia",
      ],
      time: ["horário selecionado", "horário escolhido", "às", "horário para"],
      service: [
        "serviço selecionado",
        "serviço escolhido",
        "optou por",
        "serviço:",
      ],
      confirmation: [
        "confirmado",
        "agendamento realizado",
        "reservado com sucesso",
      ],
    };

    // Expressões regulares para extrair diferentes tipos de entidades
    const patterns: Record<string, RegExp> = {
      date: /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.]?(\d{2,4})?/,
      time: /(\d{1,2})[:\.](\d{2})(\s*(?:h|hrs|horas))?/i,
      service: /(corte|barba|corte\s*\+\s*barba)/i,
      confirmation: /(sim|confirmado|confirmar|concordo)/i,
    };

    const searches = searchTexts[entityType];
    const pattern = patterns[entityType];

    // Buscar a entidade no texto
    for (const search of searches) {
      const index = text.toLowerCase().indexOf(search.toLowerCase());
      if (index >= 0) {
        // Extrair o contexto ao redor do termo encontrado
        const context = text.substring(index, index + 100);
        const match = context.match(pattern);
        if (match && match[0]) {
          return match[0].trim();
        }
      }
    }

    // Buscar em todo o texto se não encontrou nos contextos específicos
    const match = text.match(pattern);
    return match && match[0] ? match[0].trim() : null;
  } catch (error) {
    logger.error("Error extracting entity from LLM", {
      entityType,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
