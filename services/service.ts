// services/service.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { Service } from "@/types";

/**
 * Lista os serviços ativos oferecidos pelo estabelecimento
 * @param businessId ID do negócio
 */
export async function listServices(businessId: string): Promise<Service[]> {
  try {
    logger.info("Listing active services", { businessId });

    const { data, error } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .eq("active", true)
      .order("name");

    if (error) {
      logger.error("Error fetching services", {
        error: error.message,
        businessId,
      });
      throw new Error(`Failed to fetch services: ${error.message}`);
    }

    logger.debug("Services listed successfully", {
      businessId,
      count: data.length,
    });

    return data;
  } catch (error) {
    logger.error("Unexpected error in listServices", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });
    throw error;
  }
}
