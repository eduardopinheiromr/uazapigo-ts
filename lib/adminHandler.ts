// lib/adminHandler.ts

import { Intent, parseAdminCommand } from "./intentDetector";
import { sendTextMessage } from "./uazapiGoClient";
import supabaseClient from "./supabaseClient";
import { getCache, setCache, deleteCache } from "./redisClient";
import logger from "./logger";
import { getBusinessConfig } from "./utils";

/**
 * Estado da conversa administrativa
 */
interface AdminConversationState {
  currentIntent?: Intent;
  waitingForInput?: boolean;
  lastCommand?: string;
  lastTimestamp?: number;
  pendingChanges?: any;
  serviceToUpdate?: any;
  step?: string;
}

/**
 * Estado da conversa administrativa
 */
interface AdminConversationState {
  currentIntent?: Intent;
  waitingForInput?: boolean;
  lastCommand?: string;
  lastTimestamp?: number;
  pendingChanges?: any;
  serviceToUpdate?: any;
  services?: any[]; // Adicionado para corrigir o erro
  businessHours?: any; // Adicionado para corrigir o erro
  day?: string; // Adicionado para corrigir o erro
  startTime?: string; // Adicionado para corrigir o erro
  step?: string;
  activate?: boolean;
}

/**
 * Processa comandos administrativos
 */
export async function handleAdminCommand(
  businessId: string,
  phone: string,
  text: string,
  intent: Intent,
  business: any,
): Promise<boolean> {
  try {
    logger.info("Processing admin command", {
      businessId,
      phone,
      intent,
    });

    // Obter o estado atual da conversa administrativa
    const stateKey = `admin_state:${businessId}:${phone}`;
    const state = (await getCache<AdminConversationState>(stateKey)) || {};

    // Se estiver esperando por input, continuamos o comando anterior
    if (state.waitingForInput && state.currentIntent) {
      logger.debug("Continuing previous admin command", {
        businessId,
        phone,
        currentIntent: state.currentIntent,
      });

      return await continueAdminCommand(
        businessId,
        phone,
        text,
        state,
        business,
      );
    }

    // Processar novo comando com base na intenção
    switch (intent) {
      case Intent.ADMIN_SHOW_HELP:
        await showAdminHelp(businessId, phone);
        return true;

      case Intent.ADMIN_VIEW_PROMPT:
        await viewCurrentPrompt(businessId, phone, business);
        return true;

      case Intent.ADMIN_UPDATE_PROMPT:
        return await startPromptUpdate(businessId, phone, text, business);

      case Intent.ADMIN_SHOW_SERVICES:
        await handleAdminShowServices(businessId, phone);
        return true;

      case Intent.ADMIN_ADD_SERVICE:
        return await startAddService(businessId, phone, text);

      case Intent.ADMIN_UPDATE_SERVICE:
        return await startUpdateService(businessId, phone, text);

      case Intent.ADMIN_TOGGLE_SERVICE:
        return await toggleService(businessId, phone, text);

      case Intent.ADMIN_TOGGLE_RAG:
        return await toggleRag(businessId, phone, text, business);

      case Intent.ADMIN_SHOW_BUSINESS_HOURS:
        await showBusinessHours(businessId, phone, business);
        return true;

      case Intent.ADMIN_UPDATE_BUSINESS_HOURS:
        return await startUpdateBusinessHours(businessId, phone, text);

      case Intent.ADMIN_BLOCK_SCHEDULE:
        return await startBlockSchedule(businessId, phone, text);

      case Intent.ADMIN_VIEW_SCHEDULE_BLOCKS:
        await viewScheduleBlocks(businessId, phone);
        return true;

      case Intent.ADMIN_VIEW_STATS:
        await viewStats(businessId, phone);
        return true;

      default:
        // Não é um comando admin que sabemos processar
        logger.debug("Not a recognized admin command", { intent, text });
        return false;
    }
  } catch (error) {
    logger.error("Error processing admin command", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
      text,
      intent,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
    );
    return true;
  }
}

/**
 * Continua um comando administrativo em andamento
 */
async function continueAdminCommand(
  businessId: string,
  phone: string,
  text: string,
  state: AdminConversationState,
  business: any,
): Promise<boolean> {
  const intent = state.currentIntent;

  if (!intent) return false;

  switch (intent) {
    case Intent.ADMIN_UPDATE_PROMPT:
      return await completePromptUpdate(businessId, phone, text, business);

    case Intent.ADMIN_ADD_SERVICE:
      return await continueAddService(businessId, phone, text, state);

    case Intent.ADMIN_UPDATE_SERVICE:
      return await continueUpdateService(businessId, phone, text, state);

    case Intent.ADMIN_UPDATE_BUSINESS_HOURS:
      return await continueUpdateBusinessHours(businessId, phone, text, state);

    case Intent.ADMIN_BLOCK_SCHEDULE:
      return await continueBlockSchedule(businessId, phone, text, state);

    default:
      // Resetar o estado se não soubermos como continuar
      await setCache(`admin_state:${businessId}:${phone}`, {});
      logger.warn("Unknown state for admin command continuation", {
        businessId,
        phone,
        intent,
      });
      return false;
  }
}

/**
 * Mostra a ajuda administrativa
 */
async function showAdminHelp(businessId: string, phone: string): Promise<void> {
  logger.info("Showing admin help", { businessId, phone });

  const helpMessage = `*Comandos Administrativos*

*Configurações Gerais:*
• "mostrar prompt" - Ver o prompt atual
• "atualizar prompt: [novo prompt]" - Atualizar o prompt base

*Serviços:*
• "mostrar serviços" - Listar serviços
• "adicionar serviço" - Adicionar novo serviço
• "atualizar serviço" - Modificar serviço existente
• "ativar serviço: [nome]" - Ativar um serviço
• "desativar serviço: [nome]" - Desativar um serviço

*Conhecimento (RAG):*
• "ativar rag" - Ativar RAG
• "desativar rag" - Desativar RAG

*Horários:*
• "mostrar horários" - Ver horários de funcionamento
• "atualizar horários" - Modificar horários de funcionamento

*Agenda:*
• "bloquear agenda" - Criar bloqueio na agenda
• "ver bloqueios" - Listar bloqueios de agenda

*Relatórios:*
• "estatísticas" - Ver estatísticas gerais

Para mais informações sobre qualquer comando, digite "ajuda [comando]".`;

  await sendTextMessage(businessId, phone, helpMessage);

  // Não precisamos manter estado para este comando
}

/**
 * Mostra o prompt atual
 */
async function viewCurrentPrompt(
  businessId: string,
  phone: string,
  business: any,
): Promise<void> {
  logger.info("Viewing current prompt", { businessId, phone });

  const config = business.config || {};
  const currentPrompt = config.defaultPrompt || "Não há prompt configurado.";

  const message = `*Prompt Atual:*\n\n${currentPrompt}\n\nPara atualizar, envie "atualizar prompt: [novo texto]"`;

  await sendTextMessage(businessId, phone, message);
}

/**
 * Inicia o processo de atualização do prompt
 */
async function startPromptUpdate(
  businessId: string,
  phone: string,
  text: string,
  business: any,
): Promise<boolean> {
  logger.info("Starting prompt update", { businessId, phone });

  // Tentar extrair o novo prompt diretamente do comando
  const params = parseAdminCommand(text, Intent.ADMIN_UPDATE_PROMPT);

  // Se conseguimos extrair o prompt, atualizá-lo imediatamente
  if (params && params.newPrompt && !params.needMoreInfo) {
    logger.debug("Prompt extracted from command", { businessId, phone });
    return await completePromptUpdate(
      businessId,
      phone,
      params.newPrompt,
      business,
    );
  }

  // Caso contrário, solicitar o novo prompt
  const message = `*Atualizar Prompt*\n\nPor favor, envie o novo prompt base completo para o chatbot. Este texto definirá a personalidade e o comportamento do assistente.`;

  await sendTextMessage(businessId, phone, message);

  // Salvar o estado atual para continuar no próximo comando
  await setCache(`admin_state:${businessId}:${phone}`, {
    currentIntent: Intent.ADMIN_UPDATE_PROMPT,
    waitingForInput: true,
    lastCommand: text,
    lastTimestamp: Date.now(),
  });

  logger.debug("Waiting for new prompt input", { businessId, phone });

  // Comando foi processado
  return true;
}

/**
 * Finaliza a atualização do prompt
 */
async function completePromptUpdate(
  businessId: string,
  phone: string,
  newPrompt: string,
  business: any,
): Promise<boolean> {
  try {
    logger.info("Completing prompt update", { businessId, phone });

    // Validar o novo prompt
    if (!newPrompt || newPrompt.length < 10) {
      logger.warn("Prompt too short", {
        businessId,
        phone,
        promptLength: newPrompt?.length,
      });

      await sendTextMessage(
        businessId,
        phone,
        "O prompt é muito curto. Por favor, forneça um prompt mais detalhado (pelo menos 10 caracteres).",
      );
      return true;
    }

    // Obter a configuração atual
    const config = business.config || {};

    // Atualizar o prompt no banco de dados
    const { error } = await supabaseClient
      .from("businesses")
      .update({
        config: {
          ...config,
          defaultPrompt: newPrompt,
        },
      })
      .eq("business_id", businessId);

    if (error) {
      logger.error("Error updating prompt in database", {
        error,
        businessId,
        phone,
      });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao atualizar o prompt. Por favor, tente novamente.",
      );
      return true;
    }

    logger.info("Prompt updated successfully", { businessId, phone });

    // Invalidar o cache de configuração do negócio
    await deleteCache(`business_config:${businessId}`);

    // Confirmar atualização
    await sendTextMessage(
      businessId,
      phone,
      "✅ Prompt atualizado com sucesso!\n\nO novo comportamento do chatbot já está em vigor para todas as conversas.",
    );

    // Resetar o estado
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  } catch (error) {
    logger.error("Error completing prompt update", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao atualizar o prompt. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Mostra os serviços cadastrados
 */
async function handleAdminShowServices(
  businessId: string,
  phone: string,
): Promise<void> {
  try {
    logger.info("Showing services", { businessId, phone });

    // Buscar serviços do banco de dados
    const { data: services, error } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .order("name");

    if (error) {
      logger.error("Error fetching services", { error, businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao buscar os serviços. Por favor, tente novamente.",
      );
      return;
    }

    if (!services || services.length === 0) {
      logger.info("No services found", { businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Não há serviços cadastrados ainda. Use o comando 'adicionar serviço' para cadastrar um novo serviço.",
      );
      return;
    }

    // Formatar lista de serviços
    let message = "*Serviços Cadastrados*\n\n";

    services.forEach((service, index) => {
      const status = service.active ? "✅ Ativo" : "❌ Inativo";
      message += `${index + 1}. *${service.name}* - ${status}\n`;
      message += `   Duração: ${service.duration} min\n`;
      message += `   Preço: R$ ${service.price.toFixed(2)}\n`;
      if (service.description) {
        message += `   Descrição: ${service.description}\n`;
      }
      message += "\n";
    });

    message +=
      "Para adicionar um serviço, envie 'adicionar serviço'.\nPara atualizar um serviço, envie 'atualizar serviço'.";

    await sendTextMessage(businessId, phone, message);
  } catch (error) {
    logger.error("Error in handleAdminShowServices", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
    );
  }
}

/**
 * Inicia o processo de adição de serviço
 */
async function startAddService(
  businessId: string,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    logger.info("Starting add service", { businessId, phone });

    // Tentar extrair os detalhes do serviço do comando
    const params = parseAdminCommand(text, Intent.ADMIN_ADD_SERVICE);

    // Se já temos todos os dados, criar o serviço
    if (
      params &&
      params.serviceName &&
      params.servicePrice !== undefined &&
      params.serviceDuration !== undefined &&
      !params.needMoreInfo
    ) {
      // Criar o serviço
      const { error } = await supabaseClient.from("services").insert({
        business_id: businessId,
        name: params.serviceName,
        price: params.servicePrice,
        duration: params.serviceDuration,
        description: params.serviceDescription || "",
        active: true,
      });

      if (error) {
        logger.error("Error creating service", { error, businessId, phone });

        await sendTextMessage(
          businessId,
          phone,
          "Ocorreu um erro ao criar o serviço. Por favor, tente novamente.",
        );
        return true;
      }

      logger.info("Service created successfully", {
        businessId,
        phone,
        serviceName: params.serviceName,
      });

      // Confirmar criação
      await sendTextMessage(
        businessId,
        phone,
        `✅ Serviço *${params.serviceName}* criado com sucesso!\n\nDetalhes:\n- Preço: R$ ${params.servicePrice.toFixed(2)}\n- Duração: ${params.serviceDuration} minutos${params.serviceDescription ? `\n- Descrição: ${params.serviceDescription}` : ""}`,
      );

      return true;
    }

    // Iniciar o fluxo de coleta de dados
    const message = `*Adicionar Serviço*\n\nVamos adicionar um novo serviço. Por favor, informe o nome do serviço:`;

    await sendTextMessage(businessId, phone, message);

    // Salvar o estado atual para continuar no próximo comando
    await setCache(`admin_state:${businessId}:${phone}`, {
      currentIntent: Intent.ADMIN_ADD_SERVICE,
      waitingForInput: true,
      lastCommand: text,
      lastTimestamp: Date.now(),
      step: "name",
      pendingChanges: {},
    });

    logger.debug("Waiting for service name input", { businessId, phone });

    // Comando foi processado
    return true;
  } catch (error) {
    logger.error("Error starting add service", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao iniciar a adição de serviço. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Continua o processo de adição de serviço
 */
async function continueAddService(
  businessId: string,
  phone: string,
  text: string,
  state: AdminConversationState,
): Promise<boolean> {
  try {
    const pendingChanges = state.pendingChanges || {};
    const step = state.step || "name";

    logger.debug("Continuing add service", {
      businessId,
      phone,
      step,
      pendingChanges,
    });

    // Processar entrada conforme o passo atual
    switch (step) {
      case "name":
        // Validar e salvar o nome
        if (!text || text.trim().length < 3) {
          await sendTextMessage(
            businessId,
            phone,
            "O nome do serviço é muito curto. Por favor, informe um nome válido com pelo menos 3 caracteres:",
          );
          return true;
        }

        pendingChanges.name = text.trim();

        // Perguntar o preço
        await sendTextMessage(
          businessId,
          phone,
          `Nome: *${pendingChanges.name}*\n\nAgora, informe o preço do serviço em reais (apenas números, ex: 35.90):`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "price",
          pendingChanges,
        });
        return true;

      case "price":
        // Validar e salvar o preço
        const priceMatch = text.match(/(\d+(?:[.,]\d{1,2})?)/);
        if (!priceMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Preço inválido. Por favor, informe apenas o valor numérico (ex: 35.90):",
          );
          return true;
        }

        const price = parseFloat(priceMatch[1].replace(",", "."));
        pendingChanges.price = price;

        // Perguntar a duração
        await sendTextMessage(
          businessId,
          phone,
          `Nome: *${pendingChanges.name}*\nPreço: R$ ${price.toFixed(2)}\n\nAgora, informe a duração do serviço em minutos (apenas números, ex: 30):`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "duration",
          pendingChanges,
        });
        return true;

      case "duration":
        // Validar e salvar a duração
        const durationMatch = text.match(/(\d+)/);
        if (!durationMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Duração inválida. Por favor, informe apenas o número de minutos (ex: 30):",
          );
          return true;
        }

        const duration = parseInt(durationMatch[1]);
        pendingChanges.duration = duration;

        // Perguntar a descrição
        await sendTextMessage(
          businessId,
          phone,
          `Nome: *${pendingChanges.name}*\nPreço: R$ ${pendingChanges.price.toFixed(2)}\nDuração: ${duration} minutos\n\nPor último, informe uma descrição para o serviço (opcional):`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "description",
          pendingChanges,
        });
        return true;

      case "description":
        // Salvar a descrição
        pendingChanges.description = text.trim();

        // Criar o serviço
        const { error } = await supabaseClient.from("services").insert({
          business_id: businessId,
          name: pendingChanges.name,
          price: pendingChanges.price,
          duration: pendingChanges.duration,
          description: pendingChanges.description || "",
          active: true,
        });

        if (error) {
          logger.error("Error creating service", { error, businessId, phone });

          await sendTextMessage(
            businessId,
            phone,
            "Ocorreu um erro ao criar o serviço. Por favor, tente novamente.",
          );

          // Resetar o estado
          await setCache(`admin_state:${businessId}:${phone}`, {});
          return true;
        }

        logger.info("Service created successfully", {
          businessId,
          phone,
          serviceName: pendingChanges.name,
        });

        // Confirmar criação
        await sendTextMessage(
          businessId,
          phone,
          `✅ Serviço *${pendingChanges.name}* criado com sucesso!\n\nDetalhes:\n- Preço: R$ ${pendingChanges.price.toFixed(2)}\n- Duração: ${pendingChanges.duration} minutos${pendingChanges.description ? `\n- Descrição: ${pendingChanges.description}` : ""}`,
        );

        // Resetar o estado
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return true;

      default:
        // Resetar o estado se o passo não for reconhecido
        logger.warn("Unknown step in add service", { businessId, phone, step });
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return false;
    }
  } catch (error) {
    logger.error("Error continuing add service", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao processar sua entrada. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Inicia o processo de atualização de serviço
 */
async function startUpdateService(
  businessId: string,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    logger.info("Starting update service", { businessId, phone });

    // Buscar serviços do banco de dados
    const { data: services, error } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .order("name");

    if (error) {
      logger.error("Error fetching services", { error, businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao buscar os serviços. Por favor, tente novamente.",
      );
      return true;
    }

    if (!services || services.length === 0) {
      logger.info("No services found for update", { businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Não há serviços cadastrados para atualizar. Use o comando 'adicionar serviço' para cadastrar um novo serviço.",
      );
      return true;
    }

    // Formatar lista de serviços
    let message =
      "*Atualizar Serviço*\n\nSelecione o serviço que deseja atualizar:\n\n";

    services.forEach((service, index) => {
      message += `${index + 1}. *${service.name}*\n`;
    });

    message += "\nResponda com o número do serviço que deseja atualizar:";

    await sendTextMessage(businessId, phone, message);

    // Salvar o estado atual para continuar no próximo comando
    await setCache(`admin_state:${businessId}:${phone}`, {
      currentIntent: Intent.ADMIN_UPDATE_SERVICE,
      waitingForInput: true,
      lastCommand: text,
      lastTimestamp: Date.now(),
      step: "select_service",
      pendingChanges: {},
      services,
    });

    logger.debug("Waiting for service selection", { businessId, phone });

    // Comando foi processado
    return true;
  } catch (error) {
    logger.error("Error starting update service", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao iniciar a atualização de serviço. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Continua o processo de atualização de serviço
 */
async function continueUpdateService(
  businessId: string,
  phone: string,
  text: string,
  state: AdminConversationState,
): Promise<boolean> {
  try {
    const pendingChanges = state.pendingChanges || {};
    const step = state.step || "select_service";
    const services = state.services || [];
    const serviceToUpdate = state.serviceToUpdate;

    logger.debug("Continuing update service", {
      businessId,
      phone,
      step,
      pendingChanges,
    });

    // Processar entrada conforme o passo atual
    switch (step) {
      case "select_service":
        // Validar e selecionar o serviço
        const serviceIndexMatch = text.match(/^(\d+)$/);
        if (
          !serviceIndexMatch ||
          !services[parseInt(serviceIndexMatch[1]) - 1]
        ) {
          await sendTextMessage(
            businessId,
            phone,
            "Seleção inválida. Por favor, informe o número do serviço que deseja atualizar:",
          );
          return true;
        }

        const serviceIndex = parseInt(serviceIndexMatch[1]) - 1;
        const selectedService = services[serviceIndex];

        // Perguntar o que deseja atualizar
        await sendTextMessage(
          businessId,
          phone,
          `Serviço selecionado: *${selectedService.name}*\n\nO que você deseja atualizar?\n\n1. Nome\n2. Preço\n3. Duração\n4. Descrição\n5. Status (ativar/desativar)\n\nResponda com o número da opção desejada:`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "select_field",
          serviceToUpdate: selectedService,
        });
        return true;

      case "select_field":
        // Validar e selecionar o campo
        const fieldIndexMatch = text.match(/^(\d+)$/);
        if (
          !fieldIndexMatch ||
          parseInt(fieldIndexMatch[1]) < 1 ||
          parseInt(fieldIndexMatch[1]) > 5
        ) {
          await sendTextMessage(
            businessId,
            phone,
            "Seleção inválida. Por favor, informe o número da opção desejada (1-5):",
          );
          return true;
        }

        const fieldIndex = parseInt(fieldIndexMatch[1]);
        let nextStep = "";
        let promptMessage = "";

        switch (fieldIndex) {
          case 1: // Nome
            nextStep = "update_name";
            promptMessage = `Nome atual: *${serviceToUpdate.name}*\n\nInforme o novo nome do serviço:`;
            break;
          case 2: // Preço
            nextStep = "update_price";
            promptMessage = `Preço atual: R$ ${serviceToUpdate.price.toFixed(2)}\n\nInforme o novo preço do serviço (apenas números, ex: 35.90):`;
            break;
          case 3: // Duração
            nextStep = "update_duration";
            promptMessage = `Duração atual: ${serviceToUpdate.duration} minutos\n\nInforme a nova duração do serviço em minutos (apenas números, ex: 30):`;
            break;
          case 4: // Descrição
            nextStep = "update_description";
            promptMessage = `Descrição atual: ${serviceToUpdate.description || "(sem descrição)"}\n\nInforme a nova descrição do serviço:`;
            break;
          case 5: // Status
            nextStep = "update_status";
            promptMessage = `Status atual: ${serviceToUpdate.active ? "✅ Ativo" : "❌ Inativo"}\n\nDeseja ${serviceToUpdate.active ? "desativar" : "ativar"} este serviço? Responda com "sim" ou "não":`;
            break;
        }

        await sendTextMessage(businessId, phone, promptMessage);

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: nextStep,
        });
        return true;

      case "update_name":
        // Validar e atualizar o nome
        if (!text || text.trim().length < 3) {
          await sendTextMessage(
            businessId,
            phone,
            "O nome do serviço é muito curto. Por favor, informe um nome válido com pelo menos 3 caracteres:",
          );
          return true;
        }

        // Atualizar o serviço
        const { error: nameError } = await supabaseClient
          .from("services")
          .update({ name: text.trim() })
          .eq("service_id", serviceToUpdate.service_id);

        if (nameError) {
          logger.error("Error updating service name", {
            error: nameError,
            businessId,
            phone,
          });

          await sendTextMessage(
            businessId,
            phone,
            "Ocorreu um erro ao atualizar o nome do serviço. Por favor, tente novamente.",
          );

          // Resetar o estado
          await setCache(`admin_state:${businessId}:${phone}`, {});
          return true;
        }

        logger.info("Service name updated successfully", {
          businessId,
          phone,
          serviceId: serviceToUpdate.service_id,
          oldName: serviceToUpdate.name,
          newName: text.trim(),
        });

        // Confirmar atualização
        await sendTextMessage(
          businessId,
          phone,
          `✅ Nome do serviço atualizado com sucesso!\n\nNome anterior: ${serviceToUpdate.name}\nNovo nome: ${text.trim()}`,
        );

        // Resetar o estado
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return true;

      case "update_price":
        // Validar e atualizar o preço
        const priceMatch = text.match(/(\d+(?:[.,]\d{1,2})?)/);
        if (!priceMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Preço inválido. Por favor, informe apenas o valor numérico (ex: 35.90):",
          );
          return true;
        }

        const price = parseFloat(priceMatch[1].replace(",", "."));

        // Atualizar o serviço
        const { error: priceError } = await supabaseClient
          .from("services")
          .update({ price })
          .eq("service_id", serviceToUpdate.service_id);

        if (priceError) {
          logger.error("Error updating service price", {
            error: priceError,
            businessId,
            phone,
          });

          await sendTextMessage(
            businessId,
            phone,
            "Ocorreu um erro ao atualizar o preço do serviço. Por favor, tente novamente.",
          );

          // Resetar o estado
          await setCache(`admin_state:${businessId}:${phone}`, {});
          return true;
        }

        logger.info("Service price updated successfully", {
          businessId,
          phone,
          serviceId: serviceToUpdate.service_id,
          oldPrice: serviceToUpdate.price,
          newPrice: price,
        });

        // Confirmar atualização
        await sendTextMessage(
          businessId,
          phone,
          `✅ Preço do serviço atualizado com sucesso!\n\nPreço anterior: R$ ${serviceToUpdate.price.toFixed(2)}\nNovo preço: R$ ${price.toFixed(2)}`,
        );

        // Resetar o estado
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return true;

      case "update_duration":
        // Validar e atualizar a duração
        const durationMatch = text.match(/(\d+)/);
        if (!durationMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Duração inválida. Por favor, informe apenas o número de minutos (ex: 30):",
          );
          return true;
        }

        const duration = parseInt(durationMatch[1]);

        // Atualizar o serviço
        const { error: durationError } = await supabaseClient
          .from("services")
          .update({ duration })
          .eq("service_id", serviceToUpdate.service_id);

        if (durationError) {
          logger.error("Error updating service duration", {
            error: durationError,
            businessId,
            phone,
          });

          await sendTextMessage(
            businessId,
            phone,
            "Ocorreu um erro ao atualizar a duração do serviço. Por favor, tente novamente.",
          );

          // Resetar o estado
          await setCache(`admin_state:${businessId}:${phone}`, {});
          return true;
        }

        logger.info("Service duration updated successfully", {
          businessId,
          phone,
          serviceId: serviceToUpdate.service_id,
          oldDuration: serviceToUpdate.duration,
          newDuration: duration,
        });

        // Confirmar atualização
        await sendTextMessage(
          businessId,
          phone,
          `✅ Duração do serviço atualizada com sucesso!\n\nDuração anterior: ${serviceToUpdate.duration} minutos\nNova duração: ${duration} minutos`,
        );

        // Resetar o estado
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return true;

      case "update_description":
        // Atualizar a descrição
        const { error: descriptionError } = await supabaseClient
          .from("services")
          .update({ description: text.trim() })
          .eq("service_id", serviceToUpdate.service_id);

        if (descriptionError) {
          logger.error("Error updating service description", {
            error: descriptionError,
            businessId,
            phone,
          });

          await sendTextMessage(
            businessId,
            phone,
            "Ocorreu um erro ao atualizar a descrição do serviço. Por favor, tente novamente.",
          );

          // Resetar o estado
          await setCache(`admin_state:${businessId}:${phone}`, {});
          return true;
        }

        logger.info("Service description updated successfully", {
          businessId,
          phone,
          serviceId: serviceToUpdate.service_id,
        });

        // Confirmar atualização
        await sendTextMessage(
          businessId,
          phone,
          `✅ Descrição do serviço atualizada com sucesso!\n\nDescrição anterior: ${serviceToUpdate.description || "(sem descrição)"}\nNova descrição: ${text.trim()}`,
        );

        // Resetar o estado
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return true;

      case "update_status":
        // Validar e atualizar o status
        const confirmPattern = /(sim|s|confirmar|confirmo|yes|y)/i;
        const isConfirm = confirmPattern.test(text);

        if (!isConfirm) {
          await sendTextMessage(
            businessId,
            phone,
            "Operação cancelada. O status do serviço não foi alterado.",
          );

          // Resetar o estado
          await setCache(`admin_state:${businessId}:${phone}`, {});
          return true;
        }

        // Inverter o status atual
        const newStatus = !serviceToUpdate.active;

        // Atualizar o serviço
        const { error: statusError } = await supabaseClient
          .from("services")
          .update({ active: newStatus })
          .eq("service_id", serviceToUpdate.service_id);

        if (statusError) {
          logger.error("Error updating service status", {
            error: statusError,
            businessId,
            phone,
          });

          await sendTextMessage(
            businessId,
            phone,
            "Ocorreu um erro ao atualizar o status do serviço. Por favor, tente novamente.",
          );

          // Resetar o estado
          await setCache(`admin_state:${businessId}:${phone}`, {});
          return true;
        }

        logger.info("Service status updated successfully", {
          businessId,
          phone,
          serviceId: serviceToUpdate.service_id,
          oldStatus: serviceToUpdate.active,
          newStatus,
        });

        // Confirmar atualização
        await sendTextMessage(
          businessId,
          phone,
          `✅ Status do serviço atualizado com sucesso!\n\nServiço: ${serviceToUpdate.name}\nNovo status: ${newStatus ? "✅ Ativo" : "❌ Inativo"}`,
        );

        // Resetar o estado
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return true;

      default:
        // Resetar o estado se o passo não for reconhecido
        logger.warn("Unknown step in update service", {
          businessId,
          phone,
          step,
        });
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return false;
    }
  } catch (error) {
    logger.error("Error continuing update service", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao processar sua entrada. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Ativa ou desativa um serviço
 */
async function toggleService(
  businessId: string,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    logger.info("Toggling service status", { businessId, phone });

    // Extrair parâmetros do comando
    const params = parseAdminCommand(text, Intent.ADMIN_TOGGLE_SERVICE);

    if (!params || !params.serviceName || params.needMoreInfo) {
      logger.warn("Missing service name for toggle", { businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Por favor, informe o nome do serviço que deseja ativar/desativar. Exemplo: 'ativar serviço: Corte de Cabelo'",
      );
      return true;
    }

    // Verificar se o serviço deve ser ativado ou desativado
    const activate =
      params.serviceActive !== undefined
        ? params.serviceActive
        : text.toLowerCase().includes("ativar");

    // Buscar o serviço pelo nome
    const { data: services, error: searchError } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .ilike("name", `%${params.serviceName}%`);

    if (searchError) {
      logger.error("Error searching for service", {
        error: searchError,
        businessId,
        phone,
      });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao buscar o serviço. Por favor, tente novamente.",
      );
      return true;
    }

    if (!services || services.length === 0) {
      logger.warn("Service not found for toggle", {
        businessId,
        phone,
        serviceName: params.serviceName,
      });

      await sendTextMessage(
        businessId,
        phone,
        `Não foi encontrado nenhum serviço com o nome "${params.serviceName}". Use o comando "mostrar serviços" para ver os serviços disponíveis.`,
      );
      return true;
    }

    if (services.length > 1) {
      // Múltiplos serviços encontrados, perguntar qual específico
      let message = `Encontrei múltiplos serviços com esse nome. Qual deles você deseja ${activate ? "ativar" : "desativar"}?\n\n`;

      services.forEach((service, index) => {
        const status = service.active ? "✅ Ativo" : "❌ Inativo";
        message += `${index + 1}. *${service.name}* - ${status}\n`;
      });

      message += "\nResponda com o número do serviço desejado:";

      await sendTextMessage(businessId, phone, message);

      // Salvar o estado atual para continuar
      await setCache(`admin_state:${businessId}:${phone}`, {
        currentIntent: Intent.ADMIN_TOGGLE_SERVICE,
        waitingForInput: true,
        lastCommand: text,
        lastTimestamp: Date.now(),
        step: "select_service",
        services,
        activate,
      });

      return true;
    }

    // Um único serviço encontrado, atualizar status
    const service = services[0];

    // Se o serviço já está no estado desejado, informar
    if (service.active === activate) {
      logger.info("Service already in desired state", {
        businessId,
        phone,
        serviceId: service.service_id,
        serviceName: service.name,
        active: service.active,
      });

      await sendTextMessage(
        businessId,
        phone,
        `O serviço *${service.name}* já está ${activate ? "ativo" : "inativo"}.`,
      );
      return true;
    }

    // Atualizar o status do serviço
    const { error: updateError } = await supabaseClient
      .from("services")
      .update({ active: activate })
      .eq("service_id", service.service_id);

    if (updateError) {
      logger.error("Error updating service status", {
        error: updateError,
        businessId,
        phone,
      });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao atualizar o status do serviço. Por favor, tente novamente.",
      );
      return true;
    }

    logger.info("Service status updated successfully", {
      businessId,
      phone,
      serviceId: service.service_id,
      serviceName: service.name,
      active: activate,
    });

    // Confirmar atualização
    await sendTextMessage(
      businessId,
      phone,
      `✅ Serviço *${service.name}* ${activate ? "ativado" : "desativado"} com sucesso!`,
    );

    return true;
  } catch (error) {
    logger.error("Error toggling service", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
    );
    return true;
  }
}

/**
 * Ativa ou desativa o sistema RAG
 */
async function toggleRag(
  businessId: string,
  phone: string,
  text: string,
  business: any,
): Promise<boolean> {
  try {
    logger.info("Toggling RAG", { businessId, phone });

    // Extrair parâmetros do comando
    const params = parseAdminCommand(text, Intent.ADMIN_TOGGLE_RAG);

    // Verificar se o RAG deve ser ativado ou desativado
    const activate =
      params?.ragEnabled !== undefined
        ? params.ragEnabled
        : text.toLowerCase().includes("ativar");

    // Obter a configuração atual
    const config = business.config || {};

    // Se o RAG já está no estado desejado, informar
    if (config.ragEnabled === activate) {
      logger.info("RAG already in desired state", {
        businessId,
        phone,
        ragEnabled: config.ragEnabled,
      });

      await sendTextMessage(
        businessId,
        phone,
        `O sistema RAG (Retrieval Augmented Generation) já está ${activate ? "ativado" : "desativado"}.`,
      );
      return true;
    }

    // Atualizar a configuração
    const { error } = await supabaseClient
      .from("businesses")
      .update({
        config: {
          ...config,
          ragEnabled: activate,
        },
      })
      .eq("business_id", businessId);

    if (error) {
      logger.error("Error updating RAG status", { error, businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao atualizar o status do sistema RAG. Por favor, tente novamente.",
      );
      return true;
    }

    logger.info("RAG status updated successfully", {
      businessId,
      phone,
      oldStatus: config.ragEnabled,
      newStatus: activate,
    });

    // Invalidar o cache de configuração do negócio
    await deleteCache(`business_config:${businessId}`);

    // Confirmar atualização
    await sendTextMessage(
      businessId,
      phone,
      `✅ Sistema RAG (Retrieval Augmented Generation) ${activate ? "ativado" : "desativado"} com sucesso!${activate ? "\n\nAgora o assistente utilizará a base de conhecimento para responder perguntas." : "\n\nAgora o assistente não utilizará a base de conhecimento para responder perguntas."}`,
    );

    return true;
  } catch (error) {
    logger.error("Error toggling RAG", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao processar seu comando. Por favor, tente novamente.",
    );
    return true;
  }
}

/**
 * Mostra os horários de funcionamento
 */
async function showBusinessHours(
  businessId: string,
  phone: string,
  business: any,
): Promise<void> {
  try {
    logger.info("Showing business hours", { businessId, phone });

    const config = business.config || {};
    const businessHours = config.businessHours || {
      monday: { start: "09:00", end: "18:00" },
      tuesday: { start: "09:00", end: "18:00" },
      wednesday: { start: "09:00", end: "18:00" },
      thursday: { start: "09:00", end: "18:00" },
      friday: { start: "09:00", end: "18:00" },
      saturday: { start: "09:00", end: "13:00" },
      sunday: { start: null, end: null },
    };

    let message = "*Horários de Funcionamento*\n\n";
    message += `Segunda-feira: ${formatHours(businessHours.monday)}\n`;
    message += `Terça-feira: ${formatHours(businessHours.tuesday)}\n`;
    message += `Quarta-feira: ${formatHours(businessHours.wednesday)}\n`;
    message += `Quinta-feira: ${formatHours(businessHours.thursday)}\n`;
    message += `Sexta-feira: ${formatHours(businessHours.friday)}\n`;
    message += `Sábado: ${formatHours(businessHours.saturday)}\n`;
    message += `Domingo: ${formatHours(businessHours.sunday)}\n\n`;
    message += "Para atualizar os horários, envie 'atualizar horários'.";

    await sendTextMessage(businessId, phone, message);
  } catch (error) {
    logger.error("Error showing business hours", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao exibir os horários. Por favor, tente novamente.",
    );
  }
}

/**
 * Formata as horas para exibição
 */
function formatHours(dayHours: {
  start: string | null;
  end: string | null;
}): string {
  if (!dayHours.start || !dayHours.end) {
    return "Fechado";
  }
  return `${dayHours.start} às ${dayHours.end}`;
}

/**
 * Inicia o processo de atualização dos horários de funcionamento
 */
async function startUpdateBusinessHours(
  businessId: string,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    logger.info("Starting update business hours", { businessId, phone });

    // Buscar horários atuais
    const business = await getBusinessConfig(businessId);
    if (!business) {
      logger.error("Business not found", { businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Erro ao buscar configurações. Por favor, tente novamente.",
      );
      return true;
    }

    const businessHours = business.businessHours;

    let message =
      "*Atualizar Horários de Funcionamento*\n\nSelecione o dia que deseja atualizar:\n\n";
    message += "1. Segunda-feira\n";
    message += "2. Terça-feira\n";
    message += "3. Quarta-feira\n";
    message += "4. Quinta-feira\n";
    message += "5. Sexta-feira\n";
    message += "6. Sábado\n";
    message += "7. Domingo\n\n";
    message += "Responda com o número do dia:";

    await sendTextMessage(businessId, phone, message);

    // Salvar o estado atual para continuar no próximo comando
    await setCache(`admin_state:${businessId}:${phone}`, {
      currentIntent: Intent.ADMIN_UPDATE_BUSINESS_HOURS,
      waitingForInput: true,
      lastCommand: text,
      lastTimestamp: Date.now(),
      step: "select_day",
      businessHours,
    });

    logger.debug("Waiting for day selection", { businessId, phone });

    // Comando foi processado
    return true;
  } catch (error) {
    logger.error("Error starting update business hours", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao iniciar a atualização dos horários. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Continua o processo de atualização dos horários de funcionamento
 */
async function continueUpdateBusinessHours(
  businessId: string,
  phone: string,
  text: string,
  state: AdminConversationState,
): Promise<boolean> {
  try {
    const step = state.step || "select_day";
    const businessHours = state.businessHours || {};
    const day = state.day;

    logger.debug("Continuing update business hours", {
      businessId,
      phone,
      step,
      day,
    });

    // Processar entrada conforme o passo atual
    switch (step) {
      case "select_day":
        // Validar e selecionar o dia
        const dayIndexMatch = text.match(/^(\d+)$/);
        if (
          !dayIndexMatch ||
          parseInt(dayIndexMatch[1]) < 1 ||
          parseInt(dayIndexMatch[1]) > 7
        ) {
          await sendTextMessage(
            businessId,
            phone,
            "Seleção inválida. Por favor, informe o número do dia (1-7):",
          );
          return true;
        }

        const dayIndex = parseInt(dayIndexMatch[1]);
        let selectedDay = "";
        let dayKey = "";

        switch (dayIndex) {
          case 1:
            selectedDay = "Segunda-feira";
            dayKey = "monday";
            break;
          case 2:
            selectedDay = "Terça-feira";
            dayKey = "tuesday";
            break;
          case 3:
            selectedDay = "Quarta-feira";
            dayKey = "wednesday";
            break;
          case 4:
            selectedDay = "Quinta-feira";
            dayKey = "thursday";
            break;
          case 5:
            selectedDay = "Sexta-feira";
            dayKey = "friday";
            break;
          case 6:
            selectedDay = "Sábado";
            dayKey = "saturday";
            break;
          case 7:
            selectedDay = "Domingo";
            dayKey = "sunday";
            break;
        }

        const currentHours = businessHours[dayKey];
        const currentStatus =
          currentHours.start && currentHours.end
            ? `${currentHours.start} às ${currentHours.end}`
            : "Fechado";

        // Perguntar o que deseja fazer
        await sendTextMessage(
          businessId,
          phone,
          `Dia selecionado: *${selectedDay}*\nHorário atual: ${currentStatus}\n\nO que deseja fazer?\n\n1. Definir horário de funcionamento\n2. Marcar como fechado\n\nResponda com o número da opção:`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "select_action",
          day: dayKey,
        });
        return true;

      case "select_action":
        // Validar e selecionar a ação
        const actionMatch = text.match(/^(\d+)$/);
        if (
          !actionMatch ||
          parseInt(actionMatch[1]) < 1 ||
          parseInt(actionMatch[1]) > 2
        ) {
          await sendTextMessage(
            businessId,
            phone,
            "Seleção inválida. Por favor, informe o número da opção (1-2):",
          );
          return true;
        }

        const action = parseInt(actionMatch[1]);

        if (action === 2) {
          // Marcar como fechado
          await updateDayHours(businessId, day, null, null, businessHours);

          // Confirmar atualização
          const dayName = getDayName(day);
          await sendTextMessage(
            businessId,
            phone,
            `✅ Horário de ${dayName} atualizado com sucesso!\n\nAgora este dia está marcado como fechado.`,
          );

          // Resetar o estado
          await setCache(`admin_state:${businessId}:${phone}`, {});
          return true;
        }

        // Pedir horário de abertura
        await sendTextMessage(
          businessId,
          phone,
          `Por favor, informe o horário de *abertura* no formato HH:MM (ex: 09:00):`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "set_start_time",
        });
        return true;

      case "set_start_time":
        // Validar e salvar o horário de abertura
        const startTimeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!startTimeMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Formato de horário inválido. Por favor, informe o horário no formato HH:MM (ex: 09:00):",
          );
          return true;
        }

        const startHour = parseInt(startTimeMatch[1]);
        const startMinute = parseInt(startTimeMatch[2]);

        if (
          startHour < 0 ||
          startHour > 23 ||
          startMinute < 0 ||
          startMinute > 59
        ) {
          await sendTextMessage(
            businessId,
            phone,
            "Horário inválido. Por favor, informe um horário válido no formato HH:MM (ex: 09:00):",
          );
          return true;
        }

        const startTime = `${startHour.toString().padStart(2, "0")}:${startMinute.toString().padStart(2, "0")}`;

        // Pedir horário de fechamento
        await sendTextMessage(
          businessId,
          phone,
          `Horário de abertura: ${startTime}\n\nAgora, informe o horário de *fechamento* no formato HH:MM (ex: 18:00):`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "set_end_time",
          startTime,
        });
        return true;

      case "set_end_time":
        // Validar e salvar o horário de fechamento
        const endTimeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!endTimeMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Formato de horário inválido. Por favor, informe o horário no formato HH:MM (ex: 18:00):",
          );
          return true;
        }

        const endHour = parseInt(endTimeMatch[1]);
        const endMinute = parseInt(endTimeMatch[2]);

        if (endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
          await sendTextMessage(
            businessId,
            phone,
            "Horário inválido. Por favor, informe um horário válido no formato HH:MM (ex: 18:00):",
          );
          return true;
        }

        const endTime = `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`;
        const startTimeValue = state.startTime;

        // Atualizar horário no banco de dados
        await updateDayHours(
          businessId,
          day,
          startTimeValue,
          endTime,
          businessHours,
        );

        // Confirmar atualização
        const dayName = getDayName(day);
        await sendTextMessage(
          businessId,
          phone,
          `✅ Horário de ${dayName} atualizado com sucesso!\n\nNovo horário: ${startTimeValue} às ${endTime}`,
        );

        // Resetar o estado
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return true;

      default:
        // Resetar o estado se o passo não for reconhecido
        logger.warn("Unknown step in update business hours", {
          businessId,
          phone,
          step,
        });
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return false;
    }
  } catch (error) {
    logger.error("Error continuing update business hours", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao processar sua entrada. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Atualiza os horários de um dia no banco de dados
 */
async function updateDayHours(
  businessId: string,
  day: string,
  startTime: string | null,
  endTime: string | null,
  businessHours: any,
): Promise<void> {
  try {
    // Obter a configuração atual
    const { data: business, error: fetchError } = await supabaseClient
      .from("businesses")
      .select("config")
      .eq("business_id", businessId)
      .single();

    if (fetchError) {
      throw new Error(`Failed to fetch business: ${fetchError.message}`);
    }

    const config = business.config || {};

    // Atualizar horários de funcionamento
    const updatedHours = {
      ...businessHours,
      [day]: {
        start: startTime,
        end: endTime,
      },
    };

    // Atualizar no banco de dados
    const { error: updateError } = await supabaseClient
      .from("businesses")
      .update({
        config: {
          ...config,
          businessHours: updatedHours,
        },
      })
      .eq("business_id", businessId);

    if (updateError) {
      throw new Error(
        `Failed to update business hours: ${updateError.message}`,
      );
    }

    // Invalidar o cache de configuração do negócio
    await deleteCache(`business_config:${businessId}`);

    logger.info("Business hours updated successfully", {
      businessId,
      day,
      startTime,
      endTime,
    });
  } catch (error) {
    logger.error("Error updating business hours", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      day,
    });
    throw error;
  }
}

/**
 * Obtém o nome do dia em português
 */
function getDayName(dayKey: string): string {
  const dayNames = {
    monday: "Segunda-feira",
    tuesday: "Terça-feira",
    wednesday: "Quarta-feira",
    thursday: "Quinta-feira",
    friday: "Sexta-feira",
    saturday: "Sábado",
    sunday: "Domingo",
  };

  return dayNames[dayKey] || dayKey;
}

/**
 * Inicia o processo de bloqueio de agenda
 */
async function startBlockSchedule(
  businessId: string,
  phone: string,
  text: string,
): Promise<boolean> {
  try {
    logger.info("Starting block schedule", { businessId, phone });

    // Extrair parâmetros do comando
    const params = parseAdminCommand(text, Intent.ADMIN_BLOCK_SCHEDULE);

    // Se já temos todos os dados necessários, criar o bloqueio
    if (
      params &&
      params.startDate &&
      params.startTime &&
      params.endTime &&
      !params.needMoreInfo
    ) {
      return await completeBlockSchedule(
        businessId,
        phone,
        params.startDate,
        params.startTime,
        params.endTime,
        params.blockTitle,
      );
    }

    // Iniciar o fluxo de coleta de dados
    const message = `*Bloquear Agenda*\n\nVamos criar um bloqueio na agenda. Por favor, informe a data do bloqueio no formato DD/MM/YYYY:`;

    await sendTextMessage(businessId, phone, message);

    // Salvar o estado atual para continuar no próximo comando
    await setCache(`admin_state:${businessId}:${phone}`, {
      currentIntent: Intent.ADMIN_BLOCK_SCHEDULE,
      waitingForInput: true,
      lastCommand: text,
      lastTimestamp: Date.now(),
      step: "date",
      pendingChanges: {},
    });

    logger.debug("Waiting for block date input", { businessId, phone });

    // Comando foi processado
    return true;
  } catch (error) {
    logger.error("Error starting block schedule", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao iniciar o bloqueio de agenda. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Continua o processo de bloqueio de agenda
 */
async function continueBlockSchedule(
  businessId: string,
  phone: string,
  text: string,
  state: AdminConversationState,
): Promise<boolean> {
  try {
    const pendingChanges = state.pendingChanges || {};
    const step = state.step || "date";

    logger.debug("Continuing block schedule", {
      businessId,
      phone,
      step,
      pendingChanges,
    });

    // Processar entrada conforme o passo atual
    switch (step) {
      case "date":
        // Validar e salvar a data
        const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
        if (!dateMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Formato de data inválido. Por favor, informe a data no formato DD/MM/YYYY ou DD/MM:",
          );
          return true;
        }

        let day = dateMatch[1].padStart(2, "0");
        let month = dateMatch[2].padStart(2, "0");
        let year = dateMatch[3];

        if (!year) {
          year = new Date().getFullYear().toString();
        } else if (year.length === 2) {
          year = "20" + year;
        }

        const dateObj = new Date(`${year}-${month}-${day}T00:00:00`);

        // Verificar se a data é válida
        if (isNaN(dateObj.getTime())) {
          await sendTextMessage(
            businessId,
            phone,
            "Data inválida. Por favor, informe uma data válida no formato DD/MM/YYYY:",
          );
          return true;
        }

        // Verificar se a data está no futuro
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (dateObj < today) {
          await sendTextMessage(
            businessId,
            phone,
            "A data deve ser futura. Por favor, informe uma data a partir de hoje:",
          );
          return true;
        }

        const formattedDate = `${year}-${month}-${day}`;
        pendingChanges.date = formattedDate;
        pendingChanges.displayDate = `${day}/${month}/${year}`;

        // Perguntar hora de início
        await sendTextMessage(
          businessId,
          phone,
          `Data: ${pendingChanges.displayDate}\n\nAgora, informe a hora de início do bloqueio no formato HH:MM (ex: 09:00):`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "start_time",
          pendingChanges,
        });
        return true;

      case "start_time":
        // Validar e salvar o horário de início
        const startTimeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!startTimeMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Formato de horário inválido. Por favor, informe o horário no formato HH:MM (ex: 09:00):",
          );
          return true;
        }

        const startHour = parseInt(startTimeMatch[1]);
        const startMinute = parseInt(startTimeMatch[2]);

        if (
          startHour < 0 ||
          startHour > 23 ||
          startMinute < 0 ||
          startMinute > 59
        ) {
          await sendTextMessage(
            businessId,
            phone,
            "Horário inválido. Por favor, informe um horário válido no formato HH:MM (ex: 09:00):",
          );
          return true;
        }

        const startTime = `${startHour.toString().padStart(2, "0")}:${startMinute.toString().padStart(2, "0")}`;
        pendingChanges.startTime = startTime;

        // Perguntar hora de fim
        await sendTextMessage(
          businessId,
          phone,
          `Data: ${pendingChanges.displayDate}\nInício: ${startTime}\n\nAgora, informe a hora de fim do bloqueio no formato HH:MM (ex: 18:00):`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "end_time",
          pendingChanges,
        });
        return true;

      case "end_time":
        // Validar e salvar o horário de fim
        const endTimeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!endTimeMatch) {
          await sendTextMessage(
            businessId,
            phone,
            "Formato de horário inválido. Por favor, informe o horário no formato HH:MM (ex: 18:00):",
          );
          return true;
        }

        const endHour = parseInt(endTimeMatch[1]);
        const endMinute = parseInt(endTimeMatch[2]);

        if (endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
          await sendTextMessage(
            businessId,
            phone,
            "Horário inválido. Por favor, informe um horário válido no formato HH:MM (ex: 18:00):",
          );
          return true;
        }

        const endTime = `${endHour.toString().padStart(2, "0")}:${endMinute.toString().padStart(2, "0")}`;

        // Verificar se o horário de fim é após o de início
        const startDateTime = new Date(
          `${pendingChanges.date}T${pendingChanges.startTime}:00`,
        );
        const endDateTime = new Date(`${pendingChanges.date}T${endTime}:00`);

        if (endDateTime <= startDateTime) {
          await sendTextMessage(
            businessId,
            phone,
            "O horário de fim deve ser posterior ao horário de início. Por favor, informe um horário válido:",
          );
          return true;
        }

        pendingChanges.endTime = endTime;

        // Perguntar título do bloqueio
        await sendTextMessage(
          businessId,
          phone,
          `Data: ${pendingChanges.displayDate}\nHorário: ${pendingChanges.startTime} às ${endTime}\n\nPor último, informe um título para o bloqueio (ou envie "Bloqueio de agenda" para usar o padrão):`,
        );

        // Atualizar estado
        await setCache(`admin_state:${businessId}:${phone}`, {
          ...state,
          step: "title",
          pendingChanges,
        });
        return true;

      case "title":
        // Salvar o título
        const title = text.trim() || "Bloqueio de agenda";
        pendingChanges.title = title;

        // Completar o bloqueio
        return await completeBlockSchedule(
          businessId,
          phone,
          pendingChanges.date,
          pendingChanges.startTime,
          pendingChanges.endTime,
          title,
        );

      default:
        // Resetar o estado se o passo não for reconhecido
        logger.warn("Unknown step in block schedule", {
          businessId,
          phone,
          step,
        });
        await setCache(`admin_state:${businessId}:${phone}`, {});
        return false;
    }
  } catch (error) {
    logger.error("Error continuing block schedule", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao processar sua entrada. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Completa o bloqueio de agenda
 */
async function completeBlockSchedule(
  businessId: string,
  phone: string,
  date: string,
  startTime: string,
  endTime: string,
  title: string = "Bloqueio de agenda",
): Promise<boolean> {
  try {
    logger.info("Completing block schedule", {
      businessId,
      phone,
      date,
      startTime,
      endTime,
      title,
    });

    // Formatar datas para ISO
    const startDateTime = new Date(`${date}T${startTime}:00`);
    const endDateTime = new Date(`${date}T${endTime}:00`);

    // Verificar se as datas são válidas
    if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
      logger.warn("Invalid date/time for schedule block", {
        businessId,
        phone,
        date,
        startTime,
        endTime,
      });

      await sendTextMessage(
        businessId,
        phone,
        "Datas ou horários inválidos. Por favor, tente novamente com valores válidos.",
      );

      // Resetar o estado
      await setCache(`admin_state:${businessId}:${phone}`, {});
      return true;
    }

    // Criar o bloqueio na agenda
    const { error } = await supabaseClient.from("schedule_blocks").insert({
      business_id: businessId,
      title,
      start_time: startDateTime.toISOString(),
      end_time: endDateTime.toISOString(),
      created_by: phone,
    });

    if (error) {
      logger.error("Error creating schedule block", {
        error,
        businessId,
        phone,
      });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao criar o bloqueio na agenda. Por favor, tente novamente.",
      );

      // Resetar o estado
      await setCache(`admin_state:${businessId}:${phone}`, {});
      return true;
    }

    logger.info("Schedule block created successfully", {
      businessId,
      phone,
      date,
      startTime,
      endTime,
      title,
    });

    // Confirmar criação
    const formattedDate = formatDateDisplay(date);
    await sendTextMessage(
      businessId,
      phone,
      `✅ Bloqueio de agenda criado com sucesso!\n\nDetalhes:\n- Data: ${formattedDate}\n- Horário: ${startTime} às ${endTime}\n- Título: ${title}\n\nDurante este período, não será possível realizar agendamentos.`,
    );

    // Resetar o estado
    await setCache(`admin_state:${businessId}:${phone}`, {});
    return true;
  } catch (error) {
    logger.error("Error completing block schedule", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao criar o bloqueio na agenda. Por favor, tente novamente.",
    );

    // Resetar o estado em caso de erro
    await setCache(`admin_state:${businessId}:${phone}`, {});

    return true;
  }
}

/**
 * Formata uma data para exibição (YYYY-MM-DD para DD/MM/YYYY)
 */
function formatDateDisplay(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return dateStr;
    }

    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear();

    return `${day}/${month}/${year}`;
  } catch (error) {
    return dateStr;
  }
}

/**
 * Exibe os bloqueios de agenda
 */
async function viewScheduleBlocks(
  businessId: string,
  phone: string,
): Promise<void> {
  try {
    logger.info("Viewing schedule blocks", { businessId, phone });

    // Buscar bloqueios futuros
    const now = new Date().toISOString();
    const { data: blocks, error } = await supabaseClient
      .from("schedule_blocks")
      .select("*")
      .eq("business_id", businessId)
      .gte("end_time", now)
      .order("start_time", { ascending: true });

    if (error) {
      logger.error("Error fetching schedule blocks", {
        error,
        businessId,
        phone,
      });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao buscar os bloqueios de agenda. Por favor, tente novamente.",
      );
      return;
    }

    if (!blocks || blocks.length === 0) {
      logger.info("No schedule blocks found", { businessId, phone });

      await sendTextMessage(
        businessId,
        phone,
        "Não há bloqueios de agenda futuros. Use o comando 'bloquear agenda' para criar um novo bloqueio.",
      );
      return;
    }

    // Formatar lista de bloqueios
    let message = "*Bloqueios de Agenda Futuros*\n\n";

    blocks.forEach((block, index) => {
      const startTime = new Date(block.start_time);
      const endTime = new Date(block.end_time);

      const dateStr = formatDateDisplay(startTime.toISOString().split("T")[0]);
      const startTimeStr = startTime.toTimeString().slice(0, 5);
      const endTimeStr = endTime.toTimeString().slice(0, 5);

      message += `${index + 1}. *${block.title}*\n`;
      message += `   Data: ${dateStr}\n`;
      message += `   Horário: ${startTimeStr} às ${endTimeStr}\n\n`;
    });

    await sendTextMessage(businessId, phone, message);
  } catch (error) {
    logger.error("Error viewing schedule blocks", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao exibir os bloqueios de agenda. Por favor, tente novamente.",
    );
  }
}

/**
 * Exibe estatísticas do negócio
 */
async function viewStats(businessId: string, phone: string): Promise<void> {
  try {
    logger.info("Viewing stats", { businessId, phone });

    // Buscar estatísticas básicas
    const { data: business, error: businessError } = await supabaseClient
      .from("businesses")
      .select("name")
      .eq("business_id", businessId)
      .single();

    if (businessError) {
      logger.error("Error fetching business info", {
        error: businessError,
        businessId,
        phone,
      });

      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao buscar informações do negócio. Por favor, tente novamente.",
      );
      return;
    }

    // Contar clientes
    const { count: customerCount, error: customerError } = await supabaseClient
      .from("customers")
      .select("customer_id", { count: "exact", head: true })
      .eq("business_id", businessId);

    if (customerError) {
      logger.error("Error counting customers", {
        error: customerError,
        businessId,
        phone,
      });
    }

    // Contar serviços
    const { count: serviceCount, error: serviceError } = await supabaseClient
      .from("services")
      .select("service_id", { count: "exact", head: true })
      .eq("business_id", businessId);

    if (serviceError) {
      logger.error("Error counting services", {
        error: serviceError,
        businessId,
        phone,
      });
    }

    // Contar agendamentos futuros
    const now = new Date().toISOString();
    const { count: upcomingAppointmentCount, error: upcomingAppointmentError } =
      await supabaseClient
        .from("appointments")
        .select("appointment_id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("status", "confirmed")
        .gte("start_time", now);

    if (upcomingAppointmentError) {
      logger.error("Error counting upcoming appointments", {
        error: upcomingAppointmentError,
        businessId,
        phone,
      });
    }

    // Contar agendamentos completos
    const {
      count: completedAppointmentCount,
      error: completedAppointmentError,
    } = await supabaseClient
      .from("appointments")
      .select("appointment_id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "completed");

    if (completedAppointmentError) {
      logger.error("Error counting completed appointments", {
        error: completedAppointmentError,
        businessId,
        phone,
      });
    }

    // Contar agendamentos cancelados
    const {
      count: cancelledAppointmentCount,
      error: cancelledAppointmentError,
    } = await supabaseClient
      .from("appointments")
      .select("appointment_id", { count: "exact", head: true })
      .eq("business_id", businessId)
      .eq("status", "cancelled");

    if (cancelledAppointmentError) {
      logger.error("Error counting cancelled appointments", {
        error: cancelledAppointmentError,
        businessId,
        phone,
      });
    }

    // Formatar estatísticas
    const message =
      `*Estatísticas - ${business.name}*\n\n` +
      `👥 *Clientes*: ${customerCount || 0}\n` +
      `🧰 *Serviços*: ${serviceCount || 0}\n\n` +
      `📅 *Agendamentos*:\n` +
      `   • Futuros: ${upcomingAppointmentCount || 0}\n` +
      `   • Concluídos: ${completedAppointmentCount || 0}\n` +
      `   • Cancelados: ${cancelledAppointmentCount || 0}\n\n` +
      `💬 *Assistente Virtual*:\n` +
      `   • Status: ✅ Ativo\n` +
      `   • Versão: 1.0.0\n\n` +
      `Para relatórios mais detalhados, acesse o painel administrativo.`;

    await sendTextMessage(businessId, phone, message);
  } catch (error) {
    logger.error("Error viewing stats", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phone,
    });

    await sendTextMessage(
      businessId,
      phone,
      "Desculpe, ocorreu um erro ao exibir as estatísticas. Por favor, tente novamente.",
    );
  }
}

export default {
  handleAdminCommand,
};
