// lib/adminHandler.ts
import { Intent, parseAdminCommand } from "./intentDetector";
import { sendTextMessage } from "./uazapiGoClient";
import supabaseClient from "./supabaseClient";
import { getCache, setCache } from "./redisClient";

/**
 * Estado da conversa administrativa
 */
interface AdminConversationState {
  currentIntent?: Intent;
  waitingForInput?: boolean;
  lastCommand?: string;
  lastTimestamp?: number;
  pendingChanges?: any;
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
    // Obter o estado atual da conversa administrativa
    const stateKey = `admin_state:${businessId}:${phone}`;
    const state = (await getCache<AdminConversationState>(stateKey)) || {};

    // Se estiver esperando por input, continuamos o comando anterior
    if (state.waitingForInput && state.currentIntent) {
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

      // Outros comandos serão implementados posteriormente

      default:
        // Não é um comando admin que sabemos processar
        return false;
    }
  } catch (error) {
    console.error("Erro no processamento de comando administrativo:", error);
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

    // Outros casos serão adicionados depois

    default:
      // Resetar o estado se não soubermos como continuar
      await setCache(`admin_state:${businessId}:${phone}`, {});
      return false;
  }
}

/**
 * Mostra a ajuda administrativa
 */
async function showAdminHelp(businessId: string, phone: string): Promise<void> {
  const helpMessage = `*Comandos Administrativos*

*Configurações Gerais:*
• "mostrar prompt" - Ver o prompt atual
• "atualizar prompt: [novo prompt]" - Atualizar o prompt base

*Serviços:*
• "mostrar serviços" - Listar serviços
• "adicionar serviço" - Adicionar novo serviço

*Conhecimento (RAG):*
• "ativar rag" - Ativar RAG
• "desativar rag" - Desativar RAG

*Agenda:*
• "mostrar horários" - Ver horários de funcionamento
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
  const config = business.config || {};
  const currentPrompt = config.defaultPrompt || "Não há prompt configurado.";

  const message = `*Prompt Atual:*\n\n${currentPrompt}\n\nPara atualizar, envie "atualizar prompt: [novo texto]"`;

  await sendTextMessage(businessId, phone, message);

  // Não precisamos manter estado para este comando
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
  // Tentar extrair o novo prompt diretamente do comando
  const params = parseAdminCommand(text, Intent.ADMIN_UPDATE_PROMPT);

  // Se conseguimos extrair o prompt, atualizá-lo imediatamente
  if (params && params.newPrompt && !params.needMoreInfo) {
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
    // Validar o novo prompt
    if (!newPrompt || newPrompt.length < 10) {
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
    const { data, error } = await supabaseClient
      .from("businesses")
      .update({
        config: {
          ...config,
          defaultPrompt: newPrompt,
        },
      })
      .eq("business_id", businessId);

    if (error) {
      console.error("Erro ao atualizar o prompt:", error);
      await sendTextMessage(
        businessId,
        phone,
        "Ocorreu um erro ao atualizar o prompt. Por favor, tente novamente.",
      );
      return true;
    }

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
    console.error("Erro ao atualizar prompt:", error);
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
