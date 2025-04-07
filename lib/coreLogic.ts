// lib/coreLogic.ts

import { UazapiGoPayload, ConversationState, BusinessConfig } from "@/types";
import {
  getBusinessConfig,
  getSession,
  saveSession,
  addMessageToHistory,
  formatDate,
  logConversation,
  isAdmin,
  getOrCreateCustomer,
} from "./utils";
import {
  getLLMResponse,
  buildPrompt,
  extractEntityFromLLM,
} from "./googleAiClient";
import { getRagContext } from "./rag";
import { sendTextMessage, sendImageMessage } from "./uazapiGoClient";
import {
  checkAvailability,
  bookAppointment,
  getUpcomingAppointments,
  cancelAppointment,
} from "./scheduling";
import { detectIntent, Intent, parseAdminCommand } from "./intentDetector";
import { handleAdminCommand } from "./adminHandler";
import logger from "./logger";

// Resto do arquivo continua o mesmo...
// A mudança principal foi remover a importação de Intent de @/types e usar a do intentDetector.ts
/**
 * Função principal para processamento de mensagens recebidas
 */
export async function handleIncomingMessage(
  payload: UazapiGoPayload,
): Promise<void> {
  try {
    logger.info(`Processing message`, {
      sender: payload.phone,
      messageType: payload.messageType,
      fromMe: payload.fromMe,
      isGroup: payload.isGroup,
      businessId: payload.metadata.business_id,
    });

    // Ignorar mensagens enviadas pelo bot ou de grupos
    if (payload.fromMe) {
      logger.debug("Ignoring message sent by the bot", {
        phone: payload.phone,
        businessId: payload.metadata.business_id,
      });
      return;
    }

    // Ignorar mensagens de grupos
    if (payload.isGroup) {
      logger.debug("Ignoring group message", {
        phone: payload.phone,
        businessId: payload.metadata.business_id,
      });
      return;
    }

    // Extrair dados da mensagem
    const phone = payload.phone;
    const message_content = payload.text;
    const businessId = payload.metadata.business_id;

    // Verificar se o businessId está disponível
    if (!businessId) {
      logger.error("Business ID not found for instance", {
        instanceOwner: payload.metadata.instanceOwner,
        phone,
      });

      await sendTextMessage(
        businessId || "unknown",
        phone,
        "Desculpe, ocorreu um erro na identificação do negócio. Por favor, tente novamente mais tarde.",
      );
      return;
    }

    // Carregar configuração do negócio
    const businessConfig = await getBusinessConfig(businessId);
    if (!businessConfig) {
      logger.error(`Business configuration not found`, { businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Desculpe, estou com problemas técnicos no momento. Tente novamente mais tarde.",
      );
      return;
    }

    // Se for mensagem de um cliente bloqueado, ignorar
    if (payload.metadata.is_blocked) {
      logger.info(`Ignoring message from blocked customer`, {
        phone,
        businessId,
      });
      return;
    }

    // Obter a sessão atual do usuário
    let session = await getSession(businessId, phone);

    // Verificar se é admin (com payload ou banco)
    const isAdminUser =
      payload.metadata.is_admin !== undefined
        ? payload.metadata.is_admin
        : await isAdmin(businessId, phone);

    // Atualizar flag de admin na sessão
    session.is_admin = isAdminUser;

    // Adicionar mensagem ao histórico
    session = addMessageToHistory(
      session,
      "user",
      message_content,
      businessConfig.maxHistoryMessages,
    );

    // Criar ou obter ID do cliente se não for admin
    if (!session.is_admin && !session.user_id) {
      const customerId = await getOrCreateCustomer(
        businessId,
        phone,
        payload.senderName || undefined,
      );

      if (customerId) {
        session.user_id = customerId;
      }
    }

    // Determinar a intenção para a mensagem atual
    const currentMessageIntent = detectIntent(
      message_content,
      session.is_admin,
      session,
    );

    logger.info(`Detected intent`, {
      phone,
      businessId,
      intent: currentMessageIntent,
      isAdmin: session.is_admin,
    });

    // Se não houver intenção atual na sessão ou se estivermos em chat geral,
    // atualizar com a nova intenção detectada
    if (
      !session.current_intent ||
      session.current_intent === Intent.GENERAL_CHAT
    ) {
      session.current_intent = currentMessageIntent;
    }

    // Processar conforme a intenção atual
    await processIntent(
      businessId,
      phone,
      message_content,
      currentMessageIntent,
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
    logger.error("Error handling incoming message", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      phone: payload.phone,
      businessId: payload.metadata.business_id,
    });

    // Tentar enviar mensagem de erro genérica
    try {
      const businessId = payload.metadata.business_id;
      await sendTextMessage(
        businessId,
        payload.phone,
        "Desculpe, ocorreu um erro ao processar sua mensagem. Por favor, tente novamente mais tarde.",
      );
    } catch (sendError) {
      logger.error("Failed to send error message", {
        error:
          sendError instanceof Error ? sendError.message : String(sendError),
        phone: payload.phone,
        businessId: payload.metadata.business_id,
      });
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
  currentMessageIntent: Intent,
  session: ConversationState,
  config: BusinessConfig,
  metadata: any,
): Promise<void> {
  try {
    const currentIntent = session.current_intent as Intent;

    logger.debug("Processing intent", {
      businessId,
      userPhone,
      currentIntent,
      currentMessageIntent,
      isAdmin: session.is_admin,
    });

    // Verificar se é um admin e processar comandos de admin
    if (session.is_admin) {
      // Verificar se é uma intenção administrativa
      const isAdminIntent = Object.values(Intent)
        .filter(
          (intent) => typeof intent === "string" && intent.startsWith("ADMIN_"),
        )
        .includes(currentIntent);

      if (isAdminIntent) {
        const handled = await handleAdminCommand(
          businessId,
          userPhone,
          messageContent,
          currentIntent,
          await getBusinessConfig(businessId), // Obter config fresca
        );

        if (handled) {
          // Se o comando foi processado pelo handler admin,
          // a resposta já foi enviada
          return;
        }
      }
    }

    // Processar intenções gerais e de agendamento
    switch (currentIntent) {
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
  } catch (error) {
    logger.error("Error processing intent", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      businessId,
      userPhone,
      intent: session.current_intent,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao processar sua solicitação. Por favor, tente novamente.",
    );

    // Resetar a intenção para evitar ficar preso em um estado inválido
    session.current_intent = Intent.GENERAL_CHAT;
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
    logger.info("Handling general query", { businessId, userPhone });

    // Buscar contexto RAG se habilitado
    let ragContext = "";
    if (config.ragEnabled) {
      ragContext = await getRagContext(messageContent, businessId);
    }

    console.log(JSON.stringify({ messageContent, ragContext }, null, 2));

    // Construir prompt para o LLM
    let systemInstruction = `${config.defaultPrompt}

    Você é o assistente virtual da ${config.name}.

    ${session.is_admin ? "Você está conversando com um administrador do sistema." : "Você está conversando com um cliente."}`;

    // Obter resposta do LLM usando o novo formato de prompt
    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      messageContent,
      config,
      ragContext,
    );

    // Obter resposta do LLM
    const response = await getLLMResponse(prompt, config.llmApiKey, businessId);

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

    // Limpar a intenção atual se for uma consulta geral
    if (
      session.current_intent === Intent.GENERAL_CHAT ||
      session.current_intent === Intent.FAQ
    ) {
      session.current_intent = null;
    }
  } catch (error) {
    logger.error("Error handling general query", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao processar sua consulta. Poderia tentar perguntar de outra forma?",
    );

    // Resetar intenção
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
    logger.info("Starting scheduling flow", { businessId, userPhone });

    // Buscar serviços disponíveis no Supabase
    const { data: services, error } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .eq("active", true);

    if (error) {
      logger.error("Error fetching services", {
        error: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code,
        businessId,
      });

      await sendTextMessage(
        businessId,
        userPhone,
        "Desculpe, não foi possível encontrar serviços disponíveis no momento. Por favor, tente novamente mais tarde.",
      );

      session.current_intent = null;
      return;
    }

    if (!services || services.length === 0) {
      logger.warn("No active services found", { businessId });

      await sendTextMessage(
        businessId,
        userPhone,
        "Desculpe, não há serviços disponíveis para agendamento no momento. Por favor, entre em contato com a empresa para mais informações.",
      );

      session.current_intent = null;
      return;
    }

    // Formatar lista de serviços
    let serviceOptions = services
      .map(
        (service, index) =>
          `${index + 1}. ${service.name} (${service.duration} min): R$ ${service.price.toFixed(2)}`,
      )
      .join("\n");

    // Construir prompt para o LLM
    let systemInstruction = `${config.defaultPrompt}

    Você está ajudando o usuário a agendar um serviço na ${config.name}.
    Você deve perguntar qual serviço ele deseja agendar de forma amigável e clara.
    
    Temos os seguintes serviços disponíveis:

    ${serviceOptions}

    Peça ao cliente para escolher um dos serviços listados acima, informando o número ou nome do serviço.
    Não invente outros serviços além destes listados.`;

    try {
      // Obter resposta do LLM usando o novo formato de prompt
      const prompt = buildPrompt(
        systemInstruction,
        session.conversation_history,
        messageContent,
        config,
      );

      console.log(
        JSON.stringify(
          {
            systemInstruction,
            messageContent,
            prompt,
          },
          null,
          2,
        ),
      );
      // Obter resposta do LLM
      const response = await getLLMResponse(
        prompt,
        config.llmApiKey,
        businessId,
      );

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

      // Salvar serviços disponíveis no contexto - Garantindo deep copy dos objetos
      session.context_data.available_services = JSON.parse(
        JSON.stringify(services),
      );

      // Atualizar estado para coletar o serviço
      session.current_intent = Intent.SCHEDULING_COLLECT_SERVICE;

      // Salvar a sessão imediatamente para evitar perda de contexto
      await saveSession(businessId, userPhone, session, config.sessionTtlHours);
    } catch (llmError) {
      logger.error("Error getting LLM response", {
        error: llmError instanceof Error ? llmError.message : String(llmError),
        businessId,
        userPhone,
      });

      // Fallback para mensagem simples sem usar LLM
      const fallbackResponse = `Olá! Para agendar um serviço, por favor escolha uma das opções abaixo:\n\n${serviceOptions}\n\nPor favor, responda com o número ou nome do serviço desejado.`;

      await sendTextMessage(businessId, userPhone, fallbackResponse);

      // Registrar no banco de dados
      await logConversation(
        businessId,
        session.user_id || null,
        "bot",
        fallbackResponse,
        session.current_intent,
      );

      // Adicionar resposta ao histórico
      addMessageToHistory(
        session,
        "bot",
        fallbackResponse,
        config.maxHistoryMessages,
      );

      // Salvar serviços disponíveis no contexto
      session.context_data.available_services = JSON.parse(
        JSON.stringify(services),
      );

      // Atualizar estado para coletar o serviço
      session.current_intent = Intent.SCHEDULING_COLLECT_SERVICE;

      // Salvar a sessão imediatamente
      await saveSession(businessId, userPhone, session, config.sessionTtlHours);
    }
  } catch (error) {
    logger.error("Critical error in startSchedulingFlow", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      businessId,
      userPhone,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, ocorreu um erro ao iniciar o agendamento. Por favor, tente novamente mais tarde ou entre em contato diretamente com a empresa.",
    );

    // Resetar o estado em caso de erro
    session.current_intent = null;
    await saveSession(businessId, userPhone, session, config.sessionTtlHours);
  }
}

/**
 * Coleta informações sobre o serviço desejado
 */
async function collectServiceInfo(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    logger.info("Collecting service info", {
      businessId,
      userPhone,
      messageContent,
    });

    // Verificar se o contexto existe e tem os dados necessários
    if (!session.context_data) {
      session.context_data = {};
    }

    const services = session.context_data.available_services || [];

    if (!Array.isArray(services) || services.length === 0) {
      logger.warn("No services in context or invalid format, restarting flow", {
        businessId,
        userPhone,
        contextData: JSON.stringify(session.context_data),
      });

      // Se não tiver serviços no contexto, reiniciar o fluxo
      return await startSchedulingFlow(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
    }

    // Tentar identificar o serviço selecionado
    let selectedService = null;
    const cleanMessage = messageContent.toLowerCase().trim();

    // Verificar se o usuário forneceu um número de serviço
    const serviceNumber = cleanMessage.match(/^(\d+)/);
    if (serviceNumber && parseInt(serviceNumber[1]) <= services.length) {
      // Seleção por número
      const index = parseInt(serviceNumber[1]) - 1;
      if (index >= 0 && index < services.length) {
        selectedService = services[index];
        logger.debug("Service selected by number", {
          businessId,
          userPhone,
          serviceNumber: serviceNumber[1],
          serviceName: selectedService.name,
        });
      }
    }

    // Se não achou por número, tentar por nome
    if (!selectedService) {
      // Tentativa 1: Correspondência exata com nome do serviço
      selectedService = services.find((service) =>
        cleanMessage.includes(service.name.toLowerCase()),
      );

      // Tentativa 2: Correspondência parcial (para nomes compostos)
      if (!selectedService) {
        for (const service of services) {
          const serviceNameParts = service.name.toLowerCase().split(" ");
          // Se qualquer parte do nome do serviço está na mensagem
          if (
            serviceNameParts.some(
              (part) => cleanMessage.includes(part) && part.length > 2,
            )
          ) {
            selectedService = service;
            logger.debug("Service selected by partial match", {
              businessId,
              userPhone,
              matchedPart: serviceNameParts.find((part) =>
                cleanMessage.includes(part),
              ),
              serviceName: service.name,
            });
            break;
          }
        }
      }
    }

    // Se ainda não identificou o serviço, usar o LLM para tentar extrair
    if (!selectedService) {
      logger.debug("Attempting service identification with LLM", {
        businessId,
        userPhone,
      });

      try {
        // Construir prompt para o LLM identificar o serviço
        const serviceOptions = services
          .map((s, i) => `${i + 1}. ${s.name}`)
          .join("\n");

        let systemInstruction = `Você é um assistente de agendamento.
        
        O usuário está tentando escolher um dos seguintes serviços:
        ${serviceOptions}
        
        Com base na mensagem do usuário "${messageContent}", identifique qual serviço ele quer.
        Responda APENAS com o número do serviço (1, 2, 3, etc.) ou com o nome exato do serviço.
        Se não for possível identificar com certeza, responda "incerto".`;

        // Obter resposta do LLM
        const llmResponse = await getLLMResponse(
          systemInstruction,
          config.llmApiKey,
          businessId,
          false, // Não usar cache para esta detecção
        );

        logger.debug("LLM service identification response", {
          businessId,
          userPhone,
          llmResponse,
        });

        // Verificar se o LLM identificou um número
        const numberMatch = llmResponse.match(/^(\d+)$/);
        if (numberMatch) {
          const index = parseInt(numberMatch[1]) - 1;
          if (index >= 0 && index < services.length) {
            selectedService = services[index];
            logger.debug("Service selected via LLM (number)", {
              businessId,
              userPhone,
              serviceIndex: index,
              serviceName: selectedService.name,
            });
          }
        }
        // Verificar se o LLM identificou um nome de serviço
        else if (!llmResponse.toLowerCase().includes("incerto")) {
          // Procurar o nome do serviço na resposta
          for (const service of services) {
            if (
              llmResponse.toLowerCase().includes(service.name.toLowerCase())
            ) {
              selectedService = service;
              logger.debug("Service selected via LLM (name)", {
                businessId,
                userPhone,
                serviceName: service.name,
              });
              break;
            }
          }
        }
      } catch (llmError) {
        logger.error("Error using LLM for service identification", {
          error:
            llmError instanceof Error ? llmError.message : String(llmError),
          businessId,
          userPhone,
        });
        // Continuamos o fluxo mesmo com erro no LLM
      }
    }

    if (selectedService) {
      // Serviço identificado, salvar no contexto como um objeto independente
      // para evitar problemas de referência
      session.context_data.selected_service = JSON.parse(
        JSON.stringify(selectedService),
      );

      logger.info("Service selected successfully", {
        businessId,
        userPhone,
        serviceId: selectedService.service_id,
        serviceName: selectedService.name,
      });

      // Pedir a data desejada
      try {
        let systemInstruction = `${config.defaultPrompt}

        Você está ajudando o usuário a agendar um serviço de ${selectedService.name} na ${config.name}.
        O serviço selecionado custa R$ ${selectedService.price.toFixed(2)} e tem duração de ${selectedService.duration} minutos.
        
        Agora, você deve perguntar qual data o cliente deseja agendar, oferecendo opções dos próximos dias.
        Incentive o cliente a responder com formatos como "hoje", "amanhã", um dia da semana específico ou uma data como "dia 15/04".`;

        // Obter resposta do LLM
        const prompt = buildPrompt(
          systemInstruction,
          session.conversation_history,
          messageContent,
          config,
        );

        const response = await getLLMResponse(
          prompt,
          config.llmApiKey,
          businessId,
        );

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
        addMessageToHistory(
          session,
          "bot",
          response,
          config.maxHistoryMessages,
        );

        // Atualizar estado para coletar a data
        session.current_intent = Intent.SCHEDULING_COLLECT_DATE;

        // Salvar a sessão imediatamente
        await saveSession(
          businessId,
          userPhone,
          session,
          config.sessionTtlHours,
        );
      } catch (llmError) {
        logger.error("Error getting date request from LLM", {
          error:
            llmError instanceof Error ? llmError.message : String(llmError),
          businessId,
          userPhone,
        });

        // Fallback para mensagem simples
        const fallbackResponse = `Ótimo! Você escolheu o serviço ${selectedService.name} por R$ ${selectedService.price.toFixed(2)}, com duração de ${selectedService.duration} minutos.\n\nAgora, por favor, me informe qual data você prefere para o agendamento. Pode ser "hoje", "amanhã" ou uma data específica.`;

        await sendTextMessage(businessId, userPhone, fallbackResponse);

        // Adicionar ao histórico e registrar
        addMessageToHistory(
          session,
          "bot",
          fallbackResponse,
          config.maxHistoryMessages,
        );
        await logConversation(
          businessId,
          session.user_id || null,
          "bot",
          fallbackResponse,
          session.current_intent,
        );

        // Atualizar estado para coletar a data
        session.current_intent = Intent.SCHEDULING_COLLECT_DATE;

        // Salvar a sessão imediatamente
        await saveSession(
          businessId,
          userPhone,
          session,
          config.sessionTtlHours,
        );
      }
    } else {
      // Serviço não identificado, pedir novamente
      logger.warn("Service not identified, asking again", {
        businessId,
        userPhone,
        messageContent,
      });

      const serviceOptions = services
        .map(
          (service, index) =>
            `${index + 1}. ${service.name} (${service.duration} min): R$ ${service.price.toFixed(2)}`,
        )
        .join("\n");

      const response = `Desculpe, não consegui identificar qual serviço você deseja. Por favor, escolha uma das opções abaixo informando o número ou nome do serviço:\n\n${serviceOptions}`;

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

      // Manter o estado atual para tentar novamente
      await saveSession(businessId, userPhone, session, config.sessionTtlHours);
    }
  } catch (error) {
    logger.error("Critical error in collectServiceInfo", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      businessId,
      userPhone,
      messageContent,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao processar sua escolha de serviço. Vamos tentar novamente. Por favor, informe qual serviço você deseja agendar.",
    );

    // Tentar reiniciar o fluxo em caso de erro crítico
    try {
      return await startSchedulingFlow(
        businessId,
        userPhone,
        "agendar", // Mensagem genérica para iniciar
        session,
        config,
      );
    } catch (restartError) {
      logger.error("Failed to restart scheduling flow after error", {
        error:
          restartError instanceof Error
            ? restartError.message
            : String(restartError),
        businessId,
        userPhone,
      });

      // Último recurso: resetar estado
      session.current_intent = null;
      session.context_data = {};
      await saveSession(businessId, userPhone, session, config.sessionTtlHours);
    }
  }
}

/**
 * Coleta informações sobre a data desejada
 */
async function collectDateInfo(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    logger.info("Collecting date info", { businessId, userPhone });

    const selectedService = session.context_data.selected_service;

    if (!selectedService) {
      logger.warn("No service in context, restarting flow", {
        businessId,
        userPhone,
      });

      // Se não tiver serviço no contexto, reiniciar o fluxo
      return await startSchedulingFlow(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
    }

    // Construir prompt para o LLM interpretar a data
    let systemInstruction = `Você é um assistente especializado em extrair e interpretar datas em português.
    
    Analise a mensagem do usuário e identifique a data mencionada.
    Converta para o formato DD/MM/YYYY.
    
    Use a data de hoje (${new Date().toLocaleDateString("pt-BR")}) como referência para termos como "hoje", "amanhã", dias da semana, etc.
    
    Se não conseguir identificar uma data válida, responda "data não identificada".
    Se a data estiver no passado, responda "data no passado".`;

    // Obter resposta do LLM para interpretação da data
    const dateInterpretation = await getLLMResponse(
      `${systemInstruction}\n\nMensagem do usuário: ${messageContent}\n\nData identificada (DD/MM/YYYY):`,
      config.llmApiKey,
      businessId,
      false, // Não usar cache para esta interpretação
    );

    // Verificar se a data foi identificada corretamente
    if (
      dateInterpretation.includes("não identificada") ||
      dateInterpretation.includes("no passado")
    ) {
      logger.warn("Date not identified or in past", {
        businessId,
        userPhone,
        interpretation: dateInterpretation,
      });

      // Data não identificada ou no passado, pedir novamente
      const response = dateInterpretation.includes("no passado")
        ? "Desculpe, você parece ter selecionado uma data no passado. Por favor, escolha uma data futura para seu agendamento."
        : "Desculpe, não consegui identificar a data desejada. Por favor, informe uma data válida como 'hoje', 'amanhã', 'próxima segunda' ou uma data específica como '15/04'.";

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Manter o estado atual para tentar novamente
      return;
    }

    // Extrair a data do formato DD/MM/YYYY
    const dateMatch = dateInterpretation.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!dateMatch) {
      logger.warn("Date format not valid", {
        businessId,
        userPhone,
        dateInterpretation,
      });

      // Formato inválido, pedir novamente
      const response =
        "Desculpe, houve um problema ao processar a data. Por favor, tente novamente informando uma data como 'hoje', 'amanhã' ou uma data específica como '15/04'.";

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Manter o estado atual para tentar novamente
      return;
    }

    // Formatar a data para exibição (DD/MM/YYYY)
    // precisa ser no UTM do brasil
    const date = new Date(
      dateMatch[3] +
        "-" +
        dateMatch[2].padStart(2, "0") +
        "-" +
        dateMatch[1].padStart(2, "0") +
        "T00:00:00-03:00",
    );
    const formattedDate = `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;

    // Salvar a data no contexto
    session.context_data.selected_date = formattedDate;

    logger.info("Date selected", {
      businessId,
      userPhone,
      date: formattedDate,
    });

    // Verificar disponibilidade para a data
    const timeSlots = await checkAvailability(
      businessId,
      selectedService.service_id,
      new Date(formattedDate),
    );

    // Verificar se há horários disponíveis
    if (
      !timeSlots ||
      timeSlots.length === 0 ||
      !timeSlots.some((slot) => slot.available)
    ) {
      logger.warn("No available time slots", {
        businessId,
        userPhone,
        date: formattedDate,
      });

      // Não há horários disponíveis, sugerir outra data
      const response = `Desculpe, não temos horários disponíveis para ${selectedService.name} na data ${formattedDate}. Por favor, escolha outra data.`;

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);
      session;
      // Manter o estado atual para tentar novamente
      return;
    }

    // Formatar os horários disponíveis
    const availableTimeSlots = timeSlots
      .filter((slot) => slot.available)
      .map((slot) => slot.time)
      .join(", ");

    // Salvar os slots disponíveis no contexto
    session.context_data.available_time_slots = timeSlots;

    // Pedir o horário desejado
    systemInstruction = `${config.defaultPrompt}

    Você está ajudando o usuário a agendar um serviço de ${selectedService.name} na ${config.name}.
    A data selecionada foi ${formattedDate}.
    
    Agora, você deve perguntar qual horário o cliente deseja, oferecendo as seguintes opções disponíveis:
    ${availableTimeSlots}
    
    Peça ao cliente para escolher um dos horários listados acima.`;

    // Obter resposta do LLM
    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      messageContent,
      config,
    );

    const response = await getLLMResponse(prompt, config.llmApiKey, businessId);

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

    // Atualizar estado para coletar o horário
    session.current_intent = Intent.SCHEDULING_COLLECT_TIME;
  } catch (error) {
    logger.error("Error collecting date info", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao processar a data. Poderia tentar novamente informando outra data?",
    );

    // Manter o estado atual para tentar novamente
  }
}

/**
 * Coleta informações sobre o horário desejado
 */
async function collectTimeInfo(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    logger.info("Collecting time info", { businessId, userPhone });

    const selectedService = session.context_data.selected_service;
    const selectedDate = session.context_data.selected_date;
    const availableTimeSlots = session.context_data.available_time_slots || [];

    if (!selectedService || !selectedDate) {
      logger.warn("Missing context data, restarting flow", {
        businessId,
        userPhone,
        hasService: !!selectedService,
        hasDate: !!selectedDate,
      });

      // Se faltar dados no contexto, reiniciar o fluxo
      return await startSchedulingFlow(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
    }

    // Formatar a data para exibição (DD/MM/YYYY)
    const date = new Date(selectedDate);
    const formattedDate = `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;

    // Construir prompt para o LLM interpretar o horário
    let systemInstruction = `Você é um assistente especializado em extrair e interpretar horários em português.
    
    Analise a mensagem do usuário e identifique o horário mencionado.
    Converta para o formato HH:MM (24 horas).
    
    Os horários disponíveis são: ${availableTimeSlots
      .filter((slot) => slot.available)
      .map((slot) => slot.time)
      .join(", ")}
    
    Se não conseguir identificar um horário válido, responda "horário não identificado".
    Se o horário não estiver na lista de disponíveis, responda "horário não disponível".`;

    // Obter resposta do LLM para interpretação do horário
    const timeInterpretation = await getLLMResponse(
      `${systemInstruction}\n\nMensagem do usuário: ${messageContent}\n\nHorário identificado (HH:MM):`,
      config.llmApiKey,
      businessId,
      false, // Não usar cache para esta interpretação
    );

    console.log(
      JSON.stringify(
        {
          systemInstruction,
          messageContent,
          timeInterpretation,
        },
        null,
        2,
      ),
    );

    // Verificar se o horário foi identificado corretamente
    if (
      timeInterpretation.includes("não identificado") ||
      timeInterpretation.includes("não disponível")
    ) {
      logger.warn("Time not identified or not available", {
        businessId,
        userPhone,
        interpretation: timeInterpretation,
      });

      // Horário não identificado ou não disponível, pedir novamente
      const availableTimesFormatted = availableTimeSlots
        .filter((slot) => slot.available)
        .map((slot) => slot.time)
        .join(", ");

      const response = timeInterpretation.includes("não disponível")
        ? `Desculpe, o horário que você selecionou não está disponível. Por favor, escolha um dos seguintes horários disponíveis: ${availableTimesFormatted}`
        : `Desculpe, não consegui identificar o horário desejado. Por favor, escolha um dos seguintes horários disponíveis: ${availableTimesFormatted}`;

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Manter o estado atual para tentar novamente
      return;
    }

    // Extrair o horário do formato HH:MM
    const timeMatch = timeInterpretation.match(/(\d{1,2}):(\d{2})/);
    if (!timeMatch) {
      logger.warn("Time format not valid", {
        businessId,
        userPhone,
        timeInterpretation,
      });

      // Formato inválido, pedir novamente
      const availableTimesFormatted = availableTimeSlots
        .filter((slot) => slot.available)
        .map((slot) => slot.time)
        .join(", ");

      const response = `Desculpe, houve um problema ao processar o horário. Por favor, escolha um dos seguintes horários disponíveis: ${availableTimesFormatted}`;

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Manter o estado atual para tentar novamente
      return;
    }

    // Formatar o horário para HH:MM
    const hour = timeMatch[1].padStart(2, "0");
    const minute = timeMatch[2].padStart(2, "0");
    const formattedTime = `${hour}:${minute}`;

    // Verificar se o horário está disponível
    const isAvailable = availableTimeSlots.some(
      (slot) => slot.time === formattedTime && slot.available,
    );

    if (!isAvailable) {
      logger.warn("Selected time not available", {
        businessId,
        userPhone,
        time: formattedTime,
      });

      // Horário não disponível, pedir novamente
      const availableTimesFormatted = availableTimeSlots
        .filter((slot) => slot.available)
        .map((slot) => slot.time)
        .join(", ");

      const response = `Desculpe, o horário ${formattedTime} não está disponível para ${formattedDate}. Por favor, escolha um dos seguintes horários disponíveis: ${availableTimesFormatted}`;

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Manter o estado atual para tentar novamente
      return;
    }

    // Salvar o horário no contexto
    session.context_data.selected_time = formattedTime;

    logger.info("Time selected", {
      businessId,
      userPhone,
      time: formattedTime,
    });

    // Pedir confirmação
    systemInstruction = `${config.defaultPrompt}

    Você está ajudando o usuário a agendar um serviço na ${config.name}.
    
    Resumo do agendamento:
    - Serviço: ${selectedService.name}
    - Preço: R$ ${selectedService.price.toFixed(2)}
    - Duração: ${selectedService.duration} minutos
    - Data: ${formattedDate}
    - Horário: ${formattedTime}
    
    Agora, você deve confirmar se os dados estão corretos e pedir ao cliente para confirmar com "sim" ou "confirmar" para finalizar o agendamento.`;

    // Obter resposta do LLM
    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      messageContent,
      config,
    );

    const response = await getLLMResponse(prompt, config.llmApiKey, businessId);

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

    // Atualizar estado para confirmação
    session.current_intent = Intent.SCHEDULING_CONFIRM;
  } catch (error) {
    logger.error("Error collecting time info", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao processar o horário. Poderia tentar novamente informando outro horário?",
    );

    // Manter o estado atual para tentar novamente
  }
}

/**
 * Confirma o agendamento
 */
async function confirmScheduling(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    logger.info("Confirming scheduling", { businessId, userPhone });

    const selectedService = session.context_data.selected_service;
    const selectedDate = session.context_data.selected_date;
    const selectedTime = session.context_data.selected_time;

    if (!selectedService || !selectedDate || !selectedTime) {
      logger.warn("Missing context data for confirmation", {
        businessId,
        userPhone,
        hasService: !!selectedService,
        hasDate: !!selectedDate,
        hasTime: !!selectedTime,
      });

      // Se faltar dados no contexto, reiniciar o fluxo
      await sendTextMessage(
        businessId,
        userPhone,
        "Desculpe, parece que alguns dados do agendamento foram perdidos. Vamos reiniciar o processo.",
      );

      return await startSchedulingFlow(
        businessId,
        userPhone,
        messageContent,
        session,
        config,
      );
    }

    // Verificar se a mensagem do usuário é uma confirmação
    const confirmPattern =
      /(sim|confirmo|confirmado|pode ser|ok|s|claro|certo)/i;
    const cancelPattern =
      /(não|nao|cancela|cancelar|não quero|nao quero|desistir)/i;

    const isConfirm = confirmPattern.test(messageContent);
    const isCancel = cancelPattern.test(messageContent);

    if (isCancel) {
      logger.info("User cancelled scheduling", { businessId, userPhone });

      // Usuário cancelou o agendamento
      const response =
        "Agendamento cancelado. Se quiser agendar novamente, basta me avisar.";

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Resetar o estado
      session.current_intent = null;
      session.context_data = {};

      return;
    }

    if (!isConfirm) {
      logger.warn("Confirmation message not clear", {
        businessId,
        userPhone,
        message: messageContent,
      });

      // Mensagem não é uma confirmação clara, pedir novamente
      const response =
        "Desculpe, não entendi se você quer confirmar o agendamento. Por favor, responda com 'sim' para confirmar ou 'não' para cancelar.";

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Manter o estado atual para tentar novamente
      return;
    }

    // Formatar a data para exibição (DD/MM/YYYY)
    // precisa ser no UTM do brasil
    const date = new Date(selectedDate + "T" + selectedTime + ":00-03:00");
    const formattedDate = `${date.getDate().toString().padStart(2, "0")}/${(date.getMonth() + 1).toString().padStart(2, "0")}/${date.getFullYear()}`;

    // Fazer o agendamento
    const success = await bookAppointment(
      businessId,
      userPhone,
      selectedService.service_id,
      selectedDate,
      selectedTime,
    );

    if (!success) {
      logger.error("Failed to book appointment", {
        businessId,
        userPhone,
        service: selectedService.service_id,
        date: selectedDate,
        time: selectedTime,
      });

      // Falha ao agendar
      const response =
        "Desculpe, ocorreu um erro ao fazer seu agendamento. Por favor, tente novamente mais tarde ou entre em contato diretamente com a empresa.";

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Resetar o estado
      session.current_intent = null;

      return;
    }

    logger.info("Appointment booked successfully", {
      businessId,
      userPhone,
      service: selectedService.name,
      date: formattedDate,
      time: selectedTime,
    });

    // Agendamento concluído com sucesso
    let systemInstruction = `${config.defaultPrompt}

    O cliente acabou de confirmar um agendamento na ${config.name}. 
    
    Detalhes do agendamento:
    - Serviço: ${selectedService.name}
    - Preço: R$ ${selectedService.price.toFixed(2)}
    - Data: ${formattedDate}
    - Horário: ${selectedTime}
    
    Confirme o agendamento de forma amigável e profissional, incluindo todos os detalhes acima.
    Explique que ele pode cancelar ou reagendar enviando mensagens como "cancelar agendamento" ou "reagendar".
    Agradeça pelo agendamento.`;

    // Obter resposta do LLM
    const prompt = buildPrompt(
      systemInstruction,
      session.conversation_history,
      "Confirmado!",
      config,
    );

    const response = await getLLMResponse(prompt, config.llmApiKey, businessId);

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

    // Resetar o estado
    session.current_intent = null;
    session.context_data = {};
  } catch (error) {
    logger.error("Error confirming scheduling", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao confirmar seu agendamento. Por favor, tente novamente ou entre em contato diretamente com a empresa.",
    );

    // Resetar o estado em caso de erro
    session.current_intent = null;
  }
}

/**
 * Manipula solicitações de cancelamento de agendamentos
 */
async function handleCancellation(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    logger.info("Handling cancellation request", { businessId, userPhone });

    // Buscar agendamentos futuros
    const appointments = await getUpcomingAppointments(businessId, userPhone);

    if (!appointments || appointments.length === 0) {
      logger.info("No appointments to cancel", { businessId, userPhone });

      // Não há agendamentos para cancelar
      const response =
        "Você não possui nenhum agendamento futuro para cancelar. Posso ajudá-lo a agendar um novo horário?";

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Resetar o estado
      session.current_intent = null;

      return;
    }

    // Se a mensagem contém um número de agendamento
    const appointmentNumberMatch = messageContent.match(
      /(?:cancelar|cancelamento|desmarcar)[^\d]*(\d+)/i,
    );

    if (appointmentNumberMatch && appointmentNumberMatch[1]) {
      const appointmentIndex = parseInt(appointmentNumberMatch[1]) - 1;

      if (appointmentIndex >= 0 && appointmentIndex < appointments.length) {
        const appointmentToCancel = appointments[appointmentIndex];

        // Cancelar o agendamento
        const success = await cancelAppointment(
          appointmentToCancel.appointment_id,
        );

        if (!success) {
          logger.error("Failed to cancel appointment", {
            businessId,
            userPhone,
            appointmentId: appointmentToCancel.appointment_id,
          });

          // Falha ao cancelar
          const response =
            "Desculpe, ocorreu um erro ao cancelar seu agendamento. Por favor, tente novamente mais tarde ou entre em contato diretamente com a empresa.";

          await sendTextMessage(businessId, userPhone, response);

          // Adicionar resposta ao histórico
          addMessageToHistory(
            session,
            "bot",
            response,
            config.maxHistoryMessages,
          );

          // Resetar o estado
          session.current_intent = null;

          return;
        }

        logger.info("Appointment cancelled successfully", {
          businessId,
          userPhone,
          appointmentId: appointmentToCancel.appointment_id,
        });

        // Agendamento cancelado com sucesso
        const startTime = new Date(appointmentToCancel.start_time);
        const formattedDate = formatDate(startTime);
        const formattedTime = startTime.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });

        const response = `Seu agendamento foi cancelado com sucesso!\n\nDetalhes do agendamento cancelado:\n- Serviço: ${appointmentToCancel.service}\n- Data: ${formattedDate}\n- Horário: ${formattedTime}\n\nPosso ajudá-lo a agendar um novo horário?`;

        await sendTextMessage(businessId, userPhone, response);

        // Adicionar resposta ao histórico
        addMessageToHistory(
          session,
          "bot",
          response,
          config.maxHistoryMessages,
        );

        // Resetar o estado
        session.current_intent = null;

        return;
      }
    }

    // Se há apenas um agendamento, cancelar diretamente
    if (appointments.length === 1) {
      // Mostrar detalhes e pedir confirmação
      const appointment = appointments[0];
      const startTime = new Date(appointment.start_time);
      const formattedDate = formatDate(startTime);
      const formattedTime = startTime.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      // Salvar o agendamento no contexto para posterior cancelamento
      session.context_data.appointment_to_cancel = appointment;

      const response = `Você tem o seguinte agendamento:\n\n- Serviço: ${appointment.service}\n- Data: ${formattedDate}\n- Horário: ${formattedTime}\n\nDeseja realmente cancelar este agendamento? Responda com "sim" para confirmar ou "não" para manter o agendamento.`;

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      return;
    }

    // Se há múltiplos agendamentos, listar e pedir para escolher
    let message = "Você tem os seguintes agendamentos:\n\n";

    appointments.forEach((appointment, index) => {
      const startTime = new Date(appointment.start_time);
      const formattedDate = formatDate(startTime);
      const formattedTime = startTime.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      message += `${index + 1}. *${appointment.service}*\n`;
      message += `   Data: ${formattedDate}\n`;
      message += `   Horário: ${formattedTime}\n\n`;
    });

    message +=
      "Para cancelar, responda com o número do agendamento que deseja cancelar (exemplo: 'cancelar 1').";

    // Salvar a lista de agendamentos no contexto
    session.context_data.appointments = appointments;

    await sendTextMessage(businessId, userPhone, message);

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", message, config.maxHistoryMessages);
  } catch (error) {
    logger.error("Error handling cancellation", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, tive um problema ao processar seu pedido de cancelamento. Por favor, tente novamente ou entre em contato diretamente com a empresa.",
    );

    // Resetar o estado em caso de erro
    session.current_intent = null;
  }
}

/**
 * Verifica agendamentos futuros do cliente
 */
async function handleCheckAppointments(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    logger.info("Checking appointments", { businessId, userPhone });

    // Buscar agendamentos futuros
    const appointments = await getUpcomingAppointments(businessId, userPhone);

    if (!appointments || appointments.length === 0) {
      logger.info("No upcoming appointments", { businessId, userPhone });

      // Não há agendamentos futuros
      const response =
        "Você não possui nenhum agendamento futuro. Gostaria de agendar um serviço agora?";

      await sendTextMessage(businessId, userPhone, response);

      // Adicionar resposta ao histórico
      addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

      // Resetar o estado
      session.current_intent = null;

      return;
    }

    // Formatar lista de agendamentos
    let message = "Seus próximos agendamentos:\n\n";

    appointments.forEach((appointment, index) => {
      const startTime = new Date(appointment.start_time);
      const formattedDate = formatDate(startTime);
      const formattedTime = startTime.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      message += `${index + 1}. *${appointment.service}*\n`;
      message += `   Data: ${formattedDate}\n`;
      message += `   Horário: ${formattedTime}\n\n`;
    });

    message +=
      "Para cancelar ou reagendar, digite 'cancelar' ou 'reagendar' seguido do número do agendamento.";

    // Salvar os agendamentos no contexto para uso posterior
    session.context_data.appointments = appointments;

    await sendTextMessage(businessId, userPhone, message);

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", message, config.maxHistoryMessages);

    // Resetar o estado
    session.current_intent = null;
  } catch (error) {
    logger.error("Error checking appointments", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, ocorreu um erro ao verificar seus agendamentos. Por favor, tente novamente mais tarde.",
    );

    // Resetar o estado
    session.current_intent = null;
  }
}

/**
 * Manipula solicitações de reagendamento
 */
async function handleRescheduling(
  businessId: string,
  userPhone: string,
  messageContent: string,
  session: ConversationState,
  config: BusinessConfig,
): Promise<void> {
  try {
    logger.info("Handling rescheduling request", { businessId, userPhone });

    // Por enquanto, simplificar o reagendamento como um cancelamento seguido de novo agendamento
    const response =
      "Para reagendar, é necessário cancelar o agendamento atual e fazer um novo. Gostaria que eu te ajudasse a cancelar o agendamento atual?";

    await sendTextMessage(businessId, userPhone, response);

    // Adicionar resposta ao histórico
    addMessageToHistory(session, "bot", response, config.maxHistoryMessages);

    // Resetar o estado
    session.current_intent = null;
  } catch (error) {
    logger.error("Error handling rescheduling", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    await sendTextMessage(
      businessId,
      userPhone,
      "Desculpe, ocorreu um erro ao processar seu pedido de reagendamento. Por favor, tente novamente mais tarde.",
    );

    // Resetar o estado
    session.current_intent = null;
  }
}

function validateConversationState(session: ConversationState): boolean {
  if (!session) return false;

  // Verificar se o histórico de conversa é um array
  if (!Array.isArray(session.conversation_history)) {
    session.conversation_history = [];
  }

  // Verificar se context_data existe
  if (!session.context_data) {
    session.context_data = {};
  }

  return true;
}

// 4. Função de logging melhorada para depuração
function logSessionState(
  businessId: string,
  userPhone: string,
  session: ConversationState,
  stage: string,
): void {
  try {
    const contextSummary = {
      current_intent: session.current_intent,
      has_service: !!session.context_data?.selected_service,
      has_date: !!session.context_data?.selected_date,
      has_time: !!session.context_data?.selected_time,
      history_length: session.conversation_history?.length || 0,
    };

    logger.debug(`Session state at ${stage}`, {
      businessId,
      userPhone,
      state: contextSummary,
    });
  } catch (error) {
    // Ignore logging errors
    logger.warn("Error in debug logging", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Importar supabaseClient para uso neste arquivo
import supabaseClient from "./supabaseClient";

export default {
  handleIncomingMessage,
};
