// lib/coreLogic.ts

import {
  UazapiGoPayload,
  ConversationState,
  BusinessConfig,
  Intent,
} from "@/types";
import {
  getBusinessConfig,
  getSession,
  saveSession,
  addMessageToHistory,
  detectIntent,
  extractDate,
  extractTime,
  formatDate,
  logConversation,
  getBusinessIdFromWabaNumber,
} from "./utils";
import { getLLMResponse, buildPrompt } from "./googleAiClient";
import { getRagContext } from "./rag";
import { sendTextMessage, sendImageMessage } from "./uazapiGoClient";
import {
  checkAvailability,
  bookAppointment,
  getUpcomingAppointments,
  cancelAppointment,
} from "./scheduling";
import {
  handleAdminConfig,
  handleAdminServices,
  handleAdminBlocks,
  handleAdminBusinessHours,
  handleAdminReports,
} from "@/lib/adminHandlers";

/**
 * Função principal para processamento de mensagens recebidas
 */
export async function handleIncomingMessage(
  payload: UazapiGoPayload,
): Promise<void> {
  try {
    console.log(`Processing message:`, {
      sender: payload.phone,
      messageType: payload.messageType,
      fromMe: payload.fromMe,
      isGroup: payload.isGroup,
      businessId: payload.metadata.business_id,
    });

    // Ignorar mensagens enviadas pelo bot ou de grupos
    if (payload.fromMe) {
      console.log("Ignoring message sent by the bot");
      return;
    }

    // Extrair dados da mensagem
    const phone = payload.phone;
    const message_content = payload.text;
    const businessId = payload.metadata.business_id;

    // Verificar se o businessId está disponível
    if (!businessId) {
      console.error(
        "Business ID not found for instance:",
        payload.metadata.instanceOwner,
      );
      await sendTextMessage(
        businessId,
        phone,
        "Desculpe, ocorreu um erro na identificação do negócio. Por favor, tente novamente mais tarde.",
      );
      return;
    }

    // Carregar configuração do negócio
    const businessConfig = await getBusinessConfig(businessId);
    if (!businessConfig) {
      console.error(`Business configuration not found for ${businessId}`);
      await sendTextMessage(
        businessId,
        phone,
        "Desculpe, estou com problemas técnicos no momento. Tente novamente mais tarde.",
      );
      return;
    }

    // Se for mensagem de um cliente bloqueado, ignorar
    if (payload.metadata.is_blocked) {
      console.log(`Ignoring message from blocked customer: ${phone}`);
      return;
    }

    // Obter a sessão atual do usuário
    let session = await getSession(businessId, phone);

    // Adicionar mensagem ao histórico
    session = addMessageToHistory(
      session,
      "user",
      message_content,
      businessConfig.maxHistoryMessages,
    );

    // Determinar a intenção se não houver uma atual
    if (!session.current_intent) {
      session.current_intent = detectIntent(
        message_content,
        payload.metadata.is_admin,
      );
      console.log(`Detected intent: ${session.current_intent}`);
    }

    // Processar conforme a intenção atual
    await processIntent(
      businessId,
      phone,
      message_content,
      session,
      businessConfig,
      payload.metadata,
    );

    // Registrar a mensagem no banco de dados
    await logConversation(
      businessId,
      session.user_id || null,
      "customer",
      message_content,
      session.current_intent,
      { intent: session.current_intent },
    );

    // Salvar a sessão atualizada
    await saveSession(
      businessId,
      phone,
      session,
      businessConfig.sessionTtlHours,
    );
  } catch (error) {
    console.error("Error handling incoming message:", error);

    // Tentar enviar mensagem de erro genérica
    try {
      const businessId = payload.metadata.business_id;
      await sendTextMessage(
        businessId,
        payload.phone,
        "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.",
      );
    } catch (sendError) {
      console.error("Failed to send error message:", sendError);
    }
  }
}

/**
 * Processamento baseado na intenção atual
 */
async function processIntent(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
  metadata: any,
): Promise<void> {
  const intent = session.current_intent;

  // Verificar se é um admin e processar comandos de admin
  if (session.is_admin) {
    switch (intent) {
      case Intent.ADMIN_CONFIG:
        return await handleAdminConfig(
          businessId,
          userPhone,
          messageContent,
          session,
          config,
        );

      case Intent.ADMIN_SERVICES:
        return await handleAdminServices(
          businessId,
          userPhone,
          messageContent,
          session,
          config,
        );

      case Intent.ADMIN_BLOCKS:
        return await handleAdminBlocks(
          businessId,
          userPhone,
          messageContent,
          session,
          config,
        );

      case Intent.ADMIN_BUSINESS_HOURS:
        return await handleAdminBusinessHours(
          businessId,
          userPhone,
          messageContent,
          session,
          config,
        );

      case Intent.ADMIN_REPORTS:
        return await handleAdminReports(
          businessId,
          userPhone,
          messageContent,
          session,
          config,
        );
    }
  }

  // Processar intenções gerais (para todos os usuários)
  switch (intent) {
    case Intent.GENERAL_CHAT:
    case Intent.FAQ:
      await handleGeneralQuery(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case Intent.START_SCHEDULING:
      // Iniciar fluxo de agendamento
      await startSchedulingFlow(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case Intent.SCHEDULING_COLLECT_SERVICE:
      // Coletar serviço desejado
      await collectServiceInfo(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case Intent.SCHEDULING_COLLECT_DATE:
      // Coletar data desejada
      await collectDateInfo(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case Intent.SCHEDULING_COLLECT_TIME:
      // Coletar horário desejado
      await collectTimeInfo(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case Intent.SCHEDULING_CONFIRM:
      // Confirmar agendamento
      await confirmScheduling(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case Intent.CANCEL_APPOINTMENT:
      // Cancelar agendamento
      await handleCancellation(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case Intent.CHECK_APPOINTMENTS:
      // Verificar agendamentos
      await handleCheckAppointments(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case Intent.RESCHEDULE_APPOINTMENT:
      // Reagendar compromisso
      await handleRescheduling(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    default:
      // Tratar como consulta geral se intent não reconhecido
      session.current_intent = Intent.GENERAL_CHAT;
      await handleGeneralQuery(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
  }
}

/**
 * Manipula consultas gerais usando o LLM e RAG (se configurado)
 */
async function handleGeneralQuery(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    // Buscar contexto RAG se habilitado
    let ragContext = "";
    if (config.ragEnabled) {
      ragContext = await getRagContext(messageContent, businessId);
    }

    // Construir prompt para o LLM
    const systemInstruction = `${config.defaultPrompt}
    
    Você é o assistente virtual da ${config.name}.
    
    ${session.is_admin ? "Você está conversando com um administrador do sistema." : "Você está conversando com um cliente."}
    
    Horário de funcionamento:
    - Segunda-feira: ${formatBusinessHours(config.businessHours.monday)}
    - Terça-feira: ${formatBusinessHours(config.businessHours.tuesday)}
    - Quarta-feira: ${formatBusinessHours(config.businessHours.wednesday)}
    - Quinta-feira: ${formatBusinessHours(config.businessHours.thursday)}
    - Sexta-feira: ${formatBusinessHours(config.businessHours.friday)}
    - Sábado: ${formatBusinessHours(config.businessHours.saturday)}
    - Domingo: ${formatBusinessHours(config.businessHours.sunday)}
    
    Responda de forma amigável e profissional. Se o cliente quiser agendar um serviço, ajude-o com o processo.`;

    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      messageContent,
      ragContext,
    );

    // Obter resposta do LLM
    const response = await getLLMResponse(prompt, config.llmApiKey);

    // Enviar resposta ao usuário
    await sendTextMessage(businessId, userPhone, response);

    // Registrar no banco de dados
    await logConversation(
      businessId,
      session.user_id || null,
      "bot",
      response,
      session.current_intent,
    );

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

    // Limpar a intenção atual
    session.current_intent = null;
  } catch (error) {
    console.error("Error handling general query:", error);
    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao processar sua consulta. Poderia tentar perguntar de outra forma?",
    );
  }
}

// Função auxiliar para formatar horários de funcionamento
function formatBusinessHours(dayHours: {
  start: string | null;
  end: string | null;
}): string {
  if (!dayHours.start || !dayHours.end) {
    return "Fechado";
  }
  return `${dayHours.start} às ${dayHours.end}`;
}

// Função para verificar agendamentos do cliente
async function handleCheckAppointments(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    // Buscar agendamentos futuros
    const appointments = await getUpcomingAppointments(businessId, userPhone);

    if (appointments.length === 0) {
      const noAppointmentsMessage =
        "Você não possui nenhum agendamento futuro. Gostaria de agendar um serviço agora?";
      await sendTextMessage(businessId, userPhone, noAppointmentsMessage);
      addMessageToHistory(
        session,
        "bot",
        noAppointmentsMessage,
        config.maxHistoryMessages,
      );

      // Resetar o estado
      session.current_intent = null;
      return;
    }

    // Formatar lista de agendamentos
    let message = "Seus próximos agendamentos:\n\n";

    appointments.forEach((appointment, index) => {
      const startTime = new Date(appointment.start_time);
      const formattedDate = formatDate(startTime);
      const formattedTime = startTime.toTimeString().slice(0, 5);

      message += `${index + 1}. *${appointment.service}*\n`;
      message += `   Data: ${formattedDate}\n`;
      message += `   Horário: ${formattedTime}\n\n`;
    });

    message +=
      "Para cancelar ou reagendar, digite 'cancelar' ou 'reagendar' seguido do número do agendamento.";

    await sendTextMessage(businessId, userPhone, message);
    addMessageToHistory(session, "bot", message, config.maxHistoryMessages);

    // Salvar os agendamentos no contexto para uso posterior
    session.context_data.appointments = appointments;
    session.current_intent = null;
  } catch (error) {
    console.error("Error handling check appointments:", error);
    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, ocorreu um erro ao verificar seus agendamentos. Por favor, tente novamente mais tarde.",
    );
    session.current_intent = null;
  }
}

// Função para reagendar compromisso
async function handleRescheduling(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    // Implementação a ser adicionada
    const message =
      "A funcionalidade de reagendamento será implementada em breve. Por favor, cancele o agendamento atual e crie um novo.";
    await sendTextMessage(businessId, userPhone, message);
    addMessageToHistory(session, "bot", message, config.maxHistoryMessages);

    // Resetar o estado
    session.current_intent = null;
  } catch (error) {
    console.error("Error handling rescheduling:", error);
    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, ocorreu um erro ao processar seu pedido de reagendamento. Por favor, tente novamente mais tarde.",
    );
    session.current_intent = null;
  }
}

/**
 * Inicia o fluxo de agendamento
 */
async function startSchedulingFlow(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    // Buscar serviços disponíveis
    const { data: services, error } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .eq("active", true);

    if (error || !services || services.length === 0) {
      console.error("Error fetching services:", error);
      await sendTextMessage(
        businessId,
        userPhone,
        "Desculpe, não foi possível encontrar serviços disponíveis no momento. Por favor, tente novamente mais tarde.",
      );
      session.current_intent = null;
      return;
    }

    // Formatar lista de serviços
    let serviceOptions = services
      .map(
        (service) =>
          `• ${service.name} (${service.duration} min): R$ ${service.price.toFixed(2)}`,
      )
      .join("\n");

    // Construir prompt para o LLM pedir detalhes do serviço
    const systemInstruction = `${config.defaultPrompt}\n\n
    Você está ajudando o usuário a agendar um serviço na ${config.name}. 
    Pergunte qual serviço ele deseja agendar de forma amigável e clara. 
    Temos os seguintes serviços disponíveis:
    
    ${serviceOptions}
    
    Ajude o cliente a escolher um dos serviços listados acima.`;

    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      messageContent,
      "",
    );

    // Obter resposta do LLM
    const response = await getLLMResponse(prompt, config.llmApiKey);

    // Enviar resposta ao usuário
    await sendTextMessage(businessId, userPhone, response);

    // Registrar no banco de dados
    await logConversation(
      businessId,
      session.user_id || null,
      "bot",
      response,
      session.current_intent,
    );

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

    // Salvar serviços disponíveis no contexto
    session.context_data.available_services = services;

    // Atualizar estado para coletar o serviço
    session.current_intent = Intent.SCHEDULING_COLLECT_SERVICE;
  } catch (error) {
    console.error("Error starting scheduling flow:", error);
    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao iniciar o agendamento. Poderia tentar novamente mais tarde?",
    );

    // Resetar o estado em caso de erro
    session.current_intent = null;
  }
}

// Implementar as outras funções de agendamento...
// collectServiceInfo, collectDateInfo, collectTimeInfo, confirmScheduling, handleCancellation

// O resto do código permanece similar, mas adaptado para usar o businessId em vez de clientId
// e para usar os tipos/interfaces atualizados
