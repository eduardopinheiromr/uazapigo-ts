// lib/utils.ts

import { format, isValid, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BusinessConfig,
  ConversationState,
  DayHours,
  BusinessHours,
} from "@/types";
import { getCache, setCache, deleteCache } from "./redisClient";
import supabaseClient from "./supabaseClient";
import logger from "./logger";

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
      logger.debug("Business ID found in cache", {
        wabaNumber,
        businessId: cachedId,
      });
      return cachedId;
    }

    // Buscar do banco de dados
    const { data, error } = await supabaseClient
      .from("businesses")
      .select("business_id")
      .eq("waba_number", wabaNumber)
      .single();

    if (error || !data) {
      logger.error("Error fetching business_id", {
        error: error?.message,
        wabaNumber,
      });
      return null;
    }

    // Armazenar no cache
    await setCache(cacheKey, data.business_id, 3600); // 1 hora
    logger.debug("Business ID stored in cache", {
      wabaNumber,
      businessId: data.business_id,
    });

    return data.business_id;
  } catch (error) {
    logger.error("Error in getBusinessIdFromWabaNumber", {
      error: error instanceof Error ? error.message : String(error),
      wabaNumber,
    });
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
      logger.debug("Business config found in cache", { businessId });
      return cachedConfig;
    }

    // Buscar do banco de dados
    const { data, error } = await supabaseClient
      .from("businesses")
      .select("*")
      .eq("business_id", businessId)
      .single();

    if (error || !data) {
      logger.error("Error fetching business config", {
        error: error?.message,
        businessId,
      });
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
    logger.debug("Business config stored in cache", { businessId, ttlSeconds });

    return businessConfig;
  } catch (error) {
    logger.error("Error in getBusinessConfig", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });
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
      logger.debug("Admin check found in cache", {
        businessId,
        phone,
        isAdmin: cachedResult,
      });
      return cachedResult;
    }

    // Verificar se é o admin principal
    const { data: business, error: businessError } = await supabaseClient
      .from("businesses")
      .select("admin_phone")
      .eq("business_id", businessId)
      .single();

    if (!businessError && business && business.admin_phone === phone) {
      // É o admin principal
      await setCache(cacheKey, true, 3600); // 1 hora
      logger.debug("User identified as root admin", { businessId, phone });
      return true;
    }

    // Verificar se é admin adicional
    const { data: admin, error: adminError } = await supabaseClient
      .from("admins")
      .select("admin_id")
      .eq("business_id", businessId)
      .eq("phone", phone)
      .single();

    // Armazenar resultado no cache
    const isAdminUser = !adminError && admin !== null;
    await setCache(cacheKey, isAdminUser, 3600); // 1 hora

    logger.debug("Admin check completed", {
      businessId,
      phone,
      isAdmin: isAdminUser,
    });
    return isAdminUser;
  } catch (error) {
    logger.error("Error in isAdmin", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });
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
      .select("customer_id, name")
      .eq("business_id", businessId)
      .eq("phone", phone)
      .single();

    if (existingCustomer) {
      logger.debug("Existing customer found", {
        businessId,
        phone,
        customerId: existingCustomer.customer_id,
      });

      // Atualizar o nome se fornecido e diferente do existente
      if (name && name !== existingCustomer.name) {
        await supabaseClient
          .from("customers")
          .update({
            name,
            last_interaction: new Date().toISOString(),
          })
          .eq("customer_id", existingCustomer.customer_id);

        logger.debug("Customer name updated", {
          businessId,
          phone,
          customerId: existingCustomer.customer_id,
          oldName: existingCustomer.name,
          newName: name,
        });
      } else {
        // Apenas atualizar o timestamp de última interação
        await supabaseClient
          .from("customers")
          .update({ last_interaction: new Date().toISOString() })
          .eq("customer_id", existingCustomer.customer_id);
      }

      return existingCustomer.customer_id;
    }

    // Se não existir, criar novo cliente
    const customerId = crypto.randomUUID();

    const { error: insertError } = await supabaseClient
      .from("customers")
      .insert({
        customer_id: customerId,
        business_id: businessId,
        phone,
        name: name || `Cliente ${phone.slice(-4)}`,
        last_interaction: new Date().toISOString(),
        is_blocked: false,
        tags: [],
      });

    if (insertError) {
      logger.error("Error creating customer", {
        error: insertError.message,
        businessId,
        phone,
      });
      return null;
    }

    logger.info("New customer created", {
      businessId,
      phone,
      customerId,
    });

    return customerId;
  } catch (error) {
    logger.error("Error in getOrCreateCustomer", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });
    return null;
  }
}

/**
 * Obtém a sessão de conversa atual
 */
// export async function getSession(
//   businessId: string,
//   userPhone: string,
// ): Promise<ConversationState> {
//   try {
//     const sessionKey = `session:${businessId}:${userPhone}`;
//     const cachedSession = await getCache<ConversationState>(sessionKey);

//     if (cachedSession) {
//       // Garantir que conversation_history seja um array
//       if (!Array.isArray(cachedSession.conversation_history)) {
//         cachedSession.conversation_history = [];
//       }
//       logger.debug("Session found in cache", { businessId, userPhone });
//       return cachedSession;
//     }

//     // Verificar se é admin
//     const isAdminUser = await isAdmin(businessId, userPhone);

//     // Se for cliente, obter ou criar o ID
//     let userId: string | undefined;
//     if (!isAdminUser) {
//       userId = await getOrCreateCustomer(businessId, userPhone);
//     }

//     // Sessão inicial
//     const newSession: ConversationState = {
//       current_intent: null,
//       context_data: {},
//       conversation_history: [], // Garantir que é inicializado como array vazio
//       last_updated: Date.now(),
//       is_admin: isAdminUser,
//       user_id: userId,
//     };

//     logger.info("New session created", {
//       businessId,
//       userPhone,
//       isAdmin: isAdminUser,
//     });
//     return newSession;
//   } catch (error) {
//     logger.error("Error in getSession", {
//       error: error instanceof Error ? error.message : String(error),
//       businessId,
//       userPhone,
//     });

//     // Retornar uma sessão padrão em caso de erro
//     return {
//       current_intent: null,
//       context_data: {},
//       conversation_history: [], // Garantir que é inicializado como array vazio
//       last_updated: Date.now(),
//       is_admin: false,
//     };
//   }
// }

/**
 * Salva a sessão de conversa
 */
// export async function saveSession(
//   businessId: string,
//   userPhone: string,
//   state: ConversationState,
//   ttlHours?: number,
// ): Promise<void> {
//   try {
//     const sessionKey = `session:${businessId}:${userPhone}`;
//     const ttlSeconds = ttlHours ? ttlHours * 3600 : 7200; // Padrão: 2 horas

//     // Atualizar timestamp
//     state.last_updated = Date.now();

//     // Garantir que conversation_history é um array antes de salvar
//     if (!Array.isArray(state.conversation_history)) {
//       state.conversation_history = [];
//     }

//     await setCache(sessionKey, state, ttlSeconds);
//     logger.debug("Session saved to cache", { businessId, userPhone, ttlHours });
//   } catch (error) {
//     logger.error("Error in saveSession", {
//       error: error instanceof Error ? error.message : String(error),
//       businessId,
//       userPhone,
//     });
//   }
// }

/**
 * Adiciona uma mensagem ao histórico da conversa
 * Corrigido para garantir que conversation_history é sempre um array
 */
// export function addMessageToHistory(
//   state: ConversationState,
//   role: "user" | "bot",
//   content: string,
//   maxMessages: number = 10,
// ): ConversationState {
//   try {
//     const newState = { ...state };

//     // Garantir que conversation_history é um array
//     if (!Array.isArray(newState.conversation_history)) {
//       logger.warn("conversation_history não é um array, inicializando", {
//         businessId: newState.business_id,
//         isAdmin: newState.is_admin,
//       });
//       newState.conversation_history = [];
//     }

//     // Adicionar nova mensagem
//     newState.conversation_history.push({
//       role,
//       content,
//       timestamp: Date.now(),
//     });

//     // Limitar o tamanho do histórico
//     if (newState.conversation_history.length > maxMessages) {
//       newState.conversation_history = newState.conversation_history.slice(
//         -maxMessages,
//       );
//     }

//     return newState;
//   } catch (error) {
//     logger.error("Error in addMessageToHistory", {
//       error: error instanceof Error ? error.message : String(error),
//       stateType: typeof state,
//       hasConversationHistory: state && "conversation_history" in state,
//     });

//     // Em caso de erro, retornar um estado com array vazio
//     return {
//       ...state,
//       conversation_history: [
//         {
//           role,
//           content,
//           timestamp: Date.now(),
//         },
//       ],
//     };
//   }
// }

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
    const { error } = await supabaseClient.from("conversation_history").insert({
      business_id: businessId,
      customer_id: customerId,
      sender,
      content,
      intent,
      metadata,
    });

    if (error) {
      logger.error("Error logging conversation to database", {
        error: error.message,
        businessId,
        customerId,
      });
    } else {
      logger.debug("Conversation logged to database", {
        businessId,
        customerId,
        sender,
        intent,
      });
    }
  } catch (error) {
    logger.error("Error in logConversation", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerId,
    });
  }
}

/**
 * Extrai data de uma string usando processamento simples
 */
// export function extractDate(message: string): Date | null {
//   try {
//     // Implementação simples para detectar datas em formato comum no Brasil
//     // Regex para formatos comuns de data (DD/MM/YYYY, DD-MM-YYYY, etc.)
//     const dateRegex = /(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/g;
//     const match = dateRegex.exec(message);

//     if (match) {
//       const day = match[1].padStart(2, "0");
//       const month = match[2].padStart(2, "0");
//       const year = match[3]
//         ? match[3].length === 2
//           ? `20${match[3]}`
//           : match[3]
//         : new Date().getFullYear().toString();

//       const dateStr = `${year}-${month}-${day}`;
//       const date = new Date(dateStr);

//       if (isValid(date)) {
//         return date;
//       }
//     }

//     // Tentar processar palavras como "hoje", "amanhã", etc.
//     const lowerMessage = message.toLowerCase();
//     const today = new Date();

//     if (lowerMessage.includes("hoje")) {
//       return today;
//     }

//     if (lowerMessage.includes("amanhã") || lowerMessage.includes("amanha")) {
//       return addDays(today, 1);
//     }

//     if (
//       lowerMessage.includes("depois de amanhã") ||
//       lowerMessage.includes("depois de amanha")
//     ) {
//       return addDays(today, 2);
//     }

//     // Dias da semana
//     const weekdayMap: Record<string, number> = {
//       domingo: 0,
//       segunda: 1,
//       terça: 2,
//       terca: 2,
//       quarta: 3,
//       quinta: 4,
//       sexta: 5,
//       sábado: 6,
//       sabado: 6,
//     };

//     for (const [weekday, dayIndex] of Object.entries(weekdayMap)) {
//       if (lowerMessage.includes(weekday)) {
//         const targetDate = new Date(today);
//         const currentDay = today.getDay();
//         let daysToAdd = dayIndex - currentDay;

//         // Se o dia já passou nesta semana, ir para a próxima
//         if (daysToAdd <= 0) {
//           daysToAdd += 7;
//         }

//         targetDate.setDate(today.getDate() + daysToAdd);
//         return targetDate;
//       }
//     }

//     return null;
//   } catch (error) {
//     logger.error("Error extracting date", {
//       error: error instanceof Error ? error.message : String(error),
//       message,
//     });
//     return null;
//   }
// }

/**
 * Extrai hora de uma string usando processamento simples
 */
// export function extractTime(message: string): string | null {
//   try {
//     // Regex para formatos comuns de hora (HH:MM, HHh, etc.)
//     const timeRegex = /(\d{1,2})(?::|\s*h\s*)(\d{0,2})/i;
//     const match = timeRegex.exec(message);

//     if (match) {
//       const hour = match[1].padStart(2, "0");
//       const minute = match[2] ? match[2].padStart(2, "0") : "00";

//       return `${hour}:${minute}`;
//     }

//     return null;
//   } catch (error) {
//     logger.error("Error extracting time", {
//       error: error instanceof Error ? error.message : String(error),
//       message,
//     });
//     return null;
//   }
// }

/**
 * Formata data para exibição
 */
export function formatDate(date: Date): string {
  try {
    return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });
  } catch (error) {
    logger.error("Error formatting date", {
      error: error instanceof Error ? error.message : String(error),
      date: date.toISOString(),
    });
    return date.toLocaleDateString("pt-BR");
  }
}

/**
 * Verifica se um negócio está aberto no horário e dia especificado
 */
export function isBusinessOpen(
  businessHours: BusinessHours,
  date: Date = new Date(),
): boolean {
  try {
    // Obter o dia da semana (0 = domingo, 1 = segunda, ..., 6 = sábado)
    const dayOfWeek = date.getDay();

    // Mapear para o formato dos dias de negócio
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];

    const dayKey = days[dayOfWeek] as keyof BusinessHours;
    const dayHours = businessHours[dayKey];

    // Se não houver horário de início ou fim, está fechado
    if (!dayHours.start || !dayHours.end) {
      return false;
    }

    // Comparar o horário atual com os horários de funcionamento
    const currentHour = date.getHours();
    const currentMinute = date.getMinutes();

    // Converter horários de funcionamento para minutos desde meia-noite
    const [startHour, startMinute] = dayHours.start.split(":").map(Number);
    const [endHour, endMinute] = dayHours.end.split(":").map(Number);

    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;

    // Verificar se o horário atual está dentro do horário de funcionamento
    return (
      currentTimeInMinutes >= startTimeInMinutes &&
      currentTimeInMinutes < endTimeInMinutes
    );
  } catch (error) {
    logger.error("Error checking if business is open", {
      error: error instanceof Error ? error.message : String(error),
    });
    return true; // Em caso de erro, assumir que está aberto
  }
}

/**
 * Formata horário de funcionamento para exibição
 */
export function formatBusinessHours(dayHours: DayHours): string {
  try {
    if (!dayHours.start || !dayHours.end) {
      return "Fechado";
    }
    return `${dayHours.start} às ${dayHours.end}`;
  } catch (error) {
    logger.error("Error formatting business hours", {
      error: error instanceof Error ? error.message : String(error),
    });
    return "Horário não disponível";
  }
}

/**
 * Obtém o dia da semana em português
 */
export function getDayOfWeekInPortuguese(date: Date): string {
  try {
    return format(date, "EEEE", { locale: ptBR });
  } catch (error) {
    logger.error("Error getting day of week in Portuguese", {
      error: error instanceof Error ? error.message : String(error),
      date: date.toISOString(),
    });

    // Fallback simples
    const days = [
      "Domingo",
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
    ];
    return days[date.getDay()];
  }
}

/**
 * Obtém próximos N dias úteis a partir de uma data
 */
export function getNextBusinessDays(
  startDate: Date,
  daysToReturn: number,
  businessHours: BusinessHours,
): Date[] {
  try {
    const businessDays: Date[] = [];
    let currentDate = new Date(startDate);
    currentDate.setHours(0, 0, 0, 0); // Normalizar para início do dia

    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];

    while (businessDays.length < daysToReturn) {
      const dayOfWeek = currentDate.getDay();
      const dayKey = days[dayOfWeek] as keyof BusinessHours;
      const dayHours = businessHours[dayKey];

      // Se o dia tem horário de funcionamento, adicionar à lista
      if (dayHours.start && dayHours.end) {
        businessDays.push(new Date(currentDate));
      }

      // Avançar para o próximo dia
      currentDate = addDays(currentDate, 1);
    }

    return businessDays;
  } catch (error) {
    logger.error("Error getting next business days", {
      error: error instanceof Error ? error.message : String(error),
      startDate: startDate.toISOString(),
      daysToReturn,
    });

    // Fallback: retornar os próximos N dias consecutivos
    const days: Date[] = [];
    let currentDate = new Date(startDate);

    for (let i = 0; i < daysToReturn; i++) {
      days.push(new Date(currentDate));
      currentDate = addDays(currentDate, 1);
    }

    return days;
  }
}

/**
 * Retorna um número formatado como moeda brasileira
 */
export function formatCurrency(value: number): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  } catch (error) {
    logger.error("Error formatting currency", {
      error: error instanceof Error ? error.message : String(error),
      value,
    });
    return `R$ ${value.toFixed(2)}`;
  }
}

/**
 * Sanitiza texto removendo caracteres especiais
 */
export function sanitizeText(text: string): string {
  try {
    // Remover caracteres especiais, manter apenas letras, números, pontuação básica e espaços
    return text.replace(/[^\w\s.,?!;:-]/g, "");
  } catch (error) {
    logger.error("Error sanitizing text", {
      error: error instanceof Error ? error.message : String(error),
    });
    return text;
  }
}

/**
 * Trunca texto para um comprimento máximo
 */
export function truncateText(text: string, maxLength: number = 500): string {
  try {
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength) + "...";
  } catch (error) {
    logger.error("Error truncating text", {
      error: error instanceof Error ? error.message : String(error),
      maxLength,
    });
    return text;
  }
}

// Melhorias no gerenciamento de sessão em utils.ts

/**
 * Obtém a sessão de conversa atual com melhor validação e recuperação
 * @param businessId ID do negócio
 * @param userPhone Telefone do usuário
 */
export async function getSession(
  businessId: string,
  userPhone: string,
): Promise<ConversationState> {
  try {
    if (!businessId || !userPhone) {
      logger.error("Invalid parameters for getSession", {
        businessId: businessId || "undefined",
        userPhone: userPhone || "undefined",
      });
      return createNewSession(businessId, userPhone);
    }

    const sessionKey = `session:${businessId}:${userPhone}`;
    const cachedSession = await getCache<ConversationState>(sessionKey);

    if (cachedSession) {
      // Validar a estrutura do estado da sessão
      const validatedSession = validateSession(cachedSession);
      logger.debug("Session found in cache", {
        businessId,
        userPhone,
        hasHistory:
          Array.isArray(validatedSession.conversation_history) &&
          validatedSession.conversation_history.length > 0,
        hasContext:
          !!validatedSession.context_data &&
          Object.keys(validatedSession.context_data).length > 0,
        intent: validatedSession.current_intent,
      });
      return validatedSession;
    }

    logger.info("No session found, creating new session", {
      businessId,
      userPhone,
    });
    return await createNewSession(businessId, userPhone);
  } catch (error) {
    logger.error("Error in getSession", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      businessId,
      userPhone,
    });

    // Retornar uma sessão padrão em caso de erro
    return createEmptySession();
  }
}

/**
 * Cria uma nova sessão para o usuário
 * Função separada para melhor modularização
 */
async function createNewSession(
  businessId: string,
  userPhone: string,
): Promise<ConversationState> {
  try {
    // Verificar se é admin
    const isAdminUser = await isAdmin(businessId, userPhone);

    // Se for cliente, obter ou criar o ID
    let userId: string | undefined;
    if (!isAdminUser) {
      userId = await getOrCreateCustomer(businessId, userPhone);
    }

    // Sessão inicial
    const newSession: ConversationState = {
      business_id: businessId,
      current_intent: null,
      context_data: {},
      conversation_history: [], // Garantir que é inicializado como array vazio
      last_updated: Date.now(),
      is_admin: isAdminUser,
      user_id: userId,
    };

    // Salvar a nova sessão imediatamente
    const ttlHours = 2; // Default TTL
    await saveSession(businessId, userPhone, newSession, ttlHours);

    logger.info("New session created", {
      businessId,
      userPhone,
      isAdmin: isAdminUser,
      userId: userId || "none",
    });

    return newSession;
  } catch (error) {
    logger.error("Error creating new session", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    return createEmptySession();
  }
}

/**
 * Cria uma sessão vazia em caso de erro
 */
function createEmptySession(): ConversationState {
  return {
    current_intent: null,
    context_data: {},
    conversation_history: [],
    last_updated: Date.now(),
    is_admin: false,
  };
}

/**
 * Valida e corrige problemas comuns na estrutura da sessão
 * @param session Sessão a ser validada
 */
function validateSession(session: ConversationState): ConversationState {
  // Clonar a sessão para evitar mutações indesejadas
  const validatedSession = { ...session };

  // Garantir que conversation_history é um array
  if (!Array.isArray(validatedSession.conversation_history)) {
    logger.warn("conversation_history não é um array, inicializando", {
      businessId: validatedSession.business_id,
      isAdmin: validatedSession.is_admin,
    });
    validatedSession.conversation_history = [];
  }

  // Garantir que context_data existe
  if (!validatedSession.context_data) {
    validatedSession.context_data = {};
  }

  // Verificar e restaurar context_data se parece estar corrompido
  if (typeof validatedSession.context_data !== "object") {
    logger.warn("context_data corrompido, redefinindo", {
      businessId: validatedSession.business_id,
      contextType: typeof validatedSession.context_data,
    });
    validatedSession.context_data = {};
  }

  // Verificar intenção atual
  if (
    validatedSession.current_intent &&
    typeof validatedSession.current_intent !== "string"
  ) {
    logger.warn("current_intent inválido, redefinindo", {
      businessId: validatedSession.business_id,
      intentType: typeof validatedSession.current_intent,
    });
    validatedSession.current_intent = null;
  }

  // Verificar timestamp
  if (
    !validatedSession.last_updated ||
    typeof validatedSession.last_updated !== "number"
  ) {
    validatedSession.last_updated = Date.now();
  }

  return validatedSession;
}

/**
 * Salva a sessão de conversa com validação reforçada
 */
export async function saveSession(
  businessId: string,
  userPhone: string,
  state: ConversationState,
  ttlHours?: number,
): Promise<void> {
  try {
    if (!businessId || !userPhone || !state) {
      logger.error("Invalid parameters for saveSession", {
        hasBusiness: !!businessId,
        hasPhone: !!userPhone,
        hasState: !!state,
      });
      return;
    }

    const sessionKey = `session:${businessId}:${userPhone}`;
    const ttlSeconds = ttlHours ? ttlHours * 3600 : 7200; // Padrão: 2 horas

    // Atualizar timestamp
    state.last_updated = Date.now();

    // Garantir business_id está definido na sessão
    if (!state.business_id) {
      state.business_id = businessId;
    }

    // Garantir que conversation_history é um array antes de salvar
    if (!Array.isArray(state.conversation_history)) {
      state.conversation_history = [];
    }

    // Validar e limpar o estado
    const validatedState = validateSession(state);

    logger.debug("Saving session to cache", {
      businessId,
      userPhone,
      ttlHours,
      intent: validatedState.current_intent,
      historyLength: validatedState.conversation_history.length,
      contextKeys: Object.keys(validatedState.context_data),
    });

    await setCache(sessionKey, validatedState, ttlSeconds);
  } catch (error) {
    logger.error("Error in saveSession", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      businessId,
      userPhone,
    });

    // Tentar salvar uma versão simplificada se a sessão completa falhar
    try {
      const sessionKey = `session:${businessId}:${userPhone}`;
      const simplifiedState = {
        current_intent: state?.current_intent || null,
        context_data: {},
        conversation_history: [],
        last_updated: Date.now(),
        is_admin: state?.is_admin || false,
        user_id: state?.user_id,
      };

      await setCache(sessionKey, simplifiedState, 7200);
      logger.info("Saved simplified session as fallback", {
        businessId,
        userPhone,
      });
    } catch (fallbackError) {
      logger.error("Critical error: Failed to save even simplified session", {
        error:
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError),
        businessId,
        userPhone,
      });
    }
  }
}

/**
 * Adiciona uma mensagem ao histórico da conversa com validação reforçada
 */
export function addMessageToHistory(
  state: ConversationState,
  role: "user" | "bot",
  content: string,
  maxMessages: number = 10,
): ConversationState {
  try {
    if (!state || !content) {
      logger.warn("Invalid parameters for addMessageToHistory", {
        hasState: !!state,
        hasContent: !!content,
        role,
      });

      // Se state não existir, criar um novo
      if (!state) {
        state = createEmptySession();
      }
    }

    // Criar uma cópia do estado para evitar mutação acidental
    const newState = { ...state };

    // Garantir que conversation_history é um array
    if (!Array.isArray(newState.conversation_history)) {
      logger.warn("conversation_history não é um array, inicializando", {
        businessId: newState.business_id,
        isAdmin: newState.is_admin,
      });
      newState.conversation_history = [];
    }

    // Adicionar nova mensagem - validar conteúdo
    newState.conversation_history.push({
      role,
      content: String(content).slice(0, 4000), // Limitar tamanho para evitar problemas
      timestamp: Date.now(),
    });

    // Limitar o tamanho do histórico
    if (newState.conversation_history.length > maxMessages) {
      newState.conversation_history = newState.conversation_history.slice(
        -maxMessages,
      );
    }

    logger.debug("Message added to history", {
      businessId: newState.business_id,
      role,
      contentLength: content.length,
      historySize: newState.conversation_history.length,
    });

    return newState;
  } catch (error) {
    logger.error("Error in addMessageToHistory", {
      error: error instanceof Error ? error.message : String(error),
      stateType: typeof state,
      hasConversationHistory: state && "conversation_history" in state,
    });

    // Em caso de erro, retornar um estado com array vazio
    return {
      ...state,
      conversation_history: [
        {
          role,
          content,
          timestamp: Date.now(),
        },
      ],
    };
  }
}

/**
 * Função para extrair data com melhor detecção
 */
export function extractDate(message: string): Date | null {
  try {
    if (!message) return null;

    // Normalizar o texto para facilitar a detecção
    const lowerMessage = message.toLowerCase().trim();
    const today = new Date();

    // Detecção de palavras-chave como "hoje", "amanhã", etc.
    if (lowerMessage.includes("hoje")) {
      return today;
    }

    if (lowerMessage.includes("amanhã") || lowerMessage.includes("amanha")) {
      return addDays(today, 1);
    }

    if (
      lowerMessage.includes("depois de amanhã") ||
      lowerMessage.includes("depois de amanha")
    ) {
      return addDays(today, 2);
    }

    // Detecção de dias específicos da semana
    const weekdayMap: Record<string, number> = {
      domingo: 0,
      segunda: 1,
      "segunda-feira": 1,
      "segunda feira": 1,
      terça: 2,
      terca: 2,
      "terça-feira": 2,
      "terca-feira": 2,
      "terça feira": 2,
      "terca feira": 2,
      quarta: 3,
      "quarta-feira": 3,
      "quarta feira": 3,
      quinta: 4,
      "quinta-feira": 4,
      "quinta feira": 4,
      sexta: 5,
      "sexta-feira": 5,
      "sexta feira": 5,
      sábado: 6,
      sabado: 6,
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

    // Detecção de formatos DD/MM/YYYY, DD-MM-YYYY, etc.
    // Nova regex melhorada que considera variações de separadores
    const dateRegexes = [
      // DD/MM/YYYY ou DD/MM/YY
      /(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?/g,
      // "dia" DD
      /dia\s+(\d{1,2})(?:\s+de\s+(\w+))?(?:\s+de\s+(\d{4}))?/i,
      // DD "de" Mês
      /(\d{1,2})\s+de\s+(\w+)(?:\s+de\s+(\d{4}))?/i,
    ];

    for (const regex of dateRegexes) {
      const match = regex.exec(message);
      if (match) {
        // Para o formato DD/MM/YYYY
        if (match[1] && match[2]) {
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
        // Para formatos com nome do mês, implementar em versões futuras
      }
    }

    return null;
  } catch (error) {
    logger.error("Error extracting date", {
      error: error instanceof Error ? error.message : String(error),
      message,
    });
    return null;
  }
}

/**
 * Extrai hora de uma string com detecção melhorada
 */
export function extractTime(message: string): string | null {
  try {
    if (!message) return null;

    // Normalizar o texto
    const cleanMessage = message.toLowerCase().trim();

    // Array de regexes para diferentes formatos de hora
    const timePatterns = [
      // HH:MM (formato 24h)
      /(\d{1,2}):(\d{2})/i,
      // HHh ou HHhMM
      /(\d{1,2})h(\d{2})?/i,
      // HH horas e MM minutos
      /(\d{1,2})\s*horas(?:\s*e\s*(\d{1,2})\s*minutos)?/i,
      // período aproximado (manhã, tarde, noite)
      /(manh[ãa]|tarde|noite)/i,
    ];

    // Verificar regexes de horário específico
    for (const pattern of timePatterns.slice(0, 3)) {
      const match = cleanMessage.match(pattern);
      if (match) {
        let hour = parseInt(match[1]);
        let minute = match[2] ? parseInt(match[2]) : 0;

        // Validar hora e minuto
        if (hour >= 0 && hour <= 23 && minute >= 0 && minute < 60) {
          return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
        }
      }
    }

    // Verificar períodos do dia (aproximados)
    const periodMatch = cleanMessage.match(/(manh[ãa]|tarde|noite)/i);
    if (periodMatch) {
      const period = periodMatch[1].toLowerCase();
      // Retornar horário aproximado com base no período
      if (period.includes("manha") || period.includes("manhã")) {
        return "10:00"; // Meio da manhã
      } else if (period.includes("tarde")) {
        return "15:00"; // Meio da tarde
      } else if (period.includes("noite")) {
        return "19:00"; // Início da noite
      }
    }

    // Se chegou aqui, não encontrou nenhum formato válido
    return null;
  } catch (error) {
    logger.error("Error extracting time", {
      error: error instanceof Error ? error.message : String(error),
      message,
    });
    return null;
  }
}

export default {
  formatPhoneNumber,
  getBusinessIdFromWabaNumber,
  getBusinessConfig,
  isAdmin,
  getOrCreateCustomer,
  getSession,
  saveSession,
  addMessageToHistory,
  logConversation,
  extractDate,
  extractTime,
  formatDate,
  isBusinessOpen,
  formatBusinessHours,
  getDayOfWeekInPortuguese,
  getNextBusinessDays,
  formatCurrency,
  sanitizeText,
  truncateText,
};
