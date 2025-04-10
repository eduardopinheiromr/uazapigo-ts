import logger from "@/lib/logger";

/**
 * Processa e valida a resposta JSON do LLM
 */
export async function processLLMResponse(result, businessId, userPhone) {
  try {
    // Extrair o JSON da resposta
    const rawText = result.response.text();

    // Buscar o objeto JSON na resposta
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      logger.warn("Formato JSON não encontrado na resposta", {
        businessId,
        userPhone,
      });
      return { text: rawText, meta: null };
    }

    const parsedResponse = JSON.parse(jsonMatch[0]);
    const responseText = parsedResponse.resposta;
    const meta = parsedResponse.meta;

    return { text: responseText, meta };
  } catch (error) {
    logger.error("Erro ao processar resposta JSON", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
      rawResponse: result.response.text(),
    });

    // Fallback para texto original sem metadados
    return {
      text: "Desculpe, estou com dificuldades técnicas no momento. Por favor, tente novamente ou entre em contato pelo telefone (22) 99977-5122.",
      meta: null,
    };
  }
}
