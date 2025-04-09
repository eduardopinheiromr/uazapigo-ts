// services/interaction.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { sendTextMessage } from "@/lib/uazapiGoClient";
import { getOrCreateCustomer } from "@/lib/utils";

/**
 * Marca a conversa para atendimento humano e notifica a equipe responsável
 * @param businessId ID do negócio
 * @param customerPhone Telefone do cliente
 * @param reason Motivo da solicitação (opcional)
 */
export async function requestHumanAgent(
  businessId: string,
  customerPhone: string,
  reason?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("Requesting human agent", {
      businessId,
      customerPhone,
      reason,
    });

    // Obter ou criar o cliente
    const customerId = await getOrCreateCustomer(businessId, customerPhone);
    if (!customerId) {
      logger.error("Failed to get or create customer", {
        businessId,
        customerPhone,
      });
      return {
        success: false,
        message:
          "Não foi possível processar sua solicitação de atendente humano. Por favor, tente novamente.",
      };
    }

    // Registrar a solicitação de atendente humano
    const requestId = crypto.randomUUID();

    const { error } = await supabaseClient.from("human_agent_requests").insert({
      request_id: requestId,
      business_id: businessId,
      customer_id: customerId,
      reason: reason || "Solicitação de atendimento humano",
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (error) {
      logger.error("Error creating human agent request", {
        error: error.message,
        businessId,
        customerPhone,
      });
      return {
        success: false,
        message:
          "Ocorreu um erro ao solicitar um atendente humano. Por favor, tente novamente.",
      };
    }

    // Buscar administradores para notificar
    const { data: business, error: businessError } = await supabaseClient
      .from("businesses")
      .select("admin_phone, name")
      .eq("business_id", businessId)
      .single();

    if (businessError) {
      logger.error("Error fetching business for notification", {
        error: businessError.message,
        businessId,
      });
      // Continuar mesmo com erro, apenas log
    }

    // Notificar administrador principal, se disponível
    if (business?.admin_phone) {
      try {
        const notificationMessage = `📢 *Nova Solicitação de Atendimento*\n\nCliente: ${customerPhone}\nMotivo: ${reason || "Não especificado"}\n\nAcesse o painel administrativo para responder.`;

        await sendTextMessage(
          businessId,
          business.admin_phone,
          notificationMessage,
        );

        logger.debug("Admin notification sent", {
          businessId,
          adminPhone: business.admin_phone,
        });
      } catch (notificationError) {
        logger.warn("Failed to send admin notification", {
          error:
            notificationError instanceof Error
              ? notificationError.message
              : String(notificationError),
          businessId,
          adminPhone: business.admin_phone,
        });
        // Continuar mesmo com erro de notificação
      }
    }

    // Também poderia notificar admins adicionais ou criar um registro para ser mostrado no dashboard

    logger.info("Human agent request created successfully", {
      businessId,
      customerPhone,
      requestId,
    });

    return {
      success: true,
      message:
        "Sua solicitação de atendimento humano foi registrada com sucesso. Logo um atendente entrará em contato.",
    };
  } catch (error) {
    logger.error("Unexpected error in requestHumanAgent", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerPhone,
    });

    return {
      success: false,
      message:
        "Ocorreu um erro ao solicitar um atendente humano. Por favor, tente novamente.",
    };
  }
}
