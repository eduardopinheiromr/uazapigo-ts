// lib/adapters/uazapiAdapter.ts
import { UazapiGoPayload } from "@/types";
import supabaseClient from "@/lib/supabaseClient";

/**
 * Processa o payload recebido do webhook do UAZAPI
 * e converte para um formato padrão usado internamente pela aplicação
 */
export async function processWebhookPayload(
  webhookPayload: any,
): Promise<UazapiGoPayload> {
  const { message, owner } = webhookPayload;

  // Verificar se o payload é válido
  if (!message) {
    throw new Error("Payload inválido: message é obrigatório");
  }

  // Extrai informações relevantes
  const { chatid, text, messageType, fromMe, isGroup, senderName, sender } =
    message;

  // Extrai o número de telefone do chatid
  const phone = extractPhoneFromChatId(chatid);

  // Formata o payload para o formato interno da aplicação
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
    const { data: business } = await supabaseClient
      .from("businesses")
      .select("business_id, admin_phone")
      .eq("waba_number", instanceOwner)
      .single();

    if (business) {
      // Adicionar informações ao payload
      payload.metadata.business_id = business.business_id;

      // Verificar se o remetente é um admin
      if (business.admin_phone === payload.phone) {
        payload.metadata.is_admin = true;
        payload.metadata.is_root_admin = true;
      } else {
        // Verificar se é um admin adicional
        const { data: admin } = await supabaseClient
          .from("admins")
          .select("admin_id, permissions")
          .eq("business_id", business.business_id)
          .eq("phone", payload.phone)
          .single();

        if (admin) {
          payload.metadata.is_admin = true;
          payload.metadata.admin_id = admin.admin_id;
          payload.metadata.permissions = admin.permissions;
        } else {
          payload.metadata.is_admin = false;
        }
      }

      // Buscar informações do cliente (se não for admin)
      if (!payload.metadata.is_admin) {
        const { data: customer } = await supabaseClient
          .from("customers")
          .select("customer_id, name, is_blocked, tags")
          .eq("business_id", business.business_id)
          .eq("phone", payload.phone)
          .single();

        if (customer) {
          payload.metadata.customer_id = customer.customer_id;
          payload.metadata.customer_name = customer.name;
          payload.metadata.is_blocked = customer.is_blocked;
          payload.metadata.tags = customer.tags;
        }
      }
    }
  } catch (error) {
    console.error("Erro ao enriquecer payload:", error);
  }
}

/**
 * Extrai o número de telefone de um chatid do WhatsApp
 * Formato de exemplo: "5522997622896@s.whatsapp.net"
 */
function extractPhoneFromChatId(chatid: string): string {
  if (!chatid) return "";

  // Remove domínio e caracteres especiais, deixando apenas dígitos
  const match = chatid.match(/(\d+)[@-]/);
  if (match && match[1]) {
    return match[1];
  }

  return chatid.replace(/\D/g, "");
}

/**
 * Normaliza os tipos de mensagem do UAZAPI para nosso formato interno
 */
function getMessageType(uazapiMessageType: string): string {
  // O UAZAPI pode enviar 'Conversation' para mensagens de texto
  if (
    uazapiMessageType === "Conversation" ||
    uazapiMessageType?.toLowerCase() === "text"
  ) {
    return "text";
  }

  // Mapear outros tipos do UAZAPI para nossos tipos internos
  const typeMap: Record<string, string> = {
    image: "image",
    video: "video",
    audio: "audio",
    ptt: "audio",
    document: "document",
    location: "location",
    contact: "contact",
    sticker: "sticker",
    poll: "poll",
    reaction: "reaction",
    button: "button",
  };

  // Converter para minúsculo e verificar se existe no mapa
  const normalizedType = uazapiMessageType?.toLowerCase();
  return typeMap[normalizedType] || "unknown";
}
