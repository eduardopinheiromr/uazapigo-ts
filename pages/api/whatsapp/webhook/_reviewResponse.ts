import { GoogleGenerativeAI } from "@google/generative-ai";
import { injectPromptCurrentDate } from "./_utils";
import logger from "@/lib/logger";
import { modelName } from "./_constants";

/**
 * Implementação do Agente de Revisão que verifica a qualidade da resposta
 */
async function reviewResponse(basePrompt, responseText, context) {
  // Usar o modelo Gemini para revisar a resposta
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
  });

  //   4. Se há contradições com respostas anteriores
  //   5. Se entende a verdadeira intenção do cliente e não apenas responde literalmente
  //   6. Se antecipa as necessidades do cliente de forma natural
  const reviewPrompt = `
    Você é um agente de controle de qualidade para um assistente virtual de barbearia, cujo prompt base é esse:
    Prompt base: ${basePrompt}

    ---
    
    Analise esta resposta que será enviada para um cliente via WhatsApp e verifique:
    1. Se contém informações técnicas de erro que não deveriam ser expostas
    2. Se é consistente com o contexto da conversa
    3. Se fornece informações precisas e úteis ao cliente

    
    Se a resposta for adequada, retorne apenas "APPROVED".
    Se a resposta tiver problemas, retorne "REJECTED" seguido de uma explicação breve
    e uma versão corrigida que deveria ser enviada, exemplo: "Resposta corrigida: a resposta atualizada com a correção proposta, adequada ao negócio e ao cliente".
    Se precisar corrigir, não invente informações, apenas ajuste o que for necessário.
    
    ${injectPromptCurrentDate()}

    Resposta a ser analisada: "${responseText}"
    
    Contexto da conversa: ${JSON.stringify(context.conversation_history)}
  `;

  const result = await model.generateContent(reviewPrompt);
  // const result = await model.generateContent({
  //   systemInstruction: reviewPrompt,
  //   contents: context.conversation_history.map((message) => ({
  //     role: message.role,
  //     parts: [{ text: message.content }],
  //   })),
  //   generationConfig: {
  //     temperature: 0,
  //   },
  // });
  const reviewResult = result.response.text();

  if (reviewResult.startsWith("APPROVED")) {
    return { approved: true, finalResponse: responseText };
  } else {
    // Extrair a versão corrigida da resposta - mais robusto para capturar diferentes formatos
    let correctedResponse = null;

    // Procurar por várias possíveis indicações de versão corrigida
    const possibleIndicators = [
      "Resposta corrigida:",
      "Versão corrigida:",
      "Versão Corrigida:",
      "**Versão Corrigida:**",
      "**Versão corrigida:**",
      "VERSÃO CORRIGIDA:",
      "Versão revisada:",
      "Sugestão de correção:",
    ];

    for (const indicator of possibleIndicators) {
      if (reviewResult.includes(indicator)) {
        correctedResponse = reviewResult.split(indicator)[1]?.trim();
        break;
      }
    }

    // Se não encontrou pelos separadores, procurar por texto entre aspas depois de "corrigida"
    if (
      !correctedResponse &&
      reviewResult.toLowerCase().includes("corrigida")
    ) {
      const matches = reviewResult.match(/"([^"]+)"/);
      if (matches && matches[1]) {
        correctedResponse = matches[1];
      }
    }

    // Se ainda não encontrou e tem aspas na resposta, usar o texto entre aspas
    if (!correctedResponse) {
      const matches = reviewResult.match(/"([^"]+)"/);
      if (matches && matches[1]) {
        correctedResponse = matches[1];
      }
    }

    // Remover aspas iniciais e finais se estiverem presentes
    if (
      correctedResponse &&
      correctedResponse.startsWith('"') &&
      correctedResponse.endsWith('"')
    ) {
      correctedResponse = correctedResponse.slice(1, -1);
    }

    // Se ainda não conseguiu extrair, usar a segunda metade da resposta
    if (!correctedResponse && reviewResult.length > 100) {
      const halfwayPoint = Math.floor(reviewResult.length / 2);
      const secondHalf = reviewResult.slice(halfwayPoint);

      // Verificar se há algum texto significativo
      if (secondHalf.length > 20) {
        correctedResponse = secondHalf.trim();
      }
    }

    // Fallback para mensagem genérica apenas se não conseguiu extrair nada útil
    if (!correctedResponse || correctedResponse.length < 20) {
      correctedResponse =
        "Desculpe, estamos com um problema temporário. Por favor, tente novamente em alguns instantes ou entre em contato pelo telefone (22) 99977-5122.";
    }

    logger.warn("Response rejected by review agent", {
      originalResponse: responseText,
      reviewFeedback: reviewResult,
      extractedCorrection: correctedResponse,
    });

    return { approved: false, finalResponse: correctedResponse };
  }
}
