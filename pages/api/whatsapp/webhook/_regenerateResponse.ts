import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelName } from "./_constants";
import { processLLMResponse } from "./_processLLMResponse";
import logger from "@/lib/logger";

/**
 * Regenera a resposta quando inconsistências são detectadas
 */
export async function regenerateResponse(
  originalResult,
  meta,
  inconsistencias,
  businessId,
  userPhone,
) {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({
      model: modelName,
    });

    const correcaoPrompt = `
      Detectei uma inconsistência na sua resposta. 
      Os seguintes horários foram mencionados como disponíveis, mas já estão agendados:
      ${inconsistencias.join(", ")}
      
      Por favor, corrija a resposta removendo esses horários da lista de disponíveis.
      Mantenha o mesmo formato JSON e preserve o estilo amigável da resposta original.
      
      Resposta original:
      ${originalResult.response.text()}
    `;

    const result = await model.generateContent(correcaoPrompt);
    return processLLMResponse(result, businessId, userPhone);
  } catch (error) {
    logger.error("Erro ao regenerar resposta", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    // Fallback para uma resposta genérica em caso de erro
    return {
      text: `Temos alguns horários disponíveis para você, mas precisamos verificar novamente. Por favor, poderia me dizer qual serviço e dia específico você está procurando?`,
      meta: meta,
    };
  }
}
