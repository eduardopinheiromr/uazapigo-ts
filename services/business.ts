// services/business.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { getRagContext } from "@/lib/rag";
import { BusinessHours } from "@/types";

/**
 * Obtém os horários de funcionamento do estabelecimento
 * @param businessId ID do negócio
 */
export async function getBusinessHours(
  businessId: string,
): Promise<BusinessHours> {
  try {
    logger.info("Getting business hours", { businessId });

    const { data, error } = await supabaseClient
      .from("businesses")
      .select("config")
      .eq("business_id", businessId)
      .single();

    if (error) {
      logger.error("Error fetching business hours", {
        error: error.message,
        businessId,
      });
      throw new Error(`Failed to fetch business hours: ${error.message}`);
    }

    const defaultHours: BusinessHours = {
      monday: { start: "09:00", end: "18:00" },
      tuesday: { start: "09:00", end: "18:00" },
      wednesday: { start: "09:00", end: "18:00" },
      thursday: { start: "09:00", end: "18:00" },
      friday: { start: "09:00", end: "18:00" },
      saturday: { start: "09:00", end: "13:00" },
      sunday: { start: null, end: null },
    };

    const businessHours = data?.config?.businessHours || defaultHours;

    logger.debug("Business hours retrieved", { businessId });

    return businessHours;
  } catch (error) {
    logger.error("Unexpected error in getBusinessHours", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });

    throw error;
  }
}

/**
 * Obtém informações gerais sobre o estabelecimento
 * @param businessId ID do negócio
 */
export async function getBusinessInfo(businessId: string): Promise<{
  name: string;
  address?: string;
  phone?: string;
  description?: string;
  paymentMethods?: string[];
  additionalInfo?: string;
}> {
  try {
    logger.info("Getting business info", { businessId });

    // Buscar informações básicas do negócio
    const { data, error } = await supabaseClient
      .from("businesses")
      .select("name, config")
      .eq("business_id", businessId)
      .single();

    if (error) {
      logger.error("Error fetching business info", {
        error: error.message,
        businessId,
      });
      throw new Error(`Failed to fetch business info: ${error.message}`);
    }

    // Tentar buscar informações adicionais na base de conhecimento usando RAG
    let additionalInfo = "";

    // Verificar se o RAG está ativado
    const ragEnabled = data?.config?.ragEnabled !== false;

    if (ragEnabled) {
      try {
        // Buscar informações sobre o negócio na base de conhecimento
        const ragQuery =
          "Quais são as informações gerais sobre o estabelecimento? Endereço, formas de pagamento, descrição, telefone de contato e outras informações relevantes.";

        additionalInfo = await getRagContext(ragQuery, businessId);
      } catch (ragError) {
        logger.warn("Error fetching RAG context for business info", {
          error:
            ragError instanceof Error ? ragError.message : String(ragError),
          businessId,
        });
        // Continuar mesmo se RAG falhar
      }
    }

    // Construir a resposta combinando informações básicas e RAG
    const businessInfo = {
      name: data.name,
      address: data?.config?.address,
      phone: data?.config?.phone,
      description: data?.config?.description,
      paymentMethods: data?.config?.paymentMethods,
      additionalInfo: additionalInfo || undefined,
    };

    logger.debug("Business info retrieved", {
      businessId,
      hasRagInfo: !!additionalInfo,
      businessInfo,
    });

    return businessInfo;
  } catch (error) {
    logger.error("Unexpected error in getBusinessInfo", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });

    throw error;
  }
}
