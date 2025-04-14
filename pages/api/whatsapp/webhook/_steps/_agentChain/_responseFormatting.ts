// pages/api/whatsapp/webhook/_steps/_agentChain/_responseFormatting.ts

import { NodeInput, NodeOutput } from "./_types";
import { processLLMResponse } from "../../_processLLMResponse";
import logger from "@/lib/logger";

export const _responseFormatting = async (
  input: NodeInput,
): Promise<NodeOutput> => {
  const { finalResponse, businessId, userPhone } = input;

  if (!finalResponse) {
    logger.warn("Nenhuma resposta final para processar", {
      businessId,
      userPhone,
    });
    return {
      ...input,
      responseText:
        "Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.",
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

  try {
    // Processar e validar a resposta JSON
    const { text: processedResponseText, meta } = await processLLMResponse(
      finalResponse,
      userPhone,
    );

    return {
      ...input,
      responseText: processedResponseText,
      meta,
    };
  } catch (error) {
    logger.error("Erro ao processar resposta final", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    return {
      ...input,
      responseText:
        "Desculpe, não consegui processar sua solicitação. Por favor, tente novamente.",
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
