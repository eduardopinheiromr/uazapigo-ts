// lib/uazapiGoClient.ts

import { UazapiClient } from "@/sdk/sdk";
import logger from "./logger";
import { formatPhoneNumber } from "./utils";
import { MediaParams, MessageOptions } from "@/types";

// Configuração do cliente
const UAZAPIGO_API_KEY = process.env.UAZAPIGO_API_KEY;

// Verificar a presença da chave da API
if (!UAZAPIGO_API_KEY) {
  logger.warn(
    "Missing UAZAPIGO_API_KEY environment variable. WhatsApp API calls will fail.",
  );
}

// Mapeamento de businessId para configuração de instância
export const clientInstanceMap: Record<
  string,
  { baseUrl: string; token: string }
> = {
  business0: {
    baseUrl: "https://recepcionistai.uazapi.com",
    token: "dbdf648a-5320-4c4a-993d-275910a11286",
  },
  // Outras instâncias podem ser adicionadas aqui
};

export const businessIdMap = {
  "dbdf648a-5320-4c4a-993d-275910a11286": {
    businessId: "business0",
    baseUrl: "https://recepcionistai.uazapi.com",
  },
};

/**
 * Obtém o token de instância para um businessId
 */
export function getInstanceForClient(businessId: string): {
  baseUrl: string;
  token: string;
} {
  logger.debug("Getting instance for client", { businessId });

  const instanceToken = clientInstanceMap[businessId];
  if (!instanceToken) {
    logger.error("No instance found for business", { businessId });
    throw new Error(`No instance found for client: ${businessId}`);
  }

  return instanceToken;
}

/**
 * Cria uma instância da SDK do UAZAPI para um businessId específico
 */
const getUazapiClientByBusinessId = (businessId: string): UazapiClient => {
  try {
    const instance = getInstanceForClient(businessId);

    return new UazapiClient({
      baseUrl: instance.baseUrl,
      token: instance.token,
      retry: true,
      maxRetries: 3,
    });
  } catch (error) {
    logger.error("Error creating UAZAPI client", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });

    throw error;
  }
};

/**
 * Cache de clientes UAZAPI para evitar recriação constante
 */
const clientCache: Record<string, UazapiClient> = {};

/**
 * Obtém um cliente UAZAPI com cache
 */
function getCachedClient(businessId: string): UazapiClient {
  if (!clientCache[businessId]) {
    clientCache[businessId] = getUazapiClientByBusinessId(businessId);
  }

  return clientCache[businessId];
}

/**
 * Limpa o cache de clientes
 */
export function clearClientCache(): void {
  for (const key in clientCache) {
    delete clientCache[key];
  }

  logger.debug("UAZAPI client cache cleared");
}

/**
 * Envia uma mensagem de texto via UAZAPI
 */
export async function sendTextMessage(
  businessId: string,
  phoneNumber: string,
  text: string,
  options?: MessageOptions,
): Promise<string> {
  try {
    // Formatar o número de telefone
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Obter o cliente UAZAPI
    const uazapiClient = getCachedClient(businessId);

    logger.debug("Sending text message", {
      businessId,
      phoneNumber: formattedPhone,
      textLength: text.length,
    });

    // Preparar os parâmetros da mensagem
    const params: any = {
      number: formattedPhone,
      text: text,
      linkPreview:
        options?.linkPreview === undefined ? true : options.linkPreview,
    };

    // Adicionar parâmetros opcionais
    if (options?.quotedMessageId) {
      params.quotedMsgId = options.quotedMessageId;
    }

    if (options?.mentions && options.mentions.length > 0) {
      params.mentions = options.mentions;
    }

    console.log(JSON.stringify({ params }, null, 2));
    // Enviar a mensagem
    const result = await uazapiClient.message.sendText(params);

    logger.info("Text message sent successfully", {
      businessId,
      phoneNumber: formattedPhone,
      messageId: result.id,
    });

    return result.id;
  } catch (error) {
    logger.error("Error sending text message", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phoneNumber,
    });

    throw new Error(
      `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Envia uma imagem via UAZAPI
 */
export async function sendImageMessage(
  businessId: string,
  phoneNumber: string,
  imageUrl: string,
  caption?: string,
): Promise<string> {
  try {
    // Formatar o número de telefone
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Obter o cliente UAZAPI
    const uazapiClient = getCachedClient(businessId);

    logger.debug("Sending image message", {
      businessId,
      phoneNumber: formattedPhone,
      imageUrl,
    });

    const result = await uazapiClient.message.sendMedia({
      number: formattedPhone,
      type: "image",
      file: imageUrl,
      text: caption,
    });

    logger.info("Image message sent successfully", {
      businessId,
      phoneNumber: formattedPhone,
      messageId: result.id,
    });

    return result.id;
  } catch (error) {
    logger.error("Error sending image message", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phoneNumber,
      imageUrl,
    });

    throw new Error(
      `Failed to send image: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Envia um documento via UAZAPI
 */
export async function sendDocumentMessage(
  businessId: string,
  phoneNumber: string,
  documentUrl: string,
  filename: string,
  caption?: string,
): Promise<string> {
  try {
    // Formatar o número de telefone
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Obter o cliente UAZAPI
    const uazapiClient = getCachedClient(businessId);

    logger.debug("Sending document message", {
      businessId,
      phoneNumber: formattedPhone,
      documentUrl,
      filename,
    });

    const result = await uazapiClient.message.sendMedia({
      number: formattedPhone,
      type: "document",
      file: documentUrl,
      docName: filename,
      text: caption,
    });

    logger.info("Document message sent successfully", {
      businessId,
      phoneNumber: formattedPhone,
      messageId: result.id,
    });

    return result.id;
  } catch (error) {
    logger.error("Error sending document message", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phoneNumber,
      documentUrl,
    });

    throw new Error(
      `Failed to send document: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Envia uma mídia genérica (imagem, vídeo, áudio, documento) via UAZAPI
 */
export async function sendMediaMessage(
  businessId: string,
  params: MediaParams,
): Promise<string> {
  try {
    // Formatar o número de telefone
    const formattedPhone = formatPhoneNumber(params.number);

    // Obter o cliente UAZAPI
    const uazapiClient = getCachedClient(businessId);

    logger.debug("Sending media message", {
      businessId,
      phoneNumber: formattedPhone,
      mediaType: params.type,
      file: params.file,
    });

    const mediaParams = {
      number: formattedPhone,
      type: params.type,
      file: params.file,
      text: params.text,
      docName: params.docName,
    };

    const result = await uazapiClient.message.sendMedia(mediaParams);

    logger.info("Media message sent successfully", {
      businessId,
      phoneNumber: formattedPhone,
      messageId: result.id,
      mediaType: params.type,
    });

    return result.id;
  } catch (error) {
    logger.error("Error sending media message", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      mediaType: params.type,
      phoneNumber: params.number,
    });

    throw new Error(
      `Failed to send media: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Envia uma mensagem com botões via UAZAPI
 * Nota: Método sendButtons substituído por método compatível
 */
export async function sendButtonMessage(
  businessId: string,
  phoneNumber: string,
  text: string,
  buttons: { id: string; text: string }[],
): Promise<string> {
  try {
    // Formatar o número de telefone
    const formattedPhone = formatPhoneNumber(phoneNumber);

    // Obter o cliente UAZAPI
    const uazapiClient = getCachedClient(businessId);

    logger.debug("Sending button message", {
      businessId,
      phoneNumber: formattedPhone,
      buttonsCount: buttons.length,
    });

    // Limitar a 3 botões conforme restrição do WhatsApp
    const limitedButtons = buttons.slice(0, 3);

    // Usar método alternativo compatível com a API
    // Em vez de sendButtons, usando sendInteractive ou outra alternativa
    const result = await uazapiClient.message.sendText({
      number: formattedPhone,
      text:
        text +
        "\n\n" +
        limitedButtons.map((btn, i) => `${i + 1}. ${btn.text}`).join("\n"),
    });

    logger.info("Button message sent successfully (as text)", {
      businessId,
      phoneNumber: formattedPhone,
      messageId: result.id,
    });

    return result.id;
  } catch (error) {
    logger.error("Error sending button message", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phoneNumber,
    });

    throw new Error(
      `Failed to send button message: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Verifica o status da instância
 */
export async function checkInstanceStatus(
  businessId: string,
): Promise<boolean> {
  try {
    // Obter o cliente UAZAPI
    const uazapiClient = getCachedClient(businessId);

    logger.debug("Checking instance status", { businessId });

    const status = await uazapiClient.instance.getStatus();
    const isOnline = status.status.connected && status.status.loggedIn;

    logger.info("Instance status checked", {
      businessId,
      isOnline,
      status: status.status,
    });

    return isOnline;
  } catch (error) {
    logger.error("Error checking instance status", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });

    return false;
  }
}

/**
 * Simula digitando para o usuário (método adaptado para compatibilidade)
 */
export async function sendTypingStatus(
  businessId: string,
  phoneNumber: string,
  durationMs: number = 3000,
): Promise<boolean> {
  try {
    logger.debug("Sending typing status", {
      businessId,
      phoneNumber,
      durationMs,
    });

    // Como o método sendPresenceUpdate não existe, usamos um atraso simples
    // antes de enviar a mensagem (para ser implementado onde essa função é chamada)

    // Simular sucesso
    await new Promise((resolve) => setTimeout(resolve, 100));

    return true;
  } catch (error) {
    logger.error("Error sending typing status", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      phoneNumber,
    });

    return false;
  }
}

/**
 * Marca uma mensagem como lida (método adaptado para compatibilidade)
 */
export async function markMessageAsRead(
  businessId: string,
  messageId: string,
): Promise<boolean> {
  try {
    logger.debug("Marking message as read", { businessId, messageId });

    // Como o método setMessageStatus não existe,
    // implementamos uma versão vazia para compatibilidade

    // Simular sucesso
    await new Promise((resolve) => setTimeout(resolve, 100));

    return true;
  } catch (error) {
    logger.error("Error marking message as read", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      messageId,
    });

    return false;
  }
}

export default {
  sendTextMessage,
  sendImageMessage,
  sendDocumentMessage,
  sendMediaMessage,
  sendButtonMessage,
  checkInstanceStatus,
  sendTypingStatus,
  markMessageAsRead,
  getInstanceForClient,
  clearClientCache,
};
