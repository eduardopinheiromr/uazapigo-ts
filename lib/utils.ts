// lib/utils.ts

import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ClientConfig, ConversationState, ChatMessage } from "@/types";
import { getCache, setCache } from "./redisClient";
import supabaseClient from "./supabaseClient";

/**
 * Formata números de telefone para o formato padrão
 * ex: 5511999999999
 */
export function formatPhoneNumber(phone: string): string {
  // Remover qualquer caractere que não seja dígito
  return phone.replace(/\D/g, "");
}

/**
 * Extrai clientId da instância/waba_number
 */
export function getClientIdFromInstance(instanceName: string): string {
  // Mapeamento inicial simples
  if (instanceName === process.env.UAZAPIGO_INSTANCE_NAME_CLIENT0) {
    return "client0";
  }

  // Implementação futura: buscar no banco de dados
  return "unknown";
}

/**
 * Carrega a configuração de um cliente (com cache)
 */
export async function getClientConfig(
  clientId: string,
): Promise<ClientConfig | null> {
  try {
    // Verificar cache primeiro
    const cacheKey = `client_config:${clientId}`;
    const cachedConfig = await getCache<ClientConfig>(cacheKey);

    if (cachedConfig) {
      return cachedConfig;
    }

    // Buscar do banco de dados
    const { data, error } = await supabaseClient
      .from("clients")
      .select("*")
      .eq("client_id", clientId)
      .single();

    if (error || !data) {
      // Se for client0, usar configuração padrão
      if (clientId === "client0") {
        const defaultConfig: ClientConfig = {
          client_id: "client0",
          name: "Cliente Teste",
          waba_number: process.env.UAZAPIGO_INSTANCE_NAME_CLIENT0 || "",
          llmApiKey: process.env.GOOGLE_API_KEY || "",
          ragEnabled: true,
          defaultPrompt: "Você é um assistente virtual amigável e prestativo.",
          maxHistoryMessages: 10,
          sessionTtlHours: 2,
          cacheSettings: {
            llmCacheTtlHours: 24,
            configCacheTtlHours: 1,
          },
        };

        // Armazenar no cache
        await setCache(cacheKey, defaultConfig, 3600); // 1 hora

        return defaultConfig;
      }

      console.error("Error fetching client config:", error);
      return null;
    }

    // Extrair config do JSONB
    const config = data.config || {};

    // Montar objeto de configuração
    const clientConfig: ClientConfig = {
      client_id: data.client_id,
      name: data.name,
      waba_number: data.waba_number,
      llmApiKey: config.llmApiKey || process.env.GOOGLE_API_KEY || "",
      ragEnabled: config.ragEnabled !== undefined ? config.ragEnabled : true,
      defaultPrompt:
        config.defaultPrompt ||
        "Você é um assistente virtual amigável e prestativo.",
      maxHistoryMessages: config.maxHistoryMessages || 10,
      sessionTtlHours: config.sessionTtlHours || 2,
      cacheSettings: {
        llmCacheTtlHours: config.llmCacheTtlHours || 24,
        configCacheTtlHours: config.configCacheTtlHours || 1,
      },
    };

    // Armazenar no cache
    const ttlSeconds = clientConfig.cacheSettings.configCacheTtlHours * 3600;
    await setCache(cacheKey, clientConfig, ttlSeconds);

    return clientConfig;
  } catch (error) {
    console.error("Error in getClientConfig:", error);
    return null;
  }
}

/**
 * Obtém a sessão de conversa atual
 */
export async function getSession(
  clientId: string,
  userPhone: string,
): Promise<ConversationState> {
  const sessionKey = `session:${clientId}:${userPhone}`;
  const cachedSession = await getCache<ConversationState>(sessionKey);

  if (cachedSession) {
    return cachedSession;
  }

  // Sessão inicial
  return {
    current_intent: null,
    context_data: {},
    conversation_history: [],
    last_updated: Date.now(),
  };
}

/**
 * Salva a sessão de conversa
 */
export async function saveSession(
  clientId: string,
  userPhone: string,
  state: ConversationState,
  ttlHours?: number,
): Promise<void> {
  const sessionKey = `session:${clientId}:${userPhone}`;
  const ttlSeconds = ttlHours ? ttlHours * 3600 : 7200; // Padrão: 2 horas

  // Atualizar timestamp
  state.last_updated = Date.now();

  await setCache(sessionKey, state, ttlSeconds);
}

/**
 * Adiciona uma mensagem ao histórico da conversa
 */
export function addMessageToHistory(
  state: ConversationState,
  role: "user" | "bot",
  content: string,
  maxMessages: number = 10,
): ConversationState {
  const newState = { ...state };

  // Adicionar nova mensagem
  newState.conversation_history.push({
    role,
    content,
    timestamp: Date.now(),
  });

  // Limitar o tamanho do histórico
  if (newState.conversation_history.length > maxMessages) {
    newState.conversation_history = newState.conversation_history.slice(
      -maxMessages,
    );
  }

  return newState;
}

/**
 * Detecta intenção a partir do texto da mensagem
 * Implementação simples baseada em palavras-chave
 */
export function detectIntent(message: string): string {
  const lowerMessage = message.toLowerCase();

  // Keywords para agendamento
  if (
    lowerMessage.includes("agendar") ||
    lowerMessage.includes("marcar") ||
    lowerMessage.includes("horário") ||
    lowerMessage.includes("consulta") ||
    lowerMessage.includes("reservar")
  ) {
    return "start_scheduling";
  }

  // Keywords para FAQ/informações
  if (
    lowerMessage.includes("preço") ||
    lowerMessage.includes("quanto custa") ||
    lowerMessage.includes("valor") ||
    lowerMessage.includes("informação") ||
    lowerMessage.includes("dúvida") ||
    lowerMessage.includes("como funciona")
  ) {
    return "faq";
  }

  // Keywords para cancelamento
  if (lowerMessage.includes("cancelar") || lowerMessage.includes("desmarcar")) {
    return "cancel_appointment";
  }

  // Default
  return "general_chat";
}

/**
 * Extrai data de uma string usando processamento simples
 */
export function extractDate(message: string): Date | null {
  // Implementação simples para detectar datas em formato comum no Brasil

  // Regex para formatos comuns de data (DD/MM/YYYY, DD-MM-YYYY, etc.)
  const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/g;
  const match = dateRegex.exec(message);

  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3]
      ? match[3].length === 2
        ? `20${match[3]}`
        : match[3]
      : new Date().getFullYear().toString();

    const dateStr = `${year}-${month}-${day}`;
    const date = new Date(dateStr);

    if (isValid(date)) {
      return date;
    }
  }

  // Tentar processar palavras como "hoje", "amanhã", etc.
  const lowerMessage = message.toLowerCase();
  const today = new Date();

  if (lowerMessage.includes("hoje")) {
    return today;
  }

  if (lowerMessage.includes("amanhã")) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow;
  }

  if (lowerMessage.includes("depois de amanhã")) {
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);
    return dayAfterTomorrow;
  }

  // Dias da semana
  const weekdayMap: Record<string, number> = {
    domingo: 0,
    segunda: 1,
    terça: 2,
    quarta: 3,
    quinta: 4,
    sexta: 5,
    sábado: 6,
  };

  for (const [weekday, dayIndex] of Object.entries(weekdayMap)) {
    if (lowerMessage.includes(weekday)) {
      const targetDate = new Date(today);
      const currentDay = today.getDay();
      let daysToAdd = dayIndex - currentDay;

      // Se o dia já passou nesta semana, ir para a próxima
      if (daysToAdd <= 0) {
        daysToAdd += 7;
      }

      targetDate.setDate(today.getDate() + daysToAdd);
      return targetDate;
    }
  }

  return null;
}

/**
 * Extrai hora de uma string usando processamento simples
 */
export function extractTime(message: string): string | null {
  // Regex para formatos comuns de hora (HH:MM, HHh, etc.)
  const timeRegex = /(\d{1,2})(?::|\s*h\s*)(\d{0,2})/i;
  const match = timeRegex.exec(message);

  if (match) {
    const hour = match[1].padStart(2, "0");
    const minute = match[2] ? match[2].padStart(2, "0") : "00";

    return `${hour}:${minute}`;
  }

  return null;
}

/**
 * Formata data para exibição
 */
export function formatDate(date: Date): string {
  return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
}
