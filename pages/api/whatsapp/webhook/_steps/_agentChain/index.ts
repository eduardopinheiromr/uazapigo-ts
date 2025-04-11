// pages/api/whatsapp/webhook/_steps/_agentChain/_index.ts

import { NodeInput } from "./_types";
import { _preparePrompt } from "./_preparePrompt";
import { _deepThinking } from "./_deepThinking";
import { _llmGeneration } from "./_llmGeneration";
import { _toolExecution } from "./_toolExecution";
import { _responseFormatting } from "./_responseFormatting";
import { _sessionUpdate } from "./_sessionUpdate";
import logger from "@/lib/logger";

export const _agentChain = async ({
  payload,
  session,
  isAdmin,
  businessId,
  userPhone,
}: {
  payload: any;
  session: any;
  isAdmin: boolean;
  businessId: string;
  userPhone: string;
}): Promise<{ responseText: string; meta: any }> => {
  // Criar contexto inicial para o fluxo
  const initialInput: NodeInput = {
    payload,
    session,
    isAdmin,
    businessId,
    userPhone,
  };

  try {
    // Step 1: Preparar o prompt
    logger.debug("Iniciando preparação do prompt", { businessId, userPhone });
    const promptOutput = await _preparePrompt(initialInput);

    // Step 2: Análise profunda (Deep Thinking)
    logger.debug("Realizando análise profunda", { businessId, userPhone });
    const thinkingOutput = await _deepThinking(promptOutput);

    // Step 3: Gerar resposta do LLM
    logger.debug("Gerando resposta do LLM", { businessId, userPhone });
    const llmOutput = await _llmGeneration(thinkingOutput);

    // Step 4: Executar ferramentas chamadas pelo LLM
    logger.debug("Executando ferramentas", { businessId, userPhone });
    const toolOutput = await _toolExecution(llmOutput);

    // Step 5: Processar e formatar a resposta
    logger.debug("Formatando resposta", { businessId, userPhone });
    const formattedOutput = await _responseFormatting(toolOutput);

    // Step 6: Atualizar a sessão
    logger.debug("Atualizando sessão", { businessId, userPhone });
    const finalOutput = await _sessionUpdate(formattedOutput);

    // Retornar o resultado final
    return {
      responseText:
        finalOutput.responseText ||
        "Desculpe, não foi possível processar sua solicitação.",
      meta: finalOutput.meta || {},
    };
  } catch (error) {
    logger.error("Erro durante execução do agentChain", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    // Resposta de fallback em caso de erro
    return {
      responseText:
        "Desculpe, ocorreu um erro inesperado. Por favor, tente novamente em alguns instantes.",
      meta: {
        intencao_detectada: "erro",
        horarios_mencionados: [],
        horarios_agendados: [],
        servicos_mencionados: [],
        data_referencia: "",
        confianca: 0,
      },
    };
  }
};
