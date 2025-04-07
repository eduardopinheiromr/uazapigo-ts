// lib/utils.ts

import { format, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BusinessConfig,
  ConversationState,
  ChatMessage,
  Intent,
} from "@/types";
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
 * Obtém o business_id a partir do número da instância (waba_number)
 */
export async function getBusinessIdFromWabaNumber(
  wabaNumber: string,
): Promise<string | null> {
  try {
    // Verificar cache primeiro
    const cacheKey = `business_id:${wabaNumber}`;
    const cachedId = await getCache<string>(cacheKey);

    if (cachedId) {
      return cachedId;
    }

    // Buscar do banco de dados
    const { data, error } = await supabaseClient
      .from("businesses")
      .select("business_id")
      .eq("waba_number", wabaNumber)
      .single();

    if (error || !data) {
      console.error("Erro ao buscar business_id:", error);
      return null;
    }

    // Armazenar no cache
    await setCache(cacheKey, data.business_id, 3600); // 1 hora

    return data.business_id;
  } catch (error) {
    console.error("Erro em getBusinessIdFromWabaNumber:", error);
    return null;
  }
}

/**
 * Carrega a configuração de um negócio (com cache)
 */
export async function getBusinessConfig(
  businessId: string,
): Promise<BusinessConfig | null> {
  try {
    // Verificar cache primeiro
    const cacheKey = `business_config:${businessId}`;
    const cachedConfig = await getCache<BusinessConfig>(cacheKey);

    if (cachedConfig) {
      return cachedConfig;
    }

    // Buscar do banco de dados
    const { data, error } = await supabaseClient
      .from("businesses")
      .select("*")
      .eq("business_id", businessId)
      .single();

    if (error || !data) {
      console.error("Erro ao buscar configuração de negócio:", error);
      return null;
    }

    // Extrair config do JSONB
    const config = data.config || {};

    // Montar objeto de configuração
    const businessConfig: BusinessConfig = {
      business_id: data.business_id,
      name: data.name,
      waba_number: data.waba_number,
      admin_phone: data.admin_phone,
      llmApiKey: config.llmApiKey || process.env.GOOGLE_API_KEY || "",
      ragEnabled: config.ragEnabled !== undefined ? config.ragEnabled : true,
      defaultPrompt:
        config.defaultPrompt ||
        "Você é um assistente virtual amigável e prestativo.",
      maxHistoryMessages: config.maxHistoryMessages || 10,
      sessionTtlHours: config.sessionTtlHours || 2,
      businessHours: config.businessHours || {
        monday: { start: "09:00", end: "18:00" },
        tuesday: { start: "09:00", end: "18:00" },
        wednesday: { start: "09:00", end: "18:00" },
        thursday: { start: "09:00", end: "18:00" },
        friday: { start: "09:00", end: "18:00" },
        saturday: { start: "09:00", end: "13:00" },
        sunday: { start: null, end: null },
      },
      cacheSettings: {
        llmCacheTtlHours: config.cacheSettings?.llmCacheTtlHours || 24,
        configCacheTtlHours: config.cacheSettings?.configCacheTtlHours || 1,
      },
    };

    // Armazenar no cache
    const ttlSeconds = businessConfig.cacheSettings.configCacheTtlHours * 3600;
    await setCache(cacheKey, businessConfig, ttlSeconds);

    return businessConfig;
  } catch (error) {
    console.error("Erro em getBusinessConfig:", error);
    return null;
  }
}

/**
 * Verifica se um número é admin de um negócio
 */
export async function isAdmin(
  businessId: string,
  phone: string,
): Promise<boolean> {
  try {
    // Verificar cache primeiro
    const cacheKey = `is_admin:${businessId}:${phone}`;
    const cachedResult = await getCache<boolean>(cacheKey);

    if (cachedResult !== null) {
      return cachedResult;
    }

    // Chamar função RPC do Supabase
    const { data, error } = await supabaseClient.rpc("is_admin", {
      p_business_id: businessId,
      p_phone: phone,
    });

    if (error) {
      console.error("Erro ao verificar se é admin:", error);
      return false;
    }

    // Armazenar no cache
    await setCache(cacheKey, !!data, 3600); // 1 hora

    return !!data;
  } catch (error) {
    console.error("Erro em isAdmin:", error);
    return false;
  }
}

/**
 * Obtém ou cria um cliente no banco de dados
 */
export async function getOrCreateCustomer(
  businessId: string,
  phone: string,
  name?: string,
): Promise<string | null> {
  try {
    // Verificar se o cliente já existe
    const { data: existingCustomer, error: selectError } = await supabaseClient
      .from("customers")
      .select("customer_id")
      .eq("business_id", businessId)
      .eq("phone", phone)
      .single();

    if (existingCustomer) {
      return existingCustomer.customer_id;
    }

    // Se não existir, criar novo cliente
    const { data: newCustomer, error: insertError } = await supabaseClient
      .from("customers")
      .insert({
        business_id: businessId,
        phone,
        name,
        last_interaction: new Date().toISOString(),
      })
      .select("customer_id")
      .single();

    if (insertError) {
      console.error("Erro ao criar cliente:", insertError);
      return null;
    }

    return newCustomer?.customer_id || null;
  } catch (error) {
    console.error("Erro em getOrCreateCustomer:", error);
    return null;
  }
}

/**
 * Obtém a sessão de conversa atual
 */
export async function getSession(
  businessId: string,
  userPhone: string,
): Promise<ConversationState> {
  const sessionKey = `session:${businessId}:${userPhone}`;
  const cachedSession = await getCache<ConversationState>(sessionKey);

  if (cachedSession) {
    return cachedSession;
  }

  // Verificar se é admin
  const isAdminUser = await isAdmin(businessId, userPhone);

  // Se for cliente, obter ou criar o ID
  let userId: string | undefined;
  if (!isAdminUser) {
    userId = await getOrCreateCustomer(businessId, userPhone);
  }

  // Sessão inicial
  return {
    current_intent: null,
    context_data: {},
    conversation_history: [],
    last_updated: Date.now(),
    is_admin: isAdminUser,
    user_id: userId,
  };
}

/**
 * Salva a sessão de conversa
 */
export async function saveSession(
  businessId: string,
  userPhone: string,
  state: ConversationState,
  ttlHours?: number,
): Promise<void> {
  const sessionKey = `session:${businessId}:${userPhone}`;
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
export function detectIntent(message: string, isAdmin: boolean): Intent {
  const lowerMessage = message.toLowerCase();

  // Se for admin, verificar comandos de administração
  if (isAdmin) {
    // Comandos de configuração
    if (
      lowerMessage.includes("configurar") ||
      lowerMessage.includes("configuração") ||
      lowerMessage.includes("prompt") ||
      lowerMessage.includes("configurar chatbot")
    ) {
      return Intent.ADMIN_CONFIG;
    }

    // Comandos de serviços
    if (
      lowerMessage.includes("serviços") ||
      lowerMessage.includes("adicionar serviço") ||
      lowerMessage.includes("editar serviço") ||
      lowerMessage.includes("remover serviço") ||
      lowerMessage.includes("preços")
    ) {
      return Intent.ADMIN_SERVICES;
    }

    // Comandos de bloqueio de agenda
    if (
      lowerMessage.includes("bloquear agenda") ||
      lowerMessage.includes("bloqueio") ||
      lowerMessage.includes("fechar agenda") ||
      lowerMessage.includes("indisponível")
    ) {
      return Intent.ADMIN_BLOCKS;
    }

    // Comandos de horários de funcionamento
    if (
      lowerMessage.includes("horário de funcionamento") ||
      lowerMessage.includes("expediente") ||
      lowerMessage.includes("dias de funcionamento")
    ) {
      return Intent.ADMIN_BUSINESS_HOURS;
    }

    // Comandos de relatórios
    if (
      lowerMessage.includes("relatório") ||
      lowerMessage.includes("estatísticas") ||
      lowerMessage.includes("agendamentos") ||
      lowerMessage.includes("dashboard")
    ) {
      return Intent.ADMIN_REPORTS;
    }
  }

  // Intenções comuns para todos os usuários

  // Keywords para agendamento
  if (
    lowerMessage.includes("agendar") ||
    lowerMessage.includes("marcar") ||
    lowerMessage.includes("horário") ||
    lowerMessage.includes("consulta") ||
    lowerMessage.includes("reservar")
  ) {
    return Intent.START_SCHEDULING;
  }

  // Keywords para verificar agendamentos
  if (
    lowerMessage.includes("meus agendamentos") ||
    lowerMessage.includes("meus horários") ||
    lowerMessage.includes("minha agenda") ||
    lowerMessage.includes("próximo agendamento")
  ) {
    return Intent.CHECK_APPOINTMENTS;
  }

  // Keywords para cancelamento
  if (lowerMessage.includes("cancelar") || lowerMessage.includes("desmarcar")) {
    return Intent.CANCEL_APPOINTMENT;
  }

  // Keywords para reagendamento
  if (
    lowerMessage.includes("reagendar") ||
    lowerMessage.includes("remarcar") ||
    lowerMessage.includes("mudar horário") ||
    lowerMessage.includes("alterar horário")
  ) {
    return Intent.RESCHEDULE_APPOINTMENT;
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
    return Intent.FAQ;
  }

  // Default
  return Intent.GENERAL_CHAT;
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

/**
 * Registra mensagem no histórico de conversas do banco de dados
 */
export async function logConversation(
  businessId: string,
  customerId: string | null,
  sender: "customer" | "bot",
  content: string,
  intent?: string,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    await supabaseClient.from("conversation_history").insert({
      business_id: businessId,
      customer_id: customerId,
      sender,
      content,
      intent,
      metadata,
    });
  } catch (error) {
    console.error("Erro ao registrar conversa:", error);
  }
}
