// pages/api/whatsapp/webhook/_steps/_agentChain/_llmGeneration.ts

import { NodeInput, NodeOutput } from "./_types";
import {
  FunctionCallingConfig,
  FunctionCallingMode,
  FunctionDeclaration,
} from "@google/generative-ai";
import { availableTools } from "@/tools/definition";
import { basePrompt } from "./_basePrompt";
import { model } from "./_model";
import logger from "@/lib/logger";

const _getAvailableTools = (isAdmin: boolean): FunctionDeclaration[] => {
  return availableTools.filter((tool) => {
    // Se for admin, todas as ferramentas estão disponíveis
    if (isAdmin) return true;

    // Se não for admin, apenas ferramentas não-admin estão disponíveis
    return !tool.name.startsWith("admin_");
  });
};

export const _llmGeneration = async (input: NodeInput): Promise<NodeOutput> => {
  const { prompt, isAdmin, session, businessId, userPhone } = input;

  // Determinar ferramentas disponíveis
  const tools = _getAvailableTools(isAdmin);

  const functionCallingConfig: FunctionCallingConfig = {
    mode: FunctionCallingMode.ANY,
    allowedFunctionNames: tools.map((tool) => tool.name),
  };

  try {
    const result = await model.generateContent({
      toolConfig: {
        functionCallingConfig,
      },
      systemInstruction: basePrompt,
      contents: session.conversation_history.map((message) => ({
        role: message.role,
        parts: [{ text: message.content }],
      })),
      tools: [
        {
          functionDeclarations: tools,
        },
      ],
    });

    return {
      ...input,
      modelResponse: result,
    };
  } catch (error) {
    logger.error("Erro ao gerar conteúdo com o modelo LLM", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    // Mesmo em caso de erro, seguimos o fluxo com um modelResponse nulo
    // O próximo passo irá lidar com essa situação
    return {
      ...input,
      modelResponse: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};
