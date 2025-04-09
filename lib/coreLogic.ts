// lib/coreLogic.ts
import { UazapiGoPayload } from "@/types";
import { agent } from "@/agent";
import logger from "@/lib/logger";
import {
  extractMediaContent,
  extractInteractiveContent,
} from "@/lib/uazapiAdapter";
import { sendTextMessage } from "@/lib/uazapiGoClient";
import { logConversation } from "@/lib/utils";

/**
 * Função principal para processamento de mensagens recebidas
 * @param payload Payload da mensagem recebida
 */
export async function handleIncomingMessage(
  payload: UazapiGoPayload,
): Promise<void> {
  try {
    const { phone, text, messageType, metadata } = payload;
    const businessId = metadata.business_id;

    // Se não há ID do negócio, não pode processar
    if (!businessId) {
      logger.error("Missing business_id in payload", { phone });
      return;
    }

    // Log da mensagem recebida
    logger.info("Incoming message", {
      businessId,
      phone,
      messageType,
      isAdmin: metadata.is_admin,
      textPreview: text
        ? text.substring(0, 50) + (text.length > 50 ? "..." : "")
        : "[no text]",
    });

    // Registrar a mensagem no histórico
    await logConversation(
      businessId,
      metadata.customer_id || null,
      "customer",
      messageType === "text" ? text : `[${messageType}]`,
      undefined,
      { messageType, fromMe: false },
    );

    // Processar tipos de mensagem específicos
    let processedText = text;

    if (messageType !== "text") {
      // Extrair conteúdo de mídia (imagens, vídeos, etc.)
      if (
        ["image", "video", "audio", "document", "sticker"].includes(messageType)
      ) {
        const mediaContent = extractMediaContent(metadata.originalPayload);

        // Adicionar descrição da mídia ao texto
        const mediaDescription = getMediaDescription(messageType, mediaContent);
        processedText = mediaDescription;
      }
      // Extrair conteúdo interativo (botões, listas)
      else if (["button", "interactive"].includes(messageType)) {
        const interactiveContent = extractInteractiveContent(
          metadata.originalPayload,
        );

        // Adicionar descrição do botão/lista ao texto
        const interactiveDescription = getInteractiveDescription(
          messageType,
          interactiveContent,
        );
        processedText = interactiveDescription || text;
      }
    }

    // Se após processamento não há texto, usar texto padrão
    if (!processedText || processedText.trim() === "") {
      processedText = `[${messageType}]`;
    }

    // Atualizar o texto no payload
    payload.text = processedText;

    // Processar a mensagem com o agente
    await agent.processMessage(payload);
  } catch (error) {
    logger.error("Error in handleIncomingMessage", {
      error: error instanceof Error ? error.message : String(error),
      phone: payload.phone,
      businessId: payload.metadata.business_id,
    });

    // Tentar enviar mensagem de erro
    try {
      await sendTextMessage(
        payload.metadata.business_id || "",
        payload.phone,
        "Desculpe, estou enfrentando algumas dificuldades técnicas. " +
          "Por favor, tente novamente em alguns instantes.",
      );
    } catch (sendError) {
      logger.error("Failed to send error message", {
        error:
          sendError instanceof Error ? sendError.message : String(sendError),
      });
    }
  }
}

/**
 * Gera uma descrição para mensagem de mídia
 * @param messageType Tipo de mensagem
 * @param mediaContent Conteúdo da mídia
 */
function getMediaDescription(messageType: string, mediaContent: any): string {
  switch (messageType) {
    case "image":
      return mediaContent.caption
        ? `[Imagem] ${mediaContent.caption}`
        : "[Imagem enviada]";

    case "video":
      return mediaContent.caption
        ? `[Vídeo] ${mediaContent.caption}`
        : "[Vídeo enviado]";

    case "audio":
      return "[Áudio enviado]";

    case "document":
      return mediaContent.caption
        ? `[Documento] ${mediaContent.caption}`
        : "[Documento enviado]";

    case "sticker":
      return "[Sticker enviado]";

    default:
      return `[${messageType}]`;
  }
}

/**
 * Gera uma descrição para mensagem interativa
 * @param messageType Tipo de mensagem
 * @param interactiveContent Conteúdo interativo
 */
function getInteractiveDescription(
  messageType: string,
  interactiveContent: any,
): string {
  if (messageType === "button" && interactiveContent.buttonText) {
    return interactiveContent.buttonText;
  }

  if (messageType === "interactive") {
    if (interactiveContent.type === "button" && interactiveContent.buttonText) {
      return interactiveContent.buttonText;
    }

    if (interactiveContent.type === "list" && interactiveContent.listTitle) {
      return interactiveContent.listTitle;
    }
  }

  return "";
}
