// lib/coreLogic.ts

import { UazapiGoPayload, ConversationState, ClientConfig } from "@/types";
import {
  getClientConfig,
  getSession,
  saveSession,
  addMessageToHistory,
  detectIntent,
  extractDate,
  extractTime,
  formatDate,
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

/**
 * Função principal para processamento de mensagens recebidas
 */
export async function handleIncomingMessage(
  payload: UazapiGoPayload,
  clientId: string,
): Promise<void> {
  try {
    console.log(`Processing message for client ${clientId}:`, {
      sender: payload.phone,
      messageType: payload.messageType,
      fromMe: payload.fromMe,
      isGroup: payload.isGroup,
    });

    // Ignorar mensagens enviadas pelo bot ou de grupos (se configurado)
    if (payload.fromMe) {
      console.log("Ignoring message sent by the bot");
      return;
    }

    // Extrair dados da mensagem
    const sender_phone = payload.phone;
    const message_content = payload.text;

    // Se não for mensagem de texto, enviar resposta genérica
    if (payload.messageType !== "text") {
      await sendTextMessage(
        clientId,
        sender_phone,
        "Desculpe, atualmente só consigo processar mensagens de texto.",
      );
      return;
    }

    // Carregar configuração do cliente
    const clientConfig = await getClientConfig(clientId);
    if (!clientConfig) {
      console.error(`Client configuration not found for ${clientId}`);
      await sendTextMessage(
        clientId,
        sender_phone,
        "Desculpe, estou com problemas técnicos no momento. Tente novamente mais tarde.",
      );
      return;
    }

    // Verificar configuração de grupos
    if (payload.isGroup && clientConfig.ragEnabled) {
      console.log("Ignoring group message");
      return;
    }

    // Obter a sessão atual do usuário
    let session = await getSession(clientId, sender_phone);

    // Adicionar mensagem ao histórico
    session = addMessageToHistory(
      session,
      "user",
      message_content,
      clientConfig.maxHistoryMessages,
    );

    // Determinar a intenção se não houver uma atual
    if (!session.current_intent) {
      session.current_intent = detectIntent(message_content);
      console.log(`Detected intent: ${session.current_intent}`);
    }

    // Processar conforme a intenção atual
    await processIntent(
      clientId,
      sender_phone,
      message_content,
      session,
      clientConfig,
    );

    // Salvar a sessão atualizada
    await saveSession(
      clientId,
      sender_phone,
      session,
      clientConfig.sessionTtlHours,
    );
  } catch (error) {
    console.error("Error handling incoming message:", error);

    // Tentar enviar mensagem de erro genérica
    try {
      await sendTextMessage(
        clientId,
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
  clientId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: ClientConfig,
): Promise<void> {
  const intent = session.current_intent;

  switch (intent) {
    case "general_chat":
    case "faq":
      await handleGeneralQuery(
        clientId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case "start_scheduling":
      // Iniciar fluxo de agendamento
      await startSchedulingFlow(
        clientId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case "scheduling_collect_service":
      // Coletar serviço desejado
      await collectServiceInfo(
        clientId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case "scheduling_collect_date":
      // Coletar data desejada
      await collectDateInfo(
        clientId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case "scheduling_collect_time":
      // Coletar horário desejado
      await collectTimeInfo(
        clientId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case "scheduling_confirm":
      // Confirmar agendamento
      await confirmScheduling(
        clientId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    case "cancel_appointment":
      // Cancelar agendamento
      await handleCancellation(
        clientId,
        userPhone,
        messageContent,
        session,
        config,
      );
      break;

    default:
      // Tratar como consulta geral se intent não reconhecido
      session.current_intent = "general_chat";
      await handleGeneralQuery(
        clientId,
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
  clientId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: ClientConfig,
): Promise<void> {
  try {
    // Buscar contexto RAG se habilitado
    let ragContext = "";
    if (config.ragEnabled) {
      ragContext = await getRagContext(messageContent, clientId);
    }

    // Construir prompt para o LLM
    const systemInstruction = config.defaultPrompt;
    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      messageContent,
      ragContext,
    );

    // Obter resposta do LLM
    const response = await getLLMResponse(prompt, config.llmApiKey);

    // Enviar resposta ao usuário
    await sendTextMessage(clientId, userPhone, response);

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

    // Limpar a intenção atual
    session.current_intent = null;
  } catch (error) {
    console.error("Error handling general query:", error);
    await sendTextMessage(
      clientId,
      userPhone,
      "Desculpe, tive um problema ao processar sua consulta. Poderia tentar perguntar de outra forma?",
    );
  }
}

/**
 * Inicia o fluxo de agendamento
 */
async function startSchedulingFlow(
  clientId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: ClientConfig,
): Promise<void> {
  try {
    // Construir prompt para o LLM pedir detalhes do serviço
    const systemInstruction = `${config.defaultPrompt}\n\nAgora você está ajudando o usuário a agendar um serviço. Pergunte qual serviço ele deseja agendar de forma amigável e clara. Mencione as opções disponíveis: Corte de cabelo, Manicure, Pedicure, Coloração, Tratamento facial.`;

    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      messageContent,
      "",
    );

    // Obter resposta do LLM
    const response = await getLLMResponse(prompt, config.llmApiKey);

    // Enviar resposta ao usuário
    await sendTextMessage(clientId, userPhone, response);

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

    // Atualizar estado para coletar o serviço
    session.current_intent = "scheduling_collect_service";
    session.context_data = {};
  } catch (error) {
    console.error("Error starting scheduling flow:", error);
    await sendTextMessage(
      clientId,
      userPhone,
      "Desculpe, tive um problema ao iniciar o agendamento. Poderia tentar novamente mais tarde?",
    );

    // Resetar o estado em caso de erro
    session.current_intent = null;
  }
}

/**
 * Coleta informações sobre o serviço desejado
 */
async function collectServiceInfo(
  clientId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: ClientConfig,
): Promise<void> {
  try {
    // Usar LLM para extrair o serviço da mensagem
    const extractionPrompt = `Analise a mensagem do usuário e extraia qual serviço ele deseja agendar. As opções são: Corte de cabelo, Manicure, Pedicure, Coloração, Tratamento facial. Responda APENAS com o nome do serviço, nada mais. Se não for possível identificar o serviço, responda com "não identificado".
    
    Mensagem do usuário: "${messageContent}"`;

    const extractedService = await getLLMResponse(
      extractionPrompt,
      config.llmApiKey,
    );
    const service = extractedService.trim();

    // Verificar se o serviço foi identificado
    if (service === "não identificado") {
      const clarificationMessage =
        "Desculpe, não consegui identificar qual serviço você deseja. Poderia escolher entre: Corte de cabelo, Manicure, Pedicure, Coloração ou Tratamento facial?";
      await sendTextMessage(clientId, userPhone, clarificationMessage);
      addMessageToHistory(
        session,
        "bot",
        clarificationMessage,
        config.maxHistoryMessages,
      );
      return;
    }

    // Salvar o serviço no contexto
    session.context_data.service = service;

    // Criar mensagem para solicitar a data
    const systemInstruction = `${config.defaultPrompt}\n\nO usuário deseja agendar ${service}. Peça agora a data em que ele gostaria de agendar de maneira amigável e clara. Sugira que ele pode usar formatos como "amanhã", "sexta-feira", ou datas específicas.`;

    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      messageContent,
      "",
    );

    // Obter resposta do LLM
    const response = await getLLMResponse(prompt, config.llmApiKey);

    // Enviar resposta ao usuário
    await sendTextMessage(clientId, userPhone, response);

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

    // Atualizar estado para coletar a data
    session.current_intent = "scheduling_collect_date";
  } catch (error) {
    console.error("Error collecting service info:", error);
    await sendTextMessage(
      clientId,
      userPhone,
      "Desculpe, tive um problema ao processar sua escolha de serviço. Poderia tentar novamente?",
    );
  }
}

/**
 * Coleta informações sobre a data desejada
 */
async function collectDateInfo(
  clientId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: ClientConfig,
): Promise<void> {
  try {
    // Extrair data da mensagem
    const date = extractDate(messageContent);

    if (!date) {
      const clarificationMessage =
        "Desculpe, não consegui identificar a data desejada. Poderia informar novamente? Por exemplo: 'amanhã', 'sexta-feira' ou '15/10'.";
      await sendTextMessage(clientId, userPhone, clarificationMessage);
      addMessageToHistory(
        session,
        "bot",
        clarificationMessage,
        config.maxHistoryMessages,
      );
      return;
    }

    // Salvar a data no contexto
    session.context_data.date = date.toISOString().split("T")[0]; // formato YYYY-MM-DD

    // Verificar disponibilidade
    const availableTimes = await checkAvailability(
      clientId,
      session.context_data.service,
      date,
    );

    // Filtrar apenas horários disponíveis
    const availableTimeSlots = availableTimes
      .filter((slot) => slot.available)
      .map((slot) => slot.time);

    if (availableTimeSlots.length === 0) {
      const noAvailabilityMessage = `Desculpe, não temos horários disponíveis para ${session.context_data.service} no dia ${formatDate(date)}. Poderia escolher outra data?`;
      await sendTextMessage(clientId, userPhone, noAvailabilityMessage);
      addMessageToHistory(
        session,
        "bot",
        noAvailabilityMessage,
        config.maxHistoryMessages,
      );
      return;
    }

    // Formatar horários disponíveis
    const availabilityText = availableTimeSlots.join(", ");

    // Criar mensagem para solicitar o horário
    const message = `Para ${session.context_data.service} no dia ${formatDate(date)}, temos os seguintes horários disponíveis: ${availabilityText}. Qual horário você prefere?`;

    // Enviar resposta ao usuário
    await sendTextMessage(clientId, userPhone, message);

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", message, config.maxHistoryMessages);

    // Salvar horários disponíveis no contexto
    session.context_data.available_times = availableTimeSlots;

    // Atualizar estado para coletar o horário
    session.current_intent = "scheduling_collect_time";
  } catch (error) {
    console.error("Error collecting date info:", error);
    await sendTextMessage(
      clientId,
      userPhone,
      "Desculpe, tive um problema ao processar a data. Poderia tentar novamente?",
    );
  }
}

/**
 * Coleta informações sobre o horário desejado
 */
async function collectTimeInfo(
  clientId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: ClientConfig,
): Promise<void> {
  try {
    // Extrair horário da mensagem
    const timeStr = extractTime(messageContent);

    if (!timeStr) {
      const clarificationMessage =
        "Desculpe, não consegui identificar o horário desejado. Poderia escolher um dos horários disponíveis?";
      await sendTextMessage(clientId, userPhone, clarificationMessage);
      addMessageToHistory(
        session,
        "bot",
        clarificationMessage,
        config.maxHistoryMessages,
      );
      return;
    }

    // Verificar se o horário está disponível
    const availableTimes = session.context_data.available_times || [];
    if (!availableTimes.includes(timeStr)) {
      const invalidTimeMessage = `Desculpe, o horário ${timeStr} não está disponível. Por favor, escolha um dos seguintes horários: ${availableTimes.join(", ")}.`;
      await sendTextMessage(clientId, userPhone, invalidTimeMessage);
      addMessageToHistory(
        session,
        "bot",
        invalidTimeMessage,
        config.maxHistoryMessages,
      );
      return;
    }

    // Salvar o horário no contexto
    session.context_data.time = timeStr;

    // Criar mensagem de confirmação
    const confirmationMessage = `Você deseja agendar ${session.context_data.service} no dia ${formatDate(new Date(session.context_data.date))} às ${timeStr}. Está correto? Responda com "sim" para confirmar ou "não" para cancelar.`;

    // Enviar mensagem de confirmação
    await sendTextMessage(clientId, userPhone, confirmationMessage);

    // Adicionar resposta ao histórico
    addMessageToHistory(
      session,
      "bot",
      confirmationMessage,
      config.maxHistoryMessages,
    );

    // Atualizar estado para confirmação
    session.current_intent = "scheduling_confirm";
  } catch (error) {
    console.error("Error collecting time info:", error);
    await sendTextMessage(
      clientId,
      userPhone,
      "Desculpe, tive um problema ao processar o horário. Poderia tentar novamente?",
    );
  }
}

/**
 * Confirma o agendamento
 */
async function confirmScheduling(
  clientId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: ClientConfig,
): Promise<void> {
  try {
    const lowerMessage = messageContent.toLowerCase();

    // Verificar se o usuário confirmou
    if (
      lowerMessage.includes("sim") ||
      lowerMessage.includes("confirmar") ||
      lowerMessage.includes("ok")
    ) {
      // Realizar o agendamento
      const success = await bookAppointment(
        clientId,
        userPhone,
        session.context_data.service,
        session.context_data.date,
        session.context_data.time,
      );

      if (success) {
        // Mensagem de confirmação
        const successMessage = `Ótimo! Seu agendamento para ${session.context_data.service} no dia ${formatDate(new Date(session.context_data.date))} às ${session.context_data.time} foi confirmado. Agradecemos a preferência!`;
        await sendTextMessage(clientId, userPhone, successMessage);
        addMessageToHistory(
          session,
          "bot",
          successMessage,
          config.maxHistoryMessages,
        );
      } else {
        // Mensagem de erro
        const errorMessage =
          "Desculpe, ocorreu um erro ao confirmar seu agendamento. Por favor, entre em contato conosco por telefone.";
        await sendTextMessage(clientId, userPhone, errorMessage);
        addMessageToHistory(
          session,
          "bot",
          errorMessage,
          config.maxHistoryMessages,
        );
      }
    } else {
      // Mensagem de cancelamento
      const cancelMessage =
        "Agendamento cancelado. Se desejar, podemos recomeçar o processo. Como posso ajudar?";
      await sendTextMessage(clientId, userPhone, cancelMessage);
      addMessageToHistory(
        session,
        "bot",
        cancelMessage,
        config.maxHistoryMessages,
      );
    }

    // Resetar o estado
    session.current_intent = null;
    session.context_data = {};
  } catch (error) {
    console.error("Error confirming scheduling:", error);
    await sendTextMessage(
      clientId,
      userPhone,
      "Desculpe, ocorreu um erro ao processar sua confirmação. Por favor, tente novamente mais tarde.",
    );

    // Resetar o estado em caso de erro
    session.current_intent = null;
  }
}

/**
 * Manipula pedidos de cancelamento
 */
async function handleCancellation(
  clientId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: ClientConfig,
): Promise<void> {
  try {
    // Buscar agendamentos futuros
    const appointments = await getUpcomingAppointments(clientId, userPhone);

    if (appointments.length === 0) {
      const noAppointmentsMessage =
        "Não encontrei nenhum agendamento futuro para cancelar. Se precisar de ajuda com outra coisa, é só me avisar.";
      await sendTextMessage(clientId, userPhone, noAppointmentsMessage);
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

    // Para simplificar, vamos cancelar o próximo agendamento
    const appointment = appointments[0];

    // Cancelar o agendamento
    const success = await cancelAppointment(appointment.appointment_id);

    if (success) {
      const startTime = new Date(appointment.start_time);
      const formattedDate = formatDate(startTime);
      const formattedTime = startTime.toTimeString().slice(0, 5);

      const successMessage = `Seu agendamento de ${appointment.service} para ${formattedDate} às ${formattedTime} foi cancelado com sucesso.`;
      await sendTextMessage(clientId, userPhone, successMessage);
      addMessageToHistory(
        session,
        "bot",
        successMessage,
        config.maxHistoryMessages,
      );
    } else {
      const errorMessage =
        "Desculpe, ocorreu um erro ao cancelar seu agendamento. Por favor, entre em contato conosco por telefone.";
      await sendTextMessage(clientId, userPhone, errorMessage);
      addMessageToHistory(
        session,
        "bot",
        errorMessage,
        config.maxHistoryMessages,
      );
    }

    // Resetar o estado
    session.current_intent = null;
  } catch (error) {
    console.error("Error handling cancellation:", error);
    await sendTextMessage(
      clientId,
      userPhone,
      "Desculpe, ocorreu um erro ao processar o cancelamento. Por favor, tente novamente mais tarde.",
    );

    // Resetar o estado em caso de erro
    session.current_intent = null;
  }
}
