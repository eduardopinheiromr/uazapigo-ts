// services/admin/prompt.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { deleteCache } from "@/lib/redisClient";

/**
 * Visualiza o prompt atual do assistente
 * @param businessId ID do negócio
 */
export async function admin_viewCurrentPrompt(
  businessId: string,
): Promise<{ prompt: string; success: boolean; message?: string }> {
  try {
    logger.info("[Admin] Viewing current prompt", { businessId });

    const { data, error } = await supabaseClient
      .from("businesses")
      .select("config")
      .eq("business_id", businessId)
      .single();

    if (error) {
      logger.error("Error fetching prompt", {
        error: error.message,
        businessId,
      });
      return {
        prompt: "",
        success: false,
        message: `Erro ao buscar o prompt: ${error.message}`,
      };
    }

    const defaultPrompt = "Você é um assistente virtual amigável e prestativo.";
    const currentPrompt = data?.config?.defaultPrompt || defaultPrompt;

    logger.debug("Current prompt retrieved", { businessId });

    return {
      prompt: currentPrompt,
      success: true,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_viewCurrentPrompt", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });

    return {
      prompt: "",
      success: false,
      message: "Ocorreu um erro inesperado ao buscar o prompt atual.",
    };
  }
}

/**
 * Atualiza o prompt do sistema do assistente
 * @param businessId ID do negócio
 * @param newPrompt Novo texto do prompt
 */
export async function admin_updatePrompt(
  businessId: string,
  newPrompt: string,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("[Admin] Updating prompt", {
      businessId,
      promptLength: newPrompt?.length,
    });

    // Validar o prompt
    if (!newPrompt || newPrompt.trim().length < 10) {
      return {
        success: false,
        message: "O prompt deve ter pelo menos 10 caracteres.",
      };
    }

    // Obter configuração atual
    const { data, error: fetchError } = await supabaseClient
      .from("businesses")
      .select("config")
      .eq("business_id", businessId)
      .single();

    if (fetchError) {
      logger.error("Error fetching business config", {
        error: fetchError.message,
        businessId,
      });
      return {
        success: false,
        message: `Erro ao buscar configuração: ${fetchError.message}`,
      };
    }

    // Preparar atualização da configuração
    const config = data?.config || {};
    config.defaultPrompt = newPrompt.trim();

    // Atualizar o prompt no banco de dados
    const { error: updateError } = await supabaseClient
      .from("businesses")
      .update({
        config: config,
      })
      .eq("business_id", businessId);

    if (updateError) {
      logger.error("Error updating prompt", {
        error: updateError.message,
        businessId,
      });
      return {
        success: false,
        message: `Erro ao atualizar o prompt: ${updateError.message}`,
      };
    }

    // Invalidar o cache de configuração
    await deleteCache(`business_config:${businessId}`);

    logger.info("Prompt updated successfully", { businessId });

    return {
      success: true,
      message:
        "Prompt atualizado com sucesso! O novo comportamento está em vigor para todas as conversas.",
    };
  } catch (error) {
    logger.error("Unexpected error in admin_updatePrompt", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });

    return {
      success: false,
      message: "Ocorreu um erro inesperado ao atualizar o prompt.",
    };
  }
}

/**
 * Ativa ou desativa o uso da base de conhecimento (RAG)
 * @param businessId ID do negócio
 * @param enable Ativar (true) ou desativar (false)
 */
export async function admin_configureRag(
  businessId: string,
  enable: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("[Admin] Configuring RAG", {
      businessId,
      enable,
    });

    // Obter configuração atual
    const { data, error: fetchError } = await supabaseClient
      .from("businesses")
      .select("config")
      .eq("business_id", businessId)
      .single();

    if (fetchError) {
      logger.error("Error fetching business config for RAG", {
        error: fetchError.message,
        businessId,
      });
      return {
        success: false,
        message: `Erro ao buscar configuração: ${fetchError.message}`,
      };
    }

    // Verificar se já está no estado desejado
    const config = data?.config || {};
    if (config.ragEnabled === enable) {
      const status = enable ? "ativado" : "desativado";
      return {
        success: true,
        message: `O sistema RAG já está ${status}.`,
      };
    }

    // Atualizar a configuração
    config.ragEnabled = enable;

    const { error: updateError } = await supabaseClient
      .from("businesses")
      .update({
        config: config,
      })
      .eq("business_id", businessId);

    if (updateError) {
      logger.error("Error updating RAG configuration", {
        error: updateError.message,
        businessId,
      });
      return {
        success: false,
        message: `Erro ao atualizar configuração RAG: ${updateError.message}`,
      };
    }

    // Invalidar o cache de configuração
    await deleteCache(`business_config:${businessId}`);

    logger.info("RAG configuration updated successfully", {
      businessId,
      ragEnabled: enable,
    });

    const status = enable ? "ativado" : "desativado";
    const behavior = enable
      ? "agora usará a base de conhecimento para responder perguntas"
      : "não usará mais a base de conhecimento para respostas";

    return {
      success: true,
      message: `O sistema RAG foi ${status} com sucesso! O assistente ${behavior}.`,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_configureRag", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      enable,
    });

    return {
      success: false,
      message: "Ocorreu um erro inesperado ao configurar o sistema RAG.",
    };
  }
}
