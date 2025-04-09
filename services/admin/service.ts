// services/admin/service.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { Service } from "@/types";

/**
 * Lista todos os serviços cadastrados (ativos e inativos)
 * @param businessId ID do negócio
 */
export async function admin_listServices(
  businessId: string,
): Promise<Service[]> {
  try {
    logger.info("[Admin] Listing all services", { businessId });

    const { data, error } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .order("name");

    if (error) {
      logger.error("Error fetching services for admin", {
        error: error.message,
        businessId,
      });
      throw new Error(`Failed to fetch services: ${error.message}`);
    }

    logger.debug("Services listed successfully for admin", {
      businessId,
      count: data.length,
    });

    return data;
  } catch (error) {
    logger.error("Unexpected error in admin_listServices", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });
    throw error;
  }
}

/**
 * Adiciona um novo serviço
 * @param businessId ID do negócio
 * @param name Nome do serviço
 * @param durationMinutes Duração em minutos
 * @param price Preço
 * @param description Descrição (opcional)
 */
export async function admin_addService(
  businessId: string,
  name: string,
  durationMinutes: number,
  price: number,
  description?: string,
): Promise<{ success: boolean; message: string; serviceId?: string }> {
  try {
    logger.info("[Admin] Adding service", {
      businessId,
      name,
      durationMinutes,
      price,
    });

    // Validar entradas
    if (!name || name.trim().length < 2) {
      return {
        success: false,
        message: "O nome do serviço deve ter pelo menos 2 caracteres.",
      };
    }

    if (!durationMinutes || durationMinutes <= 0) {
      return {
        success: false,
        message: "A duração deve ser um número positivo de minutos.",
      };
    }

    if (price < 0) {
      return {
        success: false,
        message: "O preço não pode ser negativo.",
      };
    }

    // Verificar se já existe um serviço com o mesmo nome
    const { data: existingService, error: checkError } = await supabaseClient
      .from("services")
      .select("service_id")
      .eq("business_id", businessId)
      .eq("name", name)
      .maybeSingle();

    if (checkError) {
      logger.error("Error checking for existing service", {
        error: checkError.message,
        businessId,
        name,
      });
      return {
        success: false,
        message: `Erro ao verificar serviços existentes: ${checkError.message}`,
      };
    }

    if (existingService) {
      logger.warn("Service with this name already exists", {
        businessId,
        name,
        existingServiceId: existingService.service_id,
      });
      return {
        success: false,
        message: `Já existe um serviço chamado "${name}". Por favor, use outro nome.`,
      };
    }

    // Inserir o novo serviço
    const serviceId = crypto.randomUUID();

    const { error: insertError } = await supabaseClient
      .from("services")
      .insert({
        service_id: serviceId,
        business_id: businessId,
        name: name.trim(),
        description: description ? description.trim() : "",
        duration: durationMinutes,
        price: price,
        active: true,
      });

    if (insertError) {
      logger.error("Error inserting new service", {
        error: insertError.message,
        businessId,
        name,
      });
      return {
        success: false,
        message: `Erro ao adicionar serviço: ${insertError.message}`,
      };
    }

    logger.info("Service added successfully", {
      businessId,
      name,
      serviceId,
    });

    return {
      success: true,
      message: `Serviço "${name}" adicionado com sucesso!`,
      serviceId,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_addService", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      name,
    });

    return {
      success: false,
      message: "Ocorreu um erro inesperado ao adicionar o serviço.",
    };
  }
}

/**
 * Atualiza um serviço existente
 * @param businessId ID do negócio
 * @param currentServiceName Nome atual do serviço
 * @param newName Novo nome (opcional)
 * @param newDescription Nova descrição (opcional)
 * @param newDurationMinutes Nova duração em minutos (opcional)
 * @param newPrice Novo preço (opcional)
 * @param isActive Status de ativo/inativo (opcional)
 */
export async function admin_updateService(
  businessId: string,
  currentServiceName: string,
  newName?: string,
  newDescription?: string,
  newDurationMinutes?: number,
  newPrice?: number,
  isActive?: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("[Admin] Updating service", {
      businessId,
      currentServiceName,
      newName,
      newDurationMinutes,
      newPrice,
      isActive,
    });

    // Validar entradas básicas
    if (!currentServiceName) {
      return {
        success: false,
        message: "É necessário fornecer o nome atual do serviço.",
      };
    }

    if (newName && newName.trim().length < 2) {
      return {
        success: false,
        message: "O novo nome do serviço deve ter pelo menos 2 caracteres.",
      };
    }

    if (newDurationMinutes !== undefined && newDurationMinutes <= 0) {
      return {
        success: false,
        message: "A duração deve ser um número positivo de minutos.",
      };
    }

    if (newPrice !== undefined && newPrice < 0) {
      return {
        success: false,
        message: "O preço não pode ser negativo.",
      };
    }

    // Buscar o serviço pelo nome atual
    const { data: existingService, error: fetchError } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .eq("name", currentServiceName)
      .single();

    if (fetchError) {
      logger.warn("Service not found for update", {
        businessId,
        currentServiceName,
        error: fetchError.message,
      });
      return {
        success: false,
        message: `Serviço "${currentServiceName}" não encontrado.`,
      };
    }

    // Se o nome estiver sendo alterado, verificar duplicação
    if (newName && newName !== currentServiceName) {
      const { data: nameCheck, error: nameCheckError } = await supabaseClient
        .from("services")
        .select("service_id")
        .eq("business_id", businessId)
        .eq("name", newName)
        .maybeSingle();

      if (nameCheckError) {
        logger.error("Error checking for service name duplication", {
          error: nameCheckError.message,
          businessId,
          newName,
        });
        return {
          success: false,
          message: `Erro ao verificar duplicidade de nome: ${nameCheckError.message}`,
        };
      }

      if (nameCheck) {
        logger.warn("Duplicate service name", {
          businessId,
          currentServiceName,
          newName,
        });
        return {
          success: false,
          message: `Já existe um serviço chamado "${newName}". Por favor, use outro nome.`,
        };
      }
    }

    // Construir o objeto de atualização com os campos alterados
    const updateObj: Record<string, any> = {};

    if (newName !== undefined) updateObj.name = newName.trim();
    if (newDescription !== undefined)
      updateObj.description = newDescription.trim();
    if (newDurationMinutes !== undefined)
      updateObj.duration = newDurationMinutes;
    if (newPrice !== undefined) updateObj.price = newPrice;
    if (isActive !== undefined) updateObj.active = isActive;

    // Se não há nada para atualizar, retornar
    if (Object.keys(updateObj).length === 0) {
      return {
        success: true,
        message: "Nenhuma alteração realizada no serviço.",
      };
    }

    // Atualizar o serviço
    const { error: updateError } = await supabaseClient
      .from("services")
      .update(updateObj)
      .eq("business_id", businessId)
      .eq("service_id", existingService.service_id);

    if (updateError) {
      logger.error("Error updating service", {
        error: updateError.message,
        businessId,
        serviceId: existingService.service_id,
      });
      return {
        success: false,
        message: `Erro ao atualizar serviço: ${updateError.message}`,
      };
    }

    logger.info("Service updated successfully", {
      businessId,
      serviceId: existingService.service_id,
      currentServiceName,
      newName,
    });

    // Mensagem de sucesso dinâmica
    let successMessage = `Serviço "${currentServiceName}" atualizado com sucesso!`;

    if (isActive !== undefined) {
      successMessage += ` Status: ${isActive ? "Ativo" : "Inativo"}.`;
    }

    return {
      success: true,
      message: successMessage,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_updateService", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      currentServiceName,
    });

    return {
      success: false,
      message: "Ocorreu um erro inesperado ao atualizar o serviço.",
    };
  }
}
