/* ----------------------------------------
 * interaction.ts
 * ----------------------------------------
 * Lida com solicitações de atendimento humano, etc.
 */

import supabaseClient from "@/lib/supabaseClient";
import { v4 as uuid } from "uuid";

/**
 * Verifica se já existe uma solicitação pendente para este usuário.
 * Se sim, retorna o registro encontrado. Se não, retorna null.
 */
async function checkExistingHumanRequest(
  businessId: string,
  customerPhone: string,
) {
  const { data, error } = await supabaseClient
    .from("human_agent_requests")
    .select("*")
    .eq("business_id", businessId)
    .eq("customer_phone", customerPhone)
    .eq("status", "PENDING")
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(
      `Erro ao checar solicitação humana pendente: ${error.message}`,
    );
  }
  return data || null;
}

/**
 * Envia mensagem de notificação para um array de números (ou 1 se for string).
 */
async function notifyAdmins(
  businessId: string,
  phones: string[],
  userPhone: string,
) {
  // Ajuste para usar sua função de envio (ex: sendTextMessage):
  for (const adminPhone of phones) {
    try {
      // Exemplo de chamada fictícia:
      // await sendTextMessage(businessId, adminPhone, `Solicitação de atendimento humano do cliente ${userPhone}...`)
      console.log(
        `Notificando admin ${adminPhone} para userPhone ${userPhone}`,
      );
    } catch (err) {
      console.warn("Falha ao notificar admin", adminPhone, "->", err);
    }
  }
}

async function getBusiness(businessId: string) {
  const { data, error } = await supabaseClient
    .from("businesses")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(
      `Não foi possível obter dados do negócio: ${error.message}`,
    );
  }
  return data ?? null;
}

/**
 * Solicita atendimento humano para um usuário, evitando duplicados e notificando admins.
 */
export async function requestHumanAgent(
  businessId: string,
  customerPhone: string,
) {
  try {
    const existing = await checkExistingHumanRequest(businessId, customerPhone);
    if (existing) {
      return {
        success: true,
        message:
          "Sua solicitação de atendimento humano já está em aberto. Aguarde um atendente.",
      };
    }

    const biz = await getBusiness(businessId);
    if (!biz) {
      return { success: false, message: "Negócio não encontrado." };
    }

    // Cria registro em human_agent_requests
    const requestId = uuid();
    const { error: insertError } = await supabaseClient
      .from("human_agent_requests")
      .insert({
        request_id: requestId,
        business_id: businessId,
        customer_phone: customerPhone,
        status: "PENDING",
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      return {
        success: false,
        message: "Falha ao registrar solicitação de atendimento humano.",
      };
    }

    // Notifica admin(s)
    let adminPhones: string[] = [];
    if (biz.config?.adminPhones && Array.isArray(biz.config.adminPhones)) {
      adminPhones = biz.config.adminPhones;
    } else if (biz.admin_phone) {
      adminPhones = [biz.admin_phone];
    }

    if (adminPhones.length > 0) {
      await notifyAdmins(businessId, adminPhones, customerPhone);
    }

    return {
      success: true,
      message:
        "Sua solicitação foi registrada. Em breve, um atendente entrará em contato.",
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro na solicitação de atendimento humano: ${err.message}`,
    };
  }
}
