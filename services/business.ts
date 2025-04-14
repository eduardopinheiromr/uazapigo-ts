/* ----------------------------------------
 * business.ts
 * ----------------------------------------
 * Fornece funções para obter informações do negócio (horários, info, RAG).
 */

import { BusinessConfig } from "@/types";
import supabaseClient from "@/lib/supabaseClient";
// ^ Exemplo: se quisermos centralizar o horário padrão no constants.ts
//   ou use um objeto local, p. ex.: { monToFri: [9, 18], sat: [9,13], ... }

interface RagService {
  // Ajuste conforme seu conector RAG
  getRagContext: (query: string) => Promise<string | null>;
}

async function getBusinessRecord(businessId: string): Promise<any | null> {
  const { data, error } = await supabaseClient
    .from("businesses")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error(`Erro ao buscar dados do negócio: ${error.message}`);
  }
  return data ?? null;
}

/**
 * Retorna objeto de horário de funcionamento ou defaults, se não configurado.
 */
export async function getBusinessHours(businessId: string) {
  try {
    const business = await getBusinessRecord(businessId);
    const config: BusinessConfig | undefined = business?.config;

    if (config?.businessHours) {
      return { success: true, hours: config.businessHours };
    }

    throw new Error("Horários de funcionamento não configurados.");
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao obter horários do negócio: ${err.message}`,
    };
  }
}

/**
 * Retorna informações gerais do negócio.
 * Se 'ragEnabled' for true, busca contexto extra via RAG.
 */
export async function getBusinessInfo(
  businessId: string,
  ragService?: RagService,
) {
  try {
    const business = await getBusinessRecord(businessId);
    if (!business) {
      return { success: false, message: "Negócio não encontrado." };
    }

    let infoText = `Nome: ${business.name}\nEndereço: ${business.address || "Não cadastrado"}\n`;

    // Caso queira buscar info extra por RAG
    const ragEnabled = business.config?.ragEnabled ?? false;
    if (ragEnabled && ragService) {
      try {
        const ragResult = await ragService.getRagContext(
          `informações sobre ${business.name}`,
        );
        if (ragResult) {
          infoText += `\nInformações adicionais:\n${ragResult}`;
        }
      } catch (ragErr) {
        // Falha na RAG não é bloqueante
        console.warn("Falha ao buscar RAG info:", ragErr);
      }
    }

    return {
      success: true,
      data: {
        businessId: business.business_id,
        name: business.name,
        address: business.address,
        extraInfo: infoText,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao obter informações do negócio: ${err.message}`,
    };
  }
}
