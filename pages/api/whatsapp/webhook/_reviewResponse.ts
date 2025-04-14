/* ----------------------------------------
 * _reviewResponse.ts
 * ----------------------------------------
 * Revisa a resposta gerada pelo LLM principal, usando outra chamada de IA
 * para ver se deve aprovar ou corrigir. Exemplo com Gemini.
 */

import logger from "@/lib/logger";
import { model } from "./_steps/_agentChain/_model";

interface ReviewResult {
  status: "APPROVED" | "REJECTED";
  correctedText?: string;
}

export async function reviewResponse(
  conversationHistory: string, // Pode ser JSON ou resumo
  generatedText: string,
  fallbackSupportPhone: string = "",
): Promise<ReviewResult> {
  try {
    // Exigimos que o revisor devolva algo no formato JSON: { "status":"APPROVED"|"REJECTED", "correctedText":"..." }
    const reviewPrompt = `
Você é um revisor de conteúdo de chatbot. Verifique se a resposta abaixo está coerente, educada e não viola nenhuma política.
Se estiver boa, retorne exatamente:
{
  "status":"APPROVED"
}

Se identificar problemas, retorne:
{
  "status":"REJECTED",
  "correctedText":"aqui vai a resposta corrigida, sem problemas"
}

Nada além desse JSON. Eis o contexto da conversa (como string): 
"""${conversationHistory}"""

Eis a resposta gerada que você deve revisar:
"""${generatedText}"""
    `.trim();

    const response = await model.generateContent({
      systemInstruction: "Revisor de qualidade de respostas",

      generationConfig: {
        temperature: 0,
      },
      contents: [
        {
          role: "user",
          parts: [
            {
              text: reviewPrompt,
            },
          ],
        },
      ],
    });

    const text = response?.[0]?.content?.parts?.[0] || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      // se não conseguiu extrair JSON, tratar como falha de parsing => fallback
      logger.warn("ReviewResponse: Modelo não retornou JSON esperado:", text);
      return {
        status: "REJECTED",
        correctedText: fallbackMessage(fallbackSupportPhone),
      };
    }

    const jsonStr = match[0];
    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (jsonErr) {
      logger.warn("ReviewResponse: Falha ao parsear JSON:", {
        jsonStr,
        jsonErr,
      });
      return {
        status: "REJECTED",
        correctedText: fallbackMessage(fallbackSupportPhone),
      };
    }

    if (parsed.status === "APPROVED") {
      return { status: "APPROVED" };
    } else if (
      parsed.status === "REJECTED" &&
      typeof parsed.correctedText === "string"
    ) {
      return { status: "REJECTED", correctedText: parsed.correctedText };
    } else {
      // Formato inesperado
      logger.warn("ReviewResponse: Formato inesperado do revisor:", parsed);
      return {
        status: "REJECTED",
        correctedText: fallbackMessage(fallbackSupportPhone),
      };
    }
  } catch (err: any) {
    logger.error("ReviewResponse: Erro geral no revisor:", err);
    return {
      status: "REJECTED",
      correctedText: fallbackMessage(fallbackSupportPhone),
    };
  }
}

function fallbackMessage(phone: string) {
  const extra = phone
    ? ` Se precisar, ligue ou envie mensagem para ${phone}.`
    : "";
  return `Desculpe, não consegui validar a resposta no momento.${extra}`;
}
