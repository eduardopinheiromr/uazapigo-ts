// services/appointment.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { format, addDays, parse, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Appointment, TimeSlot } from "@/types";
import { getOrCreateCustomer } from "@/lib/utils";

/**
 * Verifica e retorna as próximas datas com horários disponíveis
 * @param businessId ID do negócio
 * @param serviceName Nome do serviço (opcional)
 * @param referenceMonth Mês de referência (opcional, formato: YYYY-MM)
 */
export async function checkAvailableDates(
  businessId: string,
  serviceName?: string,
  referenceMonth?: string,
): Promise<
  { date: string; formattedDate: string; hasAvailability: boolean }[]
> {
  try {
    logger.info("Checking available dates", {
      businessId,
      serviceName,
      referenceMonth,
    });

    // Determinar o período de busca
    const today = new Date();
    let startDate = today;
    let endDate = addDays(today, 30); // Default: próximos 30 dias

    // Se um mês de referência foi fornecido, usar esse período
    if (referenceMonth && /^\d{4}-\d{2}$/.test(referenceMonth)) {
      const [year, month] = referenceMonth.split("-").map(Number);
      startDate = new Date(year, month - 1, 1); // Primeiro dia do mês
      endDate = new Date(year, month, 0); // Último dia do mês

      // Se o mês de referência já passou, retornar array vazio
      if (startDate < today && endDate < today) {
        logger.debug("Reference month is in the past", {
          referenceMonth,
          businessId,
        });
        return [];
      }

      // Ajustar a data de início para hoje se estiver no passado
      if (startDate < today) {
        startDate = today;
      }
    }

    // Buscar o ID do serviço se o nome foi fornecido
    let serviceId: string | undefined;
    if (serviceName) {
      const { data: service, error } = await supabaseClient
        .from("services")
        .select("service_id")
        .eq("business_id", businessId)
        .eq("name", serviceName)
        .eq("active", true)
        .single();

      if (error || !service) {
        logger.warn("Service not found", {
          businessId,
          serviceName,
          error: error?.message,
        });
        return [];
      }

      serviceId = service.service_id;
    }

    // Buscar os horários de funcionamento do negócio
    const { data: business, error: businessError } = await supabaseClient
      .from("businesses")
      .select("config")
      .eq("business_id", businessId)
      .single();

    if (businessError || !business) {
      logger.error("Business not found", {
        businessId,
        error: businessError?.message,
      });
      return [];
    }

    const businessHours = business.config?.businessHours || {};

    // Buscar agendamentos existentes no período
    const startDateStr = format(startDate, "yyyy-MM-dd");
    const endDateStr = format(endDate, "yyyy-MM-dd");

    const { data: appointments, error: appointmentsError } =
      await supabaseClient
        .from("appointments")
        .select("start_time, end_time, service_id")
        .eq("business_id", businessId)
        .gte("start_time", `${startDateStr}T00:00:00`)
        .lte("start_time", `${endDateStr}T23:59:59`)
        .in("status", ["confirmed", "scheduled"]);

    if (appointmentsError) {
      logger.error("Error fetching appointments", {
        businessId,
        error: appointmentsError.message,
      });
      throw new Error(
        `Failed to fetch appointments: ${appointmentsError.message}`,
      );
    }

    // Buscar bloqueios de agenda no período
    const { data: blocks, error: blocksError } = await supabaseClient
      .from("schedule_blocks")
      .select("start_time, end_time")
      .eq("business_id", businessId)
      .gte("start_time", `${startDateStr}T00:00:00`)
      .lte("start_time", `${endDateStr}T23:59:59`);

    if (blocksError) {
      logger.error("Error fetching schedule blocks", {
        businessId,
        error: blocksError.message,
      });
      throw new Error(
        `Failed to fetch schedule blocks: ${blocksError.message}`,
      );
    }

    // Processar cada dia no período e verificar disponibilidade
    const availableDates = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dayNames = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
      ];
      const dayKey = dayNames[dayOfWeek];

      // Verificar se o negócio está aberto neste dia
      const dayHours = businessHours[dayKey];
      if (dayHours?.start && dayHours?.end) {
        const dateStr = format(currentDate, "yyyy-MM-dd");
        const formattedDate = format(currentDate, "EEEE, d 'de' MMMM", {
          locale: ptBR,
        });

        // Verificar disponibilidade para este dia
        // Se temos um serviceId específico, verificamos apenas para ele
        // Caso contrário, verificamos disponibilidade geral
        let hasAvailability = true;

        // Lógica simplificada: se o dia está totalmente bloqueado, não tem disponibilidade
        const isDayBlocked = blocks?.some((block) => {
          const blockStart = new Date(block.start_time);
          const blockEnd = new Date(block.end_time);
          return (
            blockStart.toDateString() === currentDate.toDateString() &&
            blockStart.getHours() <= parseInt(dayHours.start.split(":")[0]) &&
            blockEnd.getHours() >= parseInt(dayHours.end.split(":")[0])
          );
        });

        if (isDayBlocked) {
          hasAvailability = false;
        } else if (serviceId) {
          // Verificar se há pelo menos um slot disponível para o serviço
          // Lógica simplificada - em produção, precisaria verificar slots específicos
          const dayAppointments = appointments?.filter(
            (apt) =>
              new Date(apt.start_time).toDateString() ===
                currentDate.toDateString() &&
              (!serviceId || apt.service_id === serviceId),
          );

          // Se o dia está muito ocupado (mais de X agendamentos), considerar sem disponibilidade
          // Este é um heurística simples - na prática, precisaria verificar slots específicos
          if (dayAppointments && dayAppointments.length > 10) {
            hasAvailability = false;
          }
        }

        availableDates.push({
          date: dateStr,
          formattedDate: formattedDate,
          hasAvailability,
        });
      }

      // Avançar para o próximo dia
      currentDate.setDate(currentDate.getDate() + 1);
    }

    logger.debug("Available dates processed", {
      businessId,
      datesCount: availableDates.length,
    });

    return availableDates;
  } catch (error) {
    logger.error("Unexpected error in checkAvailableDates", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      serviceName,
    });
    throw error;
  }
}

/**
 * Verifica e retorna os horários disponíveis para um serviço em uma data específica
 * @param businessId ID do negócio
 * @param serviceName Nome do serviço
 * @param date Data desejada (formato: YYYY-MM-DD)
 */
export async function checkAvailableTimes(
  businessId: string,
  serviceName: string,
  date: string,
): Promise<TimeSlot[]> {
  try {
    logger.info("Checking available times", {
      businessId,
      serviceName,
      date,
    });

    // Validar o formato da data
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      logger.warn("Invalid date format", { date, businessId });
      throw new Error("Invalid date format. Please use YYYY-MM-DD format.");
    }

    // Buscar o serviço pelo nome
    const { data: service, error: serviceError } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .eq("name", serviceName)
      .eq("active", true)
      .single();

    if (serviceError || !service) {
      logger.warn("Service not found", {
        businessId,
        serviceName,
        error: serviceError?.message,
      });
      throw new Error(`Service '${serviceName}' not found or inactive.`);
    }

    // Buscar os horários de funcionamento do negócio
    const { data: business, error: businessError } = await supabaseClient
      .from("businesses")
      .select("config")
      .eq("business_id", businessId)
      .single();

    if (businessError || !business) {
      logger.error("Business not found", {
        businessId,
        error: businessError?.message,
      });
      throw new Error("Business not found");
    }

    // Determinar o dia da semana para a data especificada
    const appointmentDate = new Date(`${date}T00:00:00`);
    const dayOfWeek = appointmentDate.getDay();
    const dayNames = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const dayKey = dayNames[dayOfWeek];

    // Verificar se o negócio está aberto neste dia
    const businessHours = business.config?.businessHours || {};
    const dayHours = businessHours[dayKey];

    if (!dayHours?.start || !dayHours?.end) {
      logger.info("Business is closed on this day", {
        businessId,
        date,
        dayOfWeek: dayKey,
      });
      return [];
    }

    // Buscar agendamentos existentes para o dia
    const { data: appointments, error: appointmentsError } =
      await supabaseClient
        .from("appointments")
        .select("start_time, end_time")
        .eq("business_id", businessId)
        .gte("start_time", `${date}T00:00:00`)
        .lt("start_time", `${date}T23:59:59`)
        .in("status", ["confirmed", "scheduled"]);

    if (appointmentsError) {
      logger.error("Error fetching appointments", {
        businessId,
        error: appointmentsError.message,
      });
      throw new Error(
        `Failed to fetch appointments: ${appointmentsError.message}`,
      );
    }

    // Buscar bloqueios de agenda para o dia
    const { data: blocks, error: blocksError } = await supabaseClient
      .from("schedule_blocks")
      .select("start_time, end_time")
      .eq("business_id", businessId)
      .lte("start_time", `${date}T23:59:59`)
      .gte("end_time", `${date}T00:00:00`);

    if (blocksError) {
      logger.error("Error fetching schedule blocks", {
        businessId,
        error: blocksError.message,
      });
      throw new Error(
        `Failed to fetch schedule blocks: ${blocksError.message}`,
      );
    }

    // Gerar slots de tempo disponíveis
    const [startHour, startMinute] = dayHours.start.split(":").map(Number);
    const [endHour, endMinute] = dayHours.end.split(":").map(Number);

    const startDateTime = new Date(appointmentDate);
    startDateTime.setHours(startHour, startMinute, 0, 0);

    const endDateTime = new Date(appointmentDate);
    endDateTime.setHours(endHour, endMinute, 0, 0);

    // Ajustar para não mostrar horários passados se for hoje
    const today = new Date();
    if (
      appointmentDate.toDateString() === today.toDateString() &&
      today > startDateTime
    ) {
      startDateTime.setTime(today.getTime());
      // Arredondar para o próximo slot de 30 minutos
      const minutes = startDateTime.getMinutes();
      const roundedMinutes = Math.ceil(minutes / 30) * 30;
      startDateTime.setMinutes(roundedMinutes);
    }

    // Converter horários ocupados para objetos Date
    const busySlots = [
      ...(appointments || []).map((apt) => ({
        start: new Date(apt.start_time),
        end: new Date(apt.end_time),
      })),
      ...(blocks || []).map((block) => ({
        start: new Date(block.start_time),
        end: new Date(block.end_time),
      })),
    ];

    // Gerar slots de tempo com intervalos de 30 minutos
    const timeSlots: TimeSlot[] = [];
    const serviceDuration = service.duration;
    let currentSlot = new Date(startDateTime);

    while (currentSlot < endDateTime) {
      // Verificar se o tempo do serviço cabe antes do horário de fechamento
      const serviceEndTime = new Date(currentSlot);
      serviceEndTime.setMinutes(serviceEndTime.getMinutes() + serviceDuration);

      if (serviceEndTime > endDateTime) {
        break;
      }

      // Verificar se o slot está disponível (não conflita com agendamentos ou bloqueios)
      let isAvailable = true;
      for (const busy of busySlots) {
        if (
          (currentSlot >= busy.start && currentSlot < busy.end) ||
          (serviceEndTime > busy.start && serviceEndTime <= busy.end) ||
          (currentSlot <= busy.start && serviceEndTime >= busy.end)
        ) {
          isAvailable = false;
          break;
        }
      }

      // Adicionar o slot
      timeSlots.push({
        time: format(currentSlot, "HH:mm"),
        available: isAvailable,
      });

      // Avançar para o próximo slot (30 minutos)
      currentSlot.setMinutes(currentSlot.getMinutes() + 30);
    }

    logger.debug("Available time slots generated", {
      businessId,
      date,
      serviceName,
      slotsCount: timeSlots.length,
      availableSlotsCount: timeSlots.filter((s) => s.available).length,
    });

    return timeSlots;
  } catch (error) {
    logger.error("Unexpected error in checkAvailableTimes", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      serviceName,
      date,
    });
    throw error;
  }
}

/**
 * Cria um novo agendamento
 * @param businessId ID do negócio
 * @param customerPhone Telefone do cliente
 * @param serviceName Nome do serviço
 * @param date Data do agendamento (formato: YYYY-MM-DD)
 * @param time Hora do agendamento (formato: HH:MM)
 */
export async function createAppointment(
  businessId: string,
  customerPhone: string,
  serviceName: string,
  date: string,
  time: string,
): Promise<{ success: boolean; appointmentId?: string; message: string }> {
  try {
    logger.info("Creating appointment", {
      businessId,
      customerPhone,
      serviceName,
      date,
      time,
    });

    // Validar formato da data e hora
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return {
        success: false,
        message: "Invalid date format. Please use YYYY-MM-DD.",
      };
    }

    if (!/^\d{1,2}:\d{2}$/.test(time)) {
      return {
        success: false,
        message: "Invalid time format. Please use HH:MM.",
      };
    }

    // Buscar o serviço pelo nome
    const { data: service, error: serviceError } = await supabaseClient
      .from("services")
      .select("*")
      .eq("business_id", businessId)
      .eq("name", serviceName)
      .eq("active", true)
      .single();

    if (serviceError || !service) {
      logger.warn("Service not found", {
        businessId,
        serviceName,
        error: serviceError?.message,
      });
      return {
        success: false,
        message: `Service '${serviceName}' not found or inactive.`,
      };
    }

    // Obter ou criar o cliente
    const customerId = await getOrCreateCustomer(businessId, customerPhone);
    if (!customerId) {
      logger.error("Failed to get or create customer", {
        businessId,
        customerPhone,
      });
      return {
        success: false,
        message: "Failed to process customer information.",
      };
    }

    // Criar a data/hora de início do agendamento
    const startTime = `${date}T${time}:00`;

    // Usar a função RPC do Supabase para criar o agendamento com verificação de disponibilidade
    const { data: appointmentId, error } = await supabaseClient.rpc(
      "create_appointment_transaction",
      {
        p_business_id: businessId,
        p_customer_id: customerId,
        p_service_id: service.service_id,
        p_start_time: startTime,
      },
    );

    if (error) {
      // Verificar mensagem de erro para fornecer feedback adequado
      if (error.message.includes("Horário não disponível")) {
        logger.warn("Appointment slot unavailable", {
          error: error.message,
          businessId,
          date,
          time,
        });
        return {
          success: false,
          message:
            "O horário selecionado não está mais disponível. Por favor, escolha outro horário.",
        };
      } else if (error.message.includes("Horário bloqueado")) {
        logger.warn("Appointment slot blocked", {
          error: error.message,
          businessId,
          date,
          time,
        });
        return {
          success: false,
          message:
            "O horário selecionado está bloqueado na agenda. Por favor, escolha outro horário.",
        };
      } else {
        logger.error("Error creating appointment", {
          error: error.message,
          businessId,
          customerPhone,
        });
        return {
          success: false,
          message:
            "Ocorreu um erro ao criar o agendamento. Por favor, tente novamente.",
        };
      }
    }

    logger.info("Appointment created successfully", {
      businessId,
      customerPhone,
      appointmentId,
    });

    return {
      success: true,
      appointmentId,
      message: `Agendamento criado com sucesso para ${serviceName} em ${date} às ${time}.`,
    };
  } catch (error) {
    logger.error("Unexpected error in createAppointment", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerPhone,
      serviceName,
      date,
      time,
    });

    return {
      success: false,
      message:
        "Ocorreu um erro inesperado. Por favor, tente novamente mais tarde.",
    };
  }
}

/**
 * Lista os próximos agendamentos do cliente
 * @param businessId ID do negócio
 * @param customerPhone Telefone do cliente
 */
export async function listMyAppointments(
  businessId: string,
  customerPhone: string,
): Promise<Appointment[]> {
  try {
    logger.info("Listing customer appointments", {
      businessId,
      customerPhone,
    });

    // Buscar o customer_id pelo telefone
    const { data: customer, error: customerError } = await supabaseClient
      .from("customers")
      .select("customer_id")
      .eq("business_id", businessId)
      .eq("phone", customerPhone)
      .single();

    if (customerError || !customer) {
      logger.debug("Customer not found, no appointments", {
        businessId,
        customerPhone,
      });
      return [];
    }

    // Buscar os agendamentos futuros
    const now = new Date().toISOString();
    const { data: appointments, error: appointmentsError } =
      await supabaseClient
        .from("appointments")
        .select(`
        appointment_id,
        business_id,
        customer_id,
        service_id,
        start_time,
        end_time,
        status,
        services:service_id (name, price)
      `)
        .eq("business_id", businessId)
        .eq("customer_id", customer.customer_id)
        .gte("start_time", now)
        .in("status", ["scheduled", "confirmed"])
        .order("start_time", { ascending: true });

    if (appointmentsError) {
      logger.error("Error fetching appointments", {
        error: appointmentsError.message,
        businessId,
        customerPhone,
      });
      throw new Error(
        `Failed to fetch appointments: ${appointmentsError.message}`,
      );
    }

    // Formatar os agendamentos para retorno
    const formattedAppointments = appointments.map((apt) => ({
      ...apt,
      service: apt.services?.[0]?.name || "Serviço desconhecido",
      price: apt.services?.[0]?.price || 0,
      customer_phone: customerPhone,
    }));

    logger.debug("Appointments found", {
      businessId,
      customerPhone,
      count: formattedAppointments.length,
    });

    return formattedAppointments;
  } catch (error) {
    logger.error("Unexpected error in listMyAppointments", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerPhone,
    });
    throw error;
  }
}

/**
 * Cancela um agendamento
 * @param businessId ID do negócio
 * @param customerPhone Telefone do cliente
 * @param appointmentDate Data do agendamento (formato: YYYY-MM-DD)
 * @param appointmentTime Hora do agendamento (formato: HH:MM)
 * @param serviceName Nome do serviço (opcional)
 */
export async function cancelAppointment(
  businessId: string,
  customerPhone: string,
  appointmentDate: string,
  appointmentTime: string,
  serviceName?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("Cancelling appointment", {
      businessId,
      customerPhone,
      appointmentDate,
      appointmentTime,
      serviceName,
    });

    // Buscar o customer_id pelo telefone
    const { data: customer, error: customerError } = await supabaseClient
      .from("customers")
      .select("customer_id")
      .eq("business_id", businessId)
      .eq("phone", customerPhone)
      .single();

    if (customerError || !customer) {
      logger.warn("Customer not found for cancellation", {
        businessId,
        customerPhone,
      });
      return {
        success: false,
        message:
          "Cliente não encontrado. Não foi possível localizar seus agendamentos.",
      };
    }

    // Buscar o agendamento pela data, hora e opcionalmente serviço
    const startDateTimePrefix = `${appointmentDate}T${appointmentTime}`;
    const startOfHour = `${startDateTimePrefix}:00`;
    const endOfHour = `${startDateTimePrefix}:59`;

    let query = supabaseClient
      .from("appointments")
      .select(`
    appointment_id,
    status,
    services:service_id (name)
  `)
      .eq("business_id", businessId)
      .eq("customer_id", customer.customer_id)
      .gte("start_time", startOfHour)
      .lt("start_time", endOfHour)
      .in("status", ["scheduled", "confirmed"]);

    // Se o nome do serviço foi fornecido, adicionar à query via join
    if (serviceName) {
      // Buscar o serviço pelo nome para obter o ID
      const { data: service, error: serviceError } = await supabaseClient
        .from("services")
        .select("service_id")
        .eq("business_id", businessId)
        .eq("name", serviceName)
        .single();

      if (!serviceError && service) {
        query = query.eq("service_id", service.service_id);
      }
    }

    const { data: appointments, error: appointmentsError } = await query;

    if (appointmentsError) {
      logger.error("Error fetching appointment for cancellation", {
        error: appointmentsError.message,
        businessId,
        customerPhone,
      });
      return {
        success: false,
        message: "Erro ao buscar o agendamento. Por favor, tente novamente.",
      };
    }

    if (!appointments || appointments.length === 0) {
      logger.warn("No appointment found for cancellation", {
        businessId,
        customerPhone,
        appointmentDate,
        appointmentTime,
      });
      return {
        success: false,
        message: "Nenhum agendamento encontrado na data e hora especificadas.",
      };
    }

    if (appointments.length > 1) {
      // Múltiplos agendamentos encontrados no mesmo horário
      if (!serviceName) {
        // Se não foi especificado um serviço, pedir mais informações
        const servicesList = appointments
          .map((apt) => apt.services?.[0]?.name || "Serviço desconhecido")
          .join(", ");

        return {
          success: false,
          message: `Existem múltiplos agendamentos neste horário. Por favor, especifique qual serviço deseja cancelar: ${servicesList}.`,
        };
      }
    }

    // Cancelar o agendamento (o primeiro da lista ou o que corresponde ao serviço)
    const appointmentToCancel = appointments[0];

    if (appointmentToCancel.status === "cancelled") {
      return { success: false, message: "Este agendamento já está cancelado." };
    }

    // Atualizar o status para cancelado
    const { error: updateError } = await supabaseClient
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("appointment_id", appointmentToCancel.appointment_id);

    if (updateError) {
      logger.error("Error cancelling appointment", {
        error: updateError.message,
        businessId,
        appointmentId: appointmentToCancel.appointment_id,
      });

      return {
        success: false,
        message:
          "Ocorreu um erro ao cancelar o agendamento. Por favor, tente novamente.",
      };
    }

    logger.info("Appointment cancelled successfully", {
      businessId,
      customerPhone,
      appointmentId: appointmentToCancel.appointment_id,
    });

    const serviceCancelled =
      appointmentToCancel.services?.[0]?.name || "Serviço";

    return {
      success: true,
      message: `Seu agendamento de ${serviceCancelled} em ${appointmentDate} às ${appointmentTime} foi cancelado com sucesso.`,
    };
  } catch (error) {
    logger.error("Unexpected error in cancelAppointment", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerPhone,
      appointmentDate,
      appointmentTime,
    });

    return {
      success: false,
      message:
        "Ocorreu um erro inesperado. Por favor, tente novamente mais tarde.",
    };
  }
}

/**
 * Reagenda um compromisso
 * @param businessId ID do negócio
 * @param customerPhone Telefone do cliente
 * @param originalDate Data original (formato: YYYY-MM-DD)
 * @param originalTime Hora original (formato: HH:MM)
 * @param newDate Nova data (formato: YYYY-MM-DD)
 * @param newTime Nova hora (formato: HH:MM)
 * @param serviceName Nome do serviço (opcional)
 */
export async function rescheduleAppointment(
  businessId: string,
  customerPhone: string,
  originalDate: string,
  originalTime: string,
  newDate: string,
  newTime: string,
  serviceName?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("Rescheduling appointment", {
      businessId,
      customerPhone,
      originalDate,
      originalTime,
      newDate,
      newTime,
      serviceName,
    });

    // Validar formatos de data e hora
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(originalDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(newDate)
    ) {
      return {
        success: false,
        message: "Formato de data inválido. Use YYYY-MM-DD.",
      };
    }

    if (
      !/^\d{1,2}:\d{2}$/.test(originalTime) ||
      !/^\d{1,2}:\d{2}$/.test(newTime)
    ) {
      return {
        success: false,
        message: "Formato de hora inválido. Use HH:MM.",
      };
    }

    // Buscar o customer_id pelo telefone
    const { data: customer, error: customerError } = await supabaseClient
      .from("customers")
      .select("customer_id")
      .eq("business_id", businessId)
      .eq("phone", customerPhone)
      .single();

    if (customerError || !customer) {
      logger.warn("Customer not found for rescheduling", {
        businessId,
        customerPhone,
      });
      return {
        success: false,
        message:
          "Cliente não encontrado. Não foi possível localizar seus agendamentos.",
      };
    }

    // Buscar o agendamento original
    const originalStartTimePrefix = `${originalDate}T${originalTime}`;

    let query = supabaseClient
      .from("appointments")
      .select(`
        appointment_id,
        status,
        service_id,
        services:service_id (name, duration)
      `)
      .eq("business_id", businessId)
      .eq("customer_id", customer.customer_id)
      .like("start_time", `${originalStartTimePrefix}%`)
      .in("status", ["scheduled", "confirmed"]);

    // Se o nome do serviço foi fornecido, adicionar à query
    if (serviceName) {
      // Buscar o serviço pelo nome para obter o ID
      const { data: service, error: serviceError } = await supabaseClient
        .from("services")
        .select("service_id")
        .eq("business_id", businessId)
        .eq("name", serviceName)
        .single();

      if (!serviceError && service) {
        query = query.eq("service_id", service.service_id);
      }
    }

    const { data: appointments, error: appointmentsError } = await query;

    if (appointmentsError) {
      logger.error("Error fetching appointment for rescheduling", {
        error: appointmentsError.message,
        businessId,
        customerPhone,
      });
      return {
        success: false,
        message: "Erro ao buscar o agendamento. Por favor, tente novamente.",
      };
    }

    if (!appointments || appointments.length === 0) {
      logger.warn("No appointment found for rescheduling", {
        businessId,
        customerPhone,
        originalDate,
        originalTime,
      });
      return {
        success: false,
        message: "Nenhum agendamento encontrado na data e hora especificadas.",
      };
    }

    if (appointments.length > 1 && !serviceName) {
      // Múltiplos agendamentos encontrados no mesmo horário
      const servicesList = appointments
        .map((apt) => apt.services?.[0]?.name || "Serviço desconhecido")
        .join(", ");

      return {
        success: false,
        message: `Existem múltiplos agendamentos neste horário. Por favor, especifique qual serviço deseja reagendar: ${servicesList}.`,
      };
    }

    // Selecionar o agendamento a ser alterado
    const appointmentToReschedule = appointments[0];
    const serviceDuration =
      appointmentToReschedule.services?.[0]?.duration || 60;

    // Verificar disponibilidade do novo horário
    // Criar a data/hora de início do novo agendamento
    const newStartTime = `${newDate}T${newTime}:00`;

    // Verificar disponibilidade do novo horário usando a função RPC
    try {
      // Como não podemos verificar sem criar, vamos cancelar o agendamento atual primeiro
      const { error: cancelError } = await supabaseClient
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("appointment_id", appointmentToReschedule.appointment_id);

      if (cancelError) {
        logger.error("Error cancelling original appointment for reschedule", {
          error: cancelError.message,
          businessId,
          appointmentId: appointmentToReschedule.appointment_id,
        });

        return {
          success: false,
          message:
            "Ocorreu um erro ao processar seu reagendamento. Por favor, tente novamente.",
        };
      }

      // Tentar criar o novo agendamento
      const { data: newAppointmentId, error: createError } =
        await supabaseClient.rpc("create_appointment_transaction", {
          p_business_id: businessId,
          p_customer_id: customer.customer_id,
          p_service_id: appointmentToReschedule.service_id,
          p_start_time: newStartTime,
        });

      if (createError) {
        // Se falhar, restaurar o agendamento original
        await supabaseClient
          .from("appointments")
          .update({ status: "confirmed" })
          .eq("appointment_id", appointmentToReschedule.appointment_id);

        if (
          createError.message.includes("Horário não disponível") ||
          createError.message.includes("Horário bloqueado")
        ) {
          return {
            success: false,
            message:
              "O novo horário selecionado não está disponível. Por favor, escolha outro horário.",
          };
        } else {
          logger.error("Error creating new appointment for reschedule", {
            error: createError.message,
            businessId,
            customerPhone,
          });

          return {
            success: false,
            message:
              "Ocorreu um erro ao criar o novo agendamento. Por favor, tente novamente.",
          };
        }
      }

      logger.info("Appointment rescheduled successfully", {
        businessId,
        customerPhone,
        oldAppointmentId: appointmentToReschedule.appointment_id,
        newAppointmentId,
      });

      const serviceRescheduled =
        appointmentToReschedule.services?.[0]?.name || "Serviço";

      return {
        success: true,
        message: `Seu agendamento de ${serviceRescheduled} foi alterado com sucesso de ${originalDate} às ${originalTime} para ${newDate} às ${newTime}.`,
      };
    } catch (rpcError) {
      logger.error("Error in rescheduling RPC", {
        error: rpcError instanceof Error ? rpcError.message : String(rpcError),
        businessId,
        customerPhone,
      });

      // Restaurar o agendamento original em caso de erro
      await supabaseClient
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("appointment_id", appointmentToReschedule.appointment_id);

      return {
        success: false,
        message:
          "Ocorreu um erro no reagendamento. Seu agendamento original foi mantido.",
      };
    }
  } catch (error) {
    logger.error("Unexpected error in rescheduleAppointment", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerPhone,
      originalDate,
      originalTime,
      newDate,
      newTime,
    });

    return {
      success: false,
      message:
        "Ocorreu um erro inesperado. Por favor, tente novamente mais tarde.",
    };
  }
}
