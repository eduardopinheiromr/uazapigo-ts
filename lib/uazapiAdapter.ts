// lib/uazapiAdapter.ts
import { UazapiGoPayload } from "@/types";
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { formatPhoneNumber } from "@/lib/utils";

/**
 * Processa o payload recebido do webhook do UAZAPI
 * e converte para um formato padrão usado internamente pela aplicação
 */
export async function processWebhookPayload(
  webhookPayload: any,
): Promise<UazapiGoPayload> {
  try {
    const { message, owner } = webhookPayload;

    // Verificar se o payload é válido
    if (!message) {
      throw new Error("Payload inválido: message é obrigatório");
    }

    // Extrair informações relevantes
    const { chatid, text, messageType, fromMe, isGroup, senderName, sender } =
      message;

    // Extrair o número de telefone do chatid
    const phone = extractPhoneFromChatId(chatid);

    logger.debug("Processing webhook payload", {
      phone,
      messageType: messageType || message.type,
      fromMe: Boolean(fromMe),
      isGroup: Boolean(isGroup),
      owner,
    });

    // Formatar o payload para o formato interno da aplicação
    const payload: UazapiGoPayload = {
      phone,
      text: text || "",
      messageType: getMessageType(messageType || message.type),
      fromMe: Boolean(fromMe),
      isGroup: Boolean(isGroup),
      senderName: senderName || "",
      senderId: sender || "",
      timestamp: message.messageTimestamp || Date.now(),
      metadata: {
        originalPayload: message,
        instanceOwner: owner,
        business_id: "",
        is_admin: false,
        admin_id: "",
        is_root_admin: false,
      },
    };

    // Enriquece o payload com informações do banco de dados
    await enrichPayload(payload, owner);

    return payload;
  } catch (error) {
    logger.error("Error processing webhook payload", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      payload: webhookPayload,
    });

    // Retornar um payload mínimo em caso de erro para evitar falhas em cascata
    return {
      phone: extractPhoneFromChatId(webhookPayload?.message?.chatid || ""),
      text: webhookPayload?.message?.text || "",
      messageType: "unknown",
      fromMe: false,
      isGroup: false,
      senderName: "",
      senderId: "",
      timestamp: Date.now(),
      metadata: {
        originalPayload: webhookPayload?.message || {},
        instanceOwner: webhookPayload?.owner || "unknown",
        business_id: "",
        is_admin: false,
      },
    };
  }
}

/**
 * Enriquece o payload com informações adicionais do banco de dados
 */
async function enrichPayload(
  payload: UazapiGoPayload,
  instanceOwner: string,
): Promise<void> {
  try {
    // Buscar o negócio pelo número do WhatsApp
    const { data: business, error: businessError } = await supabaseClient
      .from("businesses")
      .select("business_id, admin_phone, name")
      .eq("waba_number", instanceOwner)
      .single();

    if (businessError || !business) {
      logger.error("Business not found for instance", {
        instanceOwner,
        error: businessError?.message,
      });
      return;
    }

    // Adicionar informações ao payload
    payload.metadata.business_id = business.business_id;

    logger.debug("Business found for message", {
      businessId: business.business_id,
      businessName: business.name,
      phone: payload.phone,
    });

    // Verificar se o remetente é um admin
    if (business.admin_phone === payload.phone) {
      payload.metadata.is_admin = true;
      payload.metadata.is_root_admin = true;

      logger.debug("User identified as root admin", {
        businessId: business.business_id,
        phone: payload.phone,
      });
      return;
    }

    // Verificar se é um admin adicional
    const { data: admin, error: adminError } = await supabaseClient
      .from("admins")
      .select("admin_id, permissions")
      .eq("business_id", business.business_id)
      .eq("phone", payload.phone)
      .single();

    if (!adminError && admin) {
      payload.metadata.is_admin = true;
      payload.metadata.admin_id = admin.admin_id;
      payload.metadata.permissions = admin.permissions;

      logger.debug("User identified as admin", {
        businessId: business.business_id,
        phone: payload.phone,
        adminId: admin.admin_id,
      });
      return;
    }

    // Buscar informações do cliente (se não for admin)
    const { data: customer, error: customerError } = await supabaseClient
      .from("customers")
      .select("customer_id, name, is_blocked, tags")
      .eq("business_id", business.business_id)
      .eq("phone", payload.phone)
      .single();

    if (!customerError && customer) {
      payload.metadata.customer_id = customer.customer_id;
      payload.metadata.customer_name = customer.name;
      payload.metadata.is_blocked = customer.is_blocked;
      payload.metadata.tags = customer.tags;

      logger.debug("User identified as customer", {
        businessId: business.business_id,
        phone: payload.phone,
        customerId: customer.customer_id,
        customerName: customer.name,
        isBlocked: customer.is_blocked,
      });
    } else {
      logger.debug("New customer", {
        businessId: business.business_id,
        phone: payload.phone,
      });
    }
  } catch (error) {
    logger.error("Error enriching payload", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      phone: payload.phone,
      instanceOwner,
    });
  }
}

/**
 * Extrai o número de telefone de um chatid do WhatsApp
 * Formato de exemplo: "5522997622896@s.whatsapp.net"
 */
function extractPhoneFromChatId(chatid: string): string {
  try {
    if (!chatid) return "";

    // Remove domínio e caracteres especiais, deixando apenas dígitos
    const match = chatid.match(/(\d+)[@-]/);
    if (match && match[1]) {
      return formatPhoneNumber(match[1]);
    }

    return formatPhoneNumber(chatid);
  } catch (error) {
    logger.error("Error extracting phone from chatId", {
      error: error instanceof Error ? error.message : String(error),
      chatid,
    });
    return chatid.replace(/\D/g, "");
  }
}

/**
 * Normaliza os tipos de mensagem do UAZAPI para nosso formato interno
 */
function getMessageType(uazapiMessageType: string): string {
  try {
    if (!uazapiMessageType) return "unknown";

    // O UAZAPI pode enviar 'Conversation' para mensagens de texto
    if (
      uazapiMessageType === "Conversation" ||
      uazapiMessageType.toLowerCase() === "text"
    ) {
      return "text";
    }

    // Mapear outros tipos do UAZAPI para nossos tipos internos
    const typeMap: Record<string, string> = {
      image: "image",
      video: "video",
      audio: "audio",
      ptt: "audio", // voice note (push to talk)
      document: "document",
      location: "location",
      contact: "contact",
      sticker: "sticker",
      poll: "poll",
      reaction: "reaction",
      button: "button",
      interactive: "interactive",
      order: "order",
      call: "call",
      template: "template",
    };

    // Converter para minúsculo e verificar se existe no mapa
    const normalizedType = uazapiMessageType.toLowerCase();
    return typeMap[normalizedType] || "unknown";
  } catch (error) {
    logger.error("Error getting message type", {
      error: error instanceof Error ? error.message : String(error),
      uazapiMessageType,
    });
    return "unknown";
  }
}

/**
 * Extrai mídia e conteúdo específico de mensagens não-texto
 */
export function extractMediaContent(payload: any): {
  url?: string;
  caption?: string;
  mimeType?: string;
} {
  try {
    const { message } = payload;
    const messageType = getMessageType(message.messageType || message.type);

    switch (messageType) {
      case "image":
        return {
          url: message.imageMessage?.url || message.image?.url,
          caption: message.imageMessage?.caption || message.caption || "",
          mimeType: message.imageMessage?.mimetype || message.mimetype,
        };

      case "video":
        return {
          url: message.videoMessage?.url || message.video?.url,
          caption: message.videoMessage?.caption || message.caption || "",
          mimeType: message.videoMessage?.mimetype || message.mimetype,
        };

      case "audio":
        return {
          url: message.audioMessage?.url || message.audio?.url,
          mimeType: message.audioMessage?.mimetype || message.mimetype,
        };

      case "document":
        return {
          url: message.documentMessage?.url || message.document?.url,
          caption: message.documentMessage?.caption || message.caption || "",
          mimeType: message.documentMessage?.mimetype || message.mimetype,
        };

      case "sticker":
        return {
          url: message.stickerMessage?.url || message.sticker?.url,
          mimeType: "image/webp",
        };

      default:
        return {};
    }
  } catch (error) {
    logger.error("Error extracting media content", {
      error: error instanceof Error ? error.message : String(error),
      payload,
    });
    return {};
  }
}

/**
 * Extrai dados de botões ou listas interativas
 */
export function extractInteractiveContent(payload: any): {
  type?: string;
  buttonId?: string;
  buttonText?: string;
  listId?: string;
  listTitle?: string;
} {
  try {
    const { message } = payload;

    // Verificar se é uma mensagem interativa
    if (
      message.type === "interactive" ||
      message.messageType === "interactive"
    ) {
      const interactive = message.interactive || message.interactiveMessage;

      if (interactive.type === "button_reply") {
        return {
          type: "button",
          buttonId: interactive.button_reply?.id,
          buttonText: interactive.button_reply?.title,
        };
      }

      if (interactive.type === "list_reply") {
        return {
          type: "list",
          listId: interactive.list_reply?.id,
          listTitle: interactive.list_reply?.title,
        };
      }
    }

    // Verificar botão legado
    if (
      message.type === "buttonsResponseMessage" ||
      message.messageType === "buttonsResponseMessage"
    ) {
      return {
        type: "button",
        buttonId: message.buttonsResponseMessage?.selectedButtonId,
        buttonText: message.buttonsResponseMessage?.selectedDisplayText,
      };
    }

    // Verificar lista legada
    if (
      message.type === "listResponseMessage" ||
      message.messageType === "listResponseMessage"
    ) {
      return {
        type: "list",
        listId: message.listResponseMessage?.singleSelectReply?.selectedRowId,
        listTitle: message.listResponseMessage?.title,
      };
    }

    return {};
  } catch (error) {
    logger.error("Error extracting interactive content", {
      error: error instanceof Error ? error.message : String(error),
      payload,
    });
    return {};
  }
}

export default {
  processWebhookPayload,
  extractMediaContent,
  extractInteractiveContent,
  extractPhoneFromChatId,
  getMessageType,
};
