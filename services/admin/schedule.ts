// services/admin/schedule.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { deleteCache } from "@/lib/redisClient";
import { format, parse, isValid, addDays } from "date-fns";
import { ScheduleBlock } from "@/types";

/**
 * Atualiza os horários de funcionamento para um dia específico
 * @param businessId ID do negócio
 * @param dayOfWeek Dia da semana (ex: monday, tuesday)
 * @param startTime Hora de início (HH:MM ou "fechado")
 * @param endTime Hora de fim (HH:MM ou "fechado")
 */
export async function admin_updateBusinessHours(
  businessId: string,
  dayOfWeek: string,
  startTime: string,
  endTime: string,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("[Admin] Updating business hours", {
      businessId,
      dayOfWeek,
      startTime,
      endTime,
    });

    // Validar dia da semana
    const validDays = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];

    if (!validDays.includes(dayOfWeek.toLowerCase())) {
      return {
        success: false,
        message: `Dia inválido. Use um destes: ${validDays.join(", ")}.`,
      };
    }

    // Normalizar o dia para minúsculas
    const day = dayOfWeek.toLowerCase();

    // Validar formato de hora ou "fechado"/"null"
    let start: string | null = null;
    let end: string | null = null;

    const isClosed =
      startTime.toLowerCase() === "fechado" ||
      startTime.toLowerCase() === "null" ||
      endTime.toLowerCase() === "fechado" ||
      endTime.toLowerCase() === "null";

    // Se estiver fechado, ambos os horários devem ser null
    if (isClosed) {
      start = null;
      end = null;
    } else {
      // Validar formato de hora (HH:MM)
      const timeRegex = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;

      if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
        return {
          success: false,
          message:
            "Formato de hora inválido. Use o formato HH:MM (ex: 09:00, 18:30) ou 'fechado'.",
        };
      }

      // Garantir que o horário de início é anterior ao de fim
      const [startHour, startMinute] = startTime.split(":").map(Number);
      const [endHour, endMinute] = endTime.split(":").map(Number);

      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;

      if (startMinutes >= endMinutes) {
        return {
          success: false,
          message: "O horário de início deve ser anterior ao horário de fim.",
        };
      }

      // Padronizar para formato HH:MM
      start = startTime.padStart(5, "0");
      end = endTime.padStart(5, "0");
    }

    // Obter configuração atual do negócio
    const { data, error: fetchError } = await supabaseClient
      .from("businesses")
      .select("config")
      .eq("business_id", businessId)
      .single();

    if (fetchError) {
      logger.error("Error fetching business config", {
        error: fetchError.message,
        businessId,
      });
      return {
        success: false,
        message: `Erro ao buscar configuração: ${fetchError.message}`,
      };
    }

    // Extrair a configuração atual de horários
    const config = data?.config || {};
    const businessHours = config.businessHours || {};

    // Atualizar o dia específico
    businessHours[day] = { start, end };

    // Atualizar a configuração no banco de dados
    const { error: updateError } = await supabaseClient
      .from("businesses")
      .update({
        config: {
          ...config,
          businessHours,
        },
      })
      .eq("business_id", businessId);

    if (updateError) {
      logger.error("Error updating business hours", {
        error: updateError.message,
        businessId,
        day,
      });
      return {
        success: false,
        message: `Erro ao atualizar horários: ${updateError.message}`,
      };
    }

    // Invalidar o cache de configuração
    await deleteCache(`business_config:${businessId}`);

    logger.info("Business hours updated successfully", {
      businessId,
      day,
      start,
      end,
    });

    // Mensagem de sucesso
    const dayNames = {
      monday: "Segunda-feira",
      tuesday: "Terça-feira",
      wednesday: "Quarta-feira",
      thursday: "Quinta-feira",
      friday: "Sexta-feira",
      saturday: "Sábado",
      sunday: "Domingo",
    };

    const dayName = dayNames[day as keyof typeof dayNames] || day;

    let successMessage = "";
    if (isClosed) {
      successMessage = `Horário de funcionamento atualizado: ${dayName} definido como fechado.`;
    } else {
      successMessage = `Horário de funcionamento atualizado: ${dayName} de ${start} às ${end}.`;
    }

    return {
      success: true,
      message: successMessage,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_updateBusinessHours", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      dayOfWeek,
    });

    return {
      success: false,
      message:
        "Ocorreu um erro inesperado ao atualizar os horários de funcionamento.",
    };
  }
}

/**
 * Cria um bloqueio na agenda (período indisponível para agendamentos)
 * @param businessId ID do negócio
 * @param title Título ou descrição do bloqueio
 * @param startTimeIso Data e hora de início (ISO 8601)
 * @param endTimeIso Data e hora de fim (ISO 8601)
 */
export async function admin_createScheduleBlock(
  businessId: string,
  title: string,
  startTimeIso: string,
  endTimeIso: string,
): Promise<{ success: boolean; message: string; blockId?: string }> {
  try {
    logger.info("[Admin] Creating schedule block", {
      businessId,
      title,
      startTimeIso,
      endTimeIso,
    });

    // Validar título
    if (!title || title.trim().length < 2) {
      return {
        success: false,
        message: "O título do bloqueio deve ter pelo menos 2 caracteres.",
      };
    }

    // Validar formato das datas ISO
    const startDate = new Date(startTimeIso);
    const endDate = new Date(endTimeIso);

    if (!isValid(startDate) || !isValid(endDate)) {
      return {
        success: false,
        message:
          "Formato de data/hora inválido. Use o formato ISO 8601 (ex: 2025-12-31T14:00:00Z).",
      };
    }

    // Validar período (início deve ser anterior ao fim)
    if (startDate >= endDate) {
      return {
        success: false,
        message: "A data/hora de início deve ser anterior à data/hora de fim.",
      };
    }

    // Validar se não está no passado
    const now = new Date();
    if (startDate < now) {
      return {
        success: false,
        message:
          "Não é possível criar bloqueios com data de início no passado.",
      };
    }

    // Criar o bloqueio
    const blockId = crypto.randomUUID();

    const { error } = await supabaseClient.from("schedule_blocks").insert({
      block_id: blockId,
      business_id: businessId,
      title: title.trim(),
      start_time: startDate.toISOString(),
      end_time: endDate.toISOString(),
      created_at: now.toISOString(),
    });

    if (error) {
      logger.error("Error creating schedule block", {
        error: error.message,
        businessId,
      });
      return {
        success: false,
        message: `Erro ao criar bloqueio: ${error.message}`,
      };
    }

    logger.info("Schedule block created successfully", {
      businessId,
      blockId,
    });

    // Formatar datas para exibição
    const startDateFormatted = format(startDate, "dd/MM/yyyy HH:mm");
    const endDateFormatted = format(endDate, "dd/MM/yyyy HH:mm");

    return {
      success: true,
      message: `Bloqueio de agenda criado com sucesso! Período: ${startDateFormatted} até ${endDateFormatted}.`,
      blockId,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_createScheduleBlock", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      title,
    });

    return {
      success: false,
      message: "Ocorreu um erro inesperado ao criar o bloqueio de agenda.",
    };
  }
}

/**
 * Lista os bloqueios de agenda, opcionalmente filtrando por período
 * @param businessId ID do negócio
 * @param startDate Data de início para filtrar (opcional, formato: YYYY-MM-DD)
 * @param endDate Data de fim para filtrar (opcional, formato: YYYY-MM-DD)
 */
export async function admin_listScheduleBlocks(
  businessId: string,
  startDate?: string,
  endDate?: string,
): Promise<ScheduleBlock[]> {
  try {
    logger.info("[Admin] Listing schedule blocks", {
      businessId,
      startDate,
      endDate,
    });

    // Determinar período de filtro
    let filterStartDate = new Date();
    let filterEndDate: Date;

    // Se startDate foi fornecido, usá-lo; caso contrário, usar hoje
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      filterStartDate = new Date(`${startDate}T00:00:00`);

      // Se a data é inválida, usar hoje
      if (!isValid(filterStartDate)) {
        filterStartDate = new Date();
      }
    }

    // Se endDate foi fornecido, usá-lo; caso contrário, usar startDate + 90 dias
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      filterEndDate = new Date(`${endDate}T23:59:59`);

      // Se a data é inválida, usar startDate + 90 dias
      if (!isValid(filterEndDate)) {
        filterEndDate = addDays(filterStartDate, 90);
      }
    } else {
      filterEndDate = addDays(filterStartDate, 90);
    }

    // Garantir que endDate é após startDate
    if (filterEndDate < filterStartDate) {
      filterEndDate = addDays(filterStartDate, 90);
    }

    // Formatar datas para a query
    const startIso = filterStartDate.toISOString();
    const endIso = filterEndDate.toISOString();

    // Buscar bloqueios de agenda para o período
    let query = supabaseClient
      .from("schedule_blocks")
      .select("*")
      .eq("business_id", businessId)
      .or(`start_time.lte.${endIso},end_time.gte.${startIso}`);

    const { data, error } = await query;

    if (error) {
      logger.error("Error fetching schedule blocks", {
        error: error.message,
        businessId,
      });
      throw new Error(`Failed to fetch schedule blocks: ${error.message}`);
    }

    logger.debug("Schedule blocks retrieved", {
      businessId,
      count: data?.length || 0,
    });

    return data || [];
  } catch (error) {
    logger.error("Unexpected error in admin_listScheduleBlocks", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });
    throw error;
  }
}

/**
 * Remove um bloqueio de agenda
 * @param businessId ID do negócio
 * @param title Título exato do bloqueio
 * @param startTimeIso Data e hora de início exatas (ISO 8601)
 */
export async function admin_deleteScheduleBlock(
  businessId: string,
  title: string,
  startTimeIso: string,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("[Admin] Deleting schedule block", {
      businessId,
      title,
      startTimeIso,
    });

    // Validar parâmetros básicos
    if (!title || !startTimeIso) {
      return {
        success: false,
        message:
          "Título e data/hora de início são necessários para identificar o bloqueio.",
      };
    }

    // Validar formato da data ISO
    const startDate = new Date(startTimeIso);

    if (!isValid(startDate)) {
      return {
        success: false,
        message:
          "Formato de data/hora inválido. Use o formato ISO 8601 (ex: 2025-12-31T14:00:00Z).",
      };
    }

    // Buscar o bloqueio específico
    const { data, error: fetchError } = await supabaseClient
      .from("schedule_blocks")
      .select("block_id")
      .eq("business_id", businessId)
      .eq("title", title)
      .eq("start_time", startDate.toISOString())
      .maybeSingle();

    if (fetchError) {
      logger.error("Error fetching schedule block for deletion", {
        error: fetchError.message,
        businessId,
        title,
        startTimeIso,
      });
      return {
        success: false,
        message: `Erro ao buscar bloqueio: ${fetchError.message}`,
      };
    }

    if (!data) {
      logger.warn("Schedule block not found for deletion", {
        businessId,
        title,
        startTimeIso,
      });
      return {
        success: false,
        message:
          "Bloqueio não encontrado com o título e data/hora especificados.",
      };
    }

    // Remover o bloqueio
    const { error: deleteError } = await supabaseClient
      .from("schedule_blocks")
      .delete()
      .eq("block_id", data.block_id);

    if (deleteError) {
      logger.error("Error deleting schedule block", {
        error: deleteError.message,
        businessId,
        blockId: data.block_id,
      });
      return {
        success: false,
        message: `Erro ao remover bloqueio: ${deleteError.message}`,
      };
    }

    logger.info("Schedule block deleted successfully", {
      businessId,
      blockId: data.block_id,
    });

    // Formatar data para exibição
    const startDateFormatted = format(startDate, "dd/MM/yyyy HH:mm");

    return {
      success: true,
      message: `Bloqueio de agenda "${title}" em ${startDateFormatted} foi removido com sucesso!`,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_deleteScheduleBlock", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      title,
      startTimeIso,
    });

    return {
      success: false,
      message: "Ocorreu um erro inesperado ao remover o bloqueio de agenda.",
    };
  }
}
