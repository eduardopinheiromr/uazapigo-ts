/* ----------------------------------------
 * _processLLMResponse.ts
 * ----------------------------------------
 * Recebe texto cru do LLM e extrai { resposta, meta } do JSON.
 * Se falhar, retorna um fallback textual para o usuário.
 */

import logger from "@/lib/logger";

export async function processLLMResponse(
  rawText: string,
  fallbackPhone: string = "",
): Promise<{ text: string; meta: any }> {
  try {
    if (!rawText) {
      return {
        text: fallbackMessage(fallbackPhone),
        meta: null,
      };
    }

    // Tentar extrair um JSON do texto
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn("processLLMResponse: Nenhum JSON encontrado na resposta:", {
        rawText,
      });
      return {
        text: fallbackMessage(fallbackPhone),
        meta: null,
      };
    }

    const jsonStr = match[0];
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      logger.warn("processLLMResponse: Falha ao fazer JSON.parse:", {
        err,
        jsonStr,
      });
      return {
        text: fallbackMessage(fallbackPhone),
        meta: null,
      };
    }

    // Esperamos que parsed contenha { resposta, meta }
    if (typeof parsed.resposta !== "string") {
      logger.warn(
        'processLLMResponse: Campo "resposta" inválido ou ausente:',
        parsed,
      );
      return {
        text: fallbackMessage(fallbackPhone),
        meta: null,
      };
    }
    const meta = parsed.meta ?? null;

    return {
      text: parsed.resposta,
      meta,
    };
  } catch (err: any) {
    logger.error("processLLMResponse: Erro inesperado:", err);
    return {
      text: fallbackMessage(fallbackPhone),
      meta: null,
    };
  }
}

function fallbackMessage(phone: string) {
  return phone
    ? `Desculpe, ocorreu um erro ao interpretar a resposta. Se precisar, ligue ou envie mensagem para ${phone}.`
    : `Desculpe, ocorreu um erro ao interpretar a resposta.`;
}
