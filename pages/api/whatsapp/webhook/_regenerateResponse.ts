/* ----------------------------------------
 * _regenerateResponse.ts
 * ----------------------------------------
 * Gera uma nova versão da resposta do LLM corrigindo inconsistências (ex: horários ocupados).
 * Poderia ser resolvido de forma determinística, mas aqui exemplificamos o uso de IA
 * para manter estilo de texto.
 */

import logger from "@/lib/logger";
import { model } from "./_steps/_agentChain/_model";

interface RegenerateOptions {
  fallbackPhone?: string;
}

/**
 * originalJson: objeto com { resposta: string, meta: any } que o LLM gerou
 * inconsistencies: lista de itens a remover/corrigir na resposta
 */
export async function regenerateResponse(
  originalJson: { resposta: string; meta: any },
  inconsistencies: string[],
  options: RegenerateOptions = {},
): Promise<{ success: boolean; text: string; meta: any }> {
  try {
    if (!originalJson) {
      return {
        success: false,
        text: fallbackMessage(options.fallbackPhone),
        meta: {},
      };
    }

    // 1) Exemplo (determinístico): se a inconsistência for "remover horário X",
    //    remover de meta e reformatar a string.
    //    MAS aqui seguimos usando IA:

    const prompt = `
Você recebeu o seguinte objeto JSON de resposta:
${JSON.stringify(originalJson, null, 2)}

Existe(m) a(s) seguinte(s) inconsistência(s) a corrigir:
- ${inconsistencies.join("\n- ")}

Por favor, ajuste a resposta para remover ou corrigir as inconsistências, mantendo o mesmo estilo.
Retorne APENAS um objeto JSON válido com o formato:
{
  "resposta": "texto final revisado",
  "meta": { ...caso necessário... }
}
Não inclua comentários ou texto adicional fora do objeto JSON.
    `.trim();

    const response = await model.generateContent({
      systemInstruction: "Ajustar resposta para remover inconsistências",

      generationConfig: {
        temperature: 0,
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    });

    const raw = response?.[0]?.content?.parts?.[0] || "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      logger.warn("regenerateResponse: Modelo não retornou objeto JSON:", raw);
      return {
        success: false,
        text: fallbackMessage(options.fallbackPhone),
        meta: {},
      };
    }

    const jsonStr = match[0];
    try {
      const parsed = JSON.parse(jsonStr);
      // Garantir que tenha campos
      if (typeof parsed.resposta !== "string") {
        logger.warn("regenerateResponse: Campo resposta inválido:", parsed);
        return {
          success: false,
          text: fallbackMessage(options.fallbackPhone),
          meta: {},
        };
      }
      return {
        success: true,
        text: parsed.resposta,
        meta: parsed.meta || {},
      };
    } catch (err) {
      logger.warn("regenerateResponse: Falha ao parsear JSON gerado:", {
        err,
        jsonStr,
      });
      return {
        success: false,
        text: fallbackMessage(options.fallbackPhone),
        meta: {},
      };
    }
  } catch (err: any) {
    logger.error("regenerateResponse: erro geral:", err);
    return {
      success: false,
      text: fallbackMessage(options.fallbackPhone),
      meta: {},
    };
  }
}

function fallbackMessage(phone?: string) {
  const p = phone ? `Caso precise, entre em contato: ${phone}.` : "";
  return `Desculpe, ocorreu um erro ao ajustar a resposta. ${p}`;
}
