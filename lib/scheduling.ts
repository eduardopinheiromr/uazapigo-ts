// lib/scheduling.ts - Ajustado para compatibilidade com o banco de dados

import supabaseClient from "./supabaseClient";
import { TimeSlot, Appointment, Service } from "@/types";
import {
  format,
  parse,
  addHours,
  addMinutes,
  isAfter,
  isBefore,
  isSameDay,
} from "date-fns";
import {
  getBusinessConfig,
  isBusinessOpen,
  getDayOfWeekInPortuguese,
  getOrCreateCustomer,
} from "./utils";
import logger from "./logger";

/**
 * Verifica a disponibilidade de horários para um serviço em uma data específica
 */
// export async function checkAvailability(
//   businessId: string,
//   serviceId: string,
//   appointmentDate: Date,
// ): Promise<TimeSlot[]> {
//   try {
//     logger.info("Checking availability", {
//       businessId,
//       serviceId,
//       date: appointmentDate.toISOString(),
//     });

//     // Obter configuração do negócio
//     const businessConfig = await getBusinessConfig(businessId);
//     if (!businessConfig) {
//       throw new Error("Business configuration not found");
//     }

//     // Verificar se o negócio está aberto na data especificada
//     const dayOfWeek = appointmentDate.getDay();
//     const days = [
//       "sunday",
//       "monday",
//       "tuesday",
//       "wednesday",
//       "thursday",
//       "friday",
//       "saturday",
//     ];
//     const dayKey = days[dayOfWeek] as keyof typeof businessConfig.businessHours;
//     const dayHours = businessConfig.businessHours[dayKey];

//     // Se o negócio está fechado nesse dia, retornar array vazio
//     if (!dayHours.start || !dayHours.end) {
//       logger.info("Business is closed on this day", {
//         businessId,
//         date: appointmentDate.toISOString(),
//         day: getDayOfWeekInPortuguese(appointmentDate),
//       });
//       return [];
//     }

//     // Obter o serviço para saber a duração
//     const { data: service, error: serviceError } = await supabaseClient
//       .from("services")
//       .select("*")
//       .eq("service_id", serviceId)
//       .eq("business_id", businessId)
//       .single();

//     if (serviceError || !service) {
//       logger.error("Service not found", {
//         error: serviceError?.message,
//         businessId,
//         serviceId,
//       });
//       throw new Error("Service not found");
//     }

//     // Calcular slots disponíveis
//     return await generateAvailableTimeSlots(
//       businessId,
//       service,
//       appointmentDate,
//       dayHours.start,
//       dayHours.end,
//     );
//   } catch (error) {
//     logger.error("Error checking availability", {
//       error: error instanceof Error ? error.message : String(error),
//       businessId,
//       serviceId,
//       date: appointmentDate.toISOString(),
//     });
//     return [];
//   }
// }

/**
 * Gera os slots de tempo disponíveis para um serviço em uma data
 */
// async function generateAvailableTimeSlots(
//   businessId: string,
//   service: Service,
//   date: Date,
//   startTime: string,
//   endTime: string,
//   intervalMinutes: number = 30,
// ): Promise<TimeSlot[]> {
//   try {
//     // Inicializar a data com o horário de início
//     const [startHour, startMinute] = startTime.split(":").map(Number);
//     const [endHour, endMinute] = endTime.split(":").map(Number);

//     const startDateTime = new Date(date);
//     startDateTime.setHours(startHour, startMinute, 0, 0);

//     const endDateTime = new Date(date);
//     endDateTime.setHours(endHour, endMinute, 0, 0);

//     // Se a data já passou, não mostrar slots
//     const now = new Date();
//     if (isBefore(date, now) && !isSameDay(date, now)) {
//       logger.debug("Date is in the past", {
//         businessId,
//         date: date.toISOString(),
//         now: now.toISOString(),
//       });
//       return [];
//     }

//     // Se é hoje e o horário de início já passou, ajustar para próximo slot a partir de agora
//     if (isSameDay(date, now) && isBefore(startDateTime, now)) {
//       // Encontrar o próximo slot após o horário atual
//       const currentHour = now.getHours();
//       const currentMinute = now.getMinutes();

//       // Arredondar para o próximo slot
//       let nextSlotMinute =
//         Math.ceil(currentMinute / intervalMinutes) * intervalMinutes;
//       let nextSlotHour = currentHour;

//       if (nextSlotMinute >= 60) {
//         nextSlotHour += 1;
//         nextSlotMinute = 0;
//       }

//       startDateTime.setHours(nextSlotHour, nextSlotMinute, 0, 0);

//       // Se o próximo slot é depois do horário de fechamento, não há slots disponíveis
//       if (isAfter(startDateTime, endDateTime)) {
//         logger.debug("No slots available today after current time", {
//           businessId,
//           date: date.toISOString(),
//           now: now.toISOString(),
//         });
//         return [];
//       }
//     }

//     // Buscar agendamentos existentes para o dia
//     const dateStr = format(date, "yyyy-MM-dd");
//     const nextDay = addHours(date, 24);
//     const nextDayStr = format(nextDay, "yyyy-MM-dd");

//     const { data: existingAppointments, error } = await supabaseClient
//       .from("appointments")
//       .select("start_time, end_time")
//       .eq("business_id", businessId)
//       .gte("start_time", `${dateStr}T00:00:00`)
//       .lt("start_time", `${nextDayStr}T00:00:00`)
//       .in("status", ["confirmed", "scheduled"])
//       .order("start_time", { ascending: true });

//     if (error) {
//       logger.error("Error fetching existing appointments", {
//         error: error.message,
//         businessId,
//         date: dateStr,
//       });
//       throw new Error("Error fetching existing appointments");
//     }

//     // Buscar bloqueios de agenda para o dia
//     const { data: scheduleBlocks, error: blocksError } = await supabaseClient
//       .from("schedule_blocks")
//       .select("start_time, end_time")
//       .eq("business_id", businessId)
//       .lte("start_time", `${nextDayStr}T00:00:00`)
//       .gte("end_time", `${dateStr}T00:00:00`);

//     if (blocksError) {
//       logger.error("Error fetching schedule blocks", {
//         error: blocksError.message,
//         businessId,
//         date: dateStr,
//       });
//       throw new Error("Error fetching schedule blocks");
//     }

//     // Converter horários ocupados para objetos Date
//     const busySlots = [
//       ...existingAppointments.map((apt) => ({
//         start: new Date(apt.start_time),
//         end: new Date(apt.end_time),
//       })),
//       ...(scheduleBlocks || []).map((block) => ({
//         start: new Date(block.start_time),
//         end: new Date(block.end_time),
//       })),
//     ];

//     logger.debug("Existing appointments and blocks", {
//       businessId,
//       appointmentsCount: existingAppointments.length,
//       blocksCount: scheduleBlocks?.length || 0,
//     });

//     // Gerar slots de tempo
//     const timeSlots: TimeSlot[] = [];
//     const serviceDuration = service.duration;
//     let currentSlot = new Date(startDateTime);

//     while (isBefore(currentSlot, endDateTime)) {
//       // Verificar se o tempo do serviço cabe antes do horário de fechamento
//       const serviceEndTime = addMinutes(currentSlot, serviceDuration);

//       if (isAfter(serviceEndTime, endDateTime)) {
//         break;
//       }

//       // Verificar se o slot está disponível
//       const isAvailable = !busySlots.some(
//         (busy) =>
//           isBefore(currentSlot, busy.end) &&
//           isAfter(serviceEndTime, busy.start),
//       );

//       // Formatar o horário e adicionar ao array
//       const timeStr = format(currentSlot, "HH:mm");
//       timeSlots.push({
//         time: timeStr,
//         available: isAvailable,
//       });

//       // Avançar para o próximo slot
//       currentSlot = addMinutes(currentSlot, intervalMinutes);
//     }

//     logger.debug("Generated time slots", {
//       businessId,
//       date: dateStr,
//       slotsCount: timeSlots.length,
//       availableSlotsCount: timeSlots.filter((slot) => slot.available).length,
//     });

//     return timeSlots;
//   } catch (error) {
//     logger.error("Error generating available time slots", {
//       error: error instanceof Error ? error.message : String(error),
//       businessId,
//       serviceId: service.service_id,
//       date: date.toISOString(),
//     });
//     return [];
//   }
// }

/**
 * Agenda um compromisso
 * Modificado para usar a tabela customer e transação RPC
 */
// export async function bookAppointment(
//   businessId: string,
//   customerPhone: string,
//   serviceId: string,
//   dateStr: string,
//   timeStr: string,
// ): Promise<boolean> {
//   try {
//     logger.info("Booking appointment", {
//       businessId,
//       customerPhone,
//       serviceId,
//       date: dateStr,
//       time: timeStr,
//     });

//     // Verificar se o serviço existe e está ativo
//     const { data: service, error: serviceError } = await supabaseClient
//       .from("services")
//       .select("*")
//       .eq("service_id", serviceId)
//       .eq("business_id", businessId)
//       .eq("active", true)
//       .single();

//     if (serviceError || !service) {
//       logger.error("Service not found or inactive", {
//         error: serviceError?.message,
//         businessId,
//         serviceId,
//       });
//       return false;
//     }

//     // Obter ou criar o cliente para obter o customer_id
//     const customerId = await getOrCreateCustomer(businessId, customerPhone);

//     if (!customerId) {
//       logger.error("Failed to get or create customer", {
//         businessId,
//         customerPhone,
//       });
//       return false;
//     }

//     // Combinar data e hora em um objeto Date
//     const dateTimeStr = `${dateStr}T${timeStr}:00`;
//     const startTime = new Date(dateTimeStr);

//     // Verificar se a data é válida
//     if (isNaN(startTime.getTime())) {
//       logger.error("Invalid date/time", {
//         businessId,
//         customerPhone,
//         dateTimeStr,
//       });
//       return false;
//     }

//     // Verificar se a data está no futuro
//     const now = new Date();
//     if (isBefore(startTime, now)) {
//       logger.error("Appointment time is in the past", {
//         businessId,
//         customerPhone,
//         startTime: startTime.toISOString(),
//         now: now.toISOString(),
//       });
//       return false;
//     }

//     // Usar a função RPC do Supabase para agendar com verificação de disponibilidade
//     const { data, error } = await supabaseClient.rpc(
//       "create_appointment_transaction",
//       {
//         p_business_id: businessId,
//         p_customer_id: customerId,
//         p_service_id: serviceId,
//         p_start_time: startTime.toISOString(),
//       },
//     );

//     if (error) {
//       // Verificar mensagem de erro para fornecer feedback adequado
//       if (
//         error.message.includes("Horário não disponível") ||
//         error.message.includes("Horário bloqueado")
//       ) {
//         logger.warn("Appointment slot unavailable", {
//           error: error.message,
//           businessId,
//           customerPhone,
//           startTime: startTime.toISOString(),
//         });
//       } else {
//         logger.error("Error booking appointment", {
//           error: error.message,
//           businessId,
//           customerPhone,
//         });
//       }
//       return false;
//     }

//     logger.info("Appointment created successfully", {
//       businessId,
//       customerPhone,
//       appointmentId: data,
//       startTime: startTime.toISOString(),
//     });

//     return true;
//   } catch (error) {
//     logger.error("Error in appointment booking", {
//       error: error instanceof Error ? error.message : String(error),
//       businessId,
//       customerPhone,
//       serviceId,
//       date: dateStr,
//       time: timeStr,
//     });
//     return false;
//   }
// }

/**
 * Obtém compromissos futuros para um cliente específico
 */
export async function getUpcomingAppointments(
  businessId: string,
  customerPhone: string,
): Promise<Appointment[]> {
  try {
    logger.info("Getting upcoming appointments", { businessId, customerPhone });

    // Primeiro, obter o ID do cliente pelo telefone
    const { data: customer, error: customerError } = await supabaseClient
      .from("customers")
      .select("customer_id")
      .eq("business_id", businessId)
      .eq("phone", customerPhone)
      .single();

    if (customerError || !customer) {
      logger.debug("Customer not found", {
        error: customerError?.message,
        businessId,
        customerPhone,
      });
      return [];
    }

    // Buscar agendamentos futuros para o cliente
    const { data, error } = await supabaseClient
      .from("appointments")
      .select(`
        appointment_id,
        business_id,
        customer_id,
        service_id,
        start_time,
        end_time,
        status,
        services:service_id (name)
      `)
      .eq("business_id", businessId)
      .eq("customer_id", customer.customer_id)
      .gte("start_time", new Date().toISOString())
      .in("status", ["confirmed", "scheduled"])
      .order("start_time", { ascending: true });

    if (error) {
      logger.error("Error fetching upcoming appointments", {
        error: error.message,
        businessId,
        customerPhone,
        customerId: customer.customer_id,
      });
      return [];
    }

    // Transformar os dados para o formato esperado
    const appointments = data.map((apt) => ({
      ...apt,
      service: apt.services?.[0]?.name || "Serviço desconhecido",
      customer_phone: customerPhone,
    }));

    logger.debug("Found upcoming appointments", {
      businessId,
      customerPhone,
      count: appointments.length,
    });

    return appointments;
  } catch (error) {
    logger.error("Error in getUpcomingAppointments", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerPhone,
    });
    return [];
  }
}

/**
 * Cancela um compromisso
 */
export async function cancelAppointment(
  appointmentId: string,
): Promise<boolean> {
  try {
    logger.info("Cancelling appointment", { appointmentId });

    // Verificar se o agendamento existe e está confirmado
    const { data: appointment, error: fetchError } = await supabaseClient
      .from("appointments")
      .select("*")
      .eq("appointment_id", appointmentId)
      .in("status", ["confirmed", "scheduled"])
      .single();

    if (fetchError || !appointment) {
      logger.error("Appointment not found or not cancellable", {
        error: fetchError?.message,
        appointmentId,
      });
      return false;
    }

    // Verificar se o agendamento é no futuro
    const appointmentTime = new Date(appointment.start_time);
    const now = new Date();

    if (isBefore(appointmentTime, now)) {
      logger.error("Cannot cancel past appointment", {
        appointmentId,
        appointmentTime: appointmentTime.toISOString(),
        now: now.toISOString(),
      });
      return false;
    }

    // Cancelar o agendamento
    const { error: updateError } = await supabaseClient
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("appointment_id", appointmentId);

    if (updateError) {
      logger.error("Error cancelling appointment", {
        error: updateError.message,
        appointmentId,
      });
      return false;
    }

    logger.info("Appointment cancelled successfully", {
      appointmentId,
      businessId: appointment.business_id,
    });

    return true;
  } catch (error) {
    logger.error("Error in cancelAppointment", {
      error: error instanceof Error ? error.message : String(error),
      appointmentId,
    });
    return false;
  }
}

/**
 * Verifica se um serviço específico está disponível para agendamento
 */
export async function isServiceAvailable(
  businessId: string,
  serviceId: string,
): Promise<boolean> {
  try {
    const { data, error } = await supabaseClient
      .from("services")
      .select("active")
      .eq("business_id", businessId)
      .eq("service_id", serviceId)
      .single();

    if (error || !data) {
      logger.error("Error checking service availability", {
        error: error?.message,
        businessId,
        serviceId,
      });
      return false;
    }

    return data.active;
  } catch (error) {
    logger.error("Error in isServiceAvailable", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      serviceId,
    });
    return false;
  }
}

export default {
  checkAvailability,
  bookAppointment,
  getUpcomingAppointments,
  cancelAppointment,
  isServiceAvailable,
};

// Correções para scheduling.ts

/**
 * Verifica a disponibilidade de horários para um serviço em uma data específica
 * - Adicionado tratamento de erros mais robusto
 * - Adicionada validação de parâmetros
 */
export async function checkAvailability(
  businessId: string,
  serviceId: string,
  appointmentDate: Date,
): Promise<TimeSlot[]> {
  try {
    // Validação de parâmetros
    if (!businessId || !serviceId || !appointmentDate) {
      logger.error("Invalid parameters for checkAvailability", {
        businessId,
        serviceId,
        date: appointmentDate?.toISOString() || "undefined",
      });
      return [];
    }

    // Verificar se a data é válida (não é NaN)
    if (isNaN(appointmentDate.getTime())) {
      logger.error("Invalid date for checkAvailability", {
        businessId,
        serviceId,
        date: String(appointmentDate),
      });
      return [];
    }

    logger.info("Checking availability", {
      businessId,
      serviceId,
      date: appointmentDate.toISOString(),
    });

    // Obter configuração do negócio
    const businessConfig = await getBusinessConfig(businessId);
    if (!businessConfig) {
      logger.error("Business configuration not found", { businessId });
      return [];
    }

    // Verificar se o negócio está aberto na data especificada
    const dayOfWeek = appointmentDate.getDay();
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const dayKey = days[dayOfWeek] as keyof typeof businessConfig.businessHours;
    const dayHours = businessConfig.businessHours[dayKey];

    // Se o negócio está fechado nesse dia, retornar array vazio
    if (!dayHours.start || !dayHours.end) {
      logger.info("Business is closed on this day", {
        businessId,
        date: appointmentDate.toISOString(),
        day: getDayOfWeekInPortuguese(appointmentDate),
      });
      return [];
    }

    // Obter o serviço para saber a duração
    const { data: service, error: serviceError } = await supabaseClient
      .from("services")
      .select("*")
      .eq("service_id", serviceId)
      .eq("business_id", businessId)
      .single();

    if (serviceError || !service) {
      logger.error("Service not found", {
        error: serviceError?.message || "No data returned",
        code: serviceError?.code,
        businessId,
        serviceId,
      });
      return [];
    }

    // Calcular slots disponíveis
    return await generateAvailableTimeSlots(
      businessId,
      service,
      appointmentDate,
      dayHours.start,
      dayHours.end,
    );
  } catch (error) {
    logger.error("Error checking availability", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      businessId,
      serviceId,
      date: appointmentDate?.toISOString() || "unknown",
    });
    return [];
  }
}

/**
 * Agenda um compromisso
 * - Melhor validação de parâmetros
 * - Tratamento de erros mais explícito
 * - Log mais detalhado para depuração
 */
export async function bookAppointment(
  businessId: string,
  customerPhone: string,
  serviceId: string,
  dateStr: string,
  timeStr: string,
): Promise<boolean> {
  try {
    // Validação de parâmetros
    if (!businessId || !customerPhone || !serviceId || !dateStr || !timeStr) {
      logger.error("Missing required parameters for booking", {
        businessId,
        customerPhone,
        serviceId,
        date: dateStr,
        time: timeStr,
      });
      return false;
    }

    logger.info("Booking appointment", {
      businessId,
      customerPhone,
      serviceId,
      date: dateStr,
      time: timeStr,
    });

    // Verificar se o serviço existe e está ativo
    const { data: service, error: serviceError } = await supabaseClient
      .from("services")
      .select("*")
      .eq("service_id", serviceId)
      .eq("business_id", businessId)
      .eq("active", true)
      .single();

    if (serviceError) {
      logger.error("Error fetching service", {
        error: serviceError.message,
        code: serviceError.code,
        details: serviceError.details,
        hint: serviceError.hint,
        businessId,
        serviceId,
      });
      return false;
    }

    if (!service) {
      logger.error("Service not found or inactive", {
        businessId,
        serviceId,
      });
      return false;
    }

    // Obter ou criar o cliente para obter o customer_id
    const customerId = await getOrCreateCustomer(businessId, customerPhone);

    if (!customerId) {
      logger.error("Failed to get or create customer", {
        businessId,
        customerPhone,
      });
      return false;
    }

    // Combinar data e hora em um objeto Date
    // Garantir formato correto: YYYY-MM-DD + HH:MM:00
    let dateTimeStr: string;

    // Verificar se dateStr já está no formato ISO (YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dateTimeStr = `${dateStr}T${timeStr}:00`;
    } else {
      // Tentar converter de DD/MM/YYYY para YYYY-MM-DD
      const parts = dateStr.split(/[\/\-\.]/);
      if (parts.length >= 3) {
        // Assumir DD/MM/YYYY
        const day = parts[0].padStart(2, "0");
        const month = parts[1].padStart(2, "0");
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        dateTimeStr = `${year}-${month}-${day}T${timeStr}:00`;
      } else {
        logger.error("Invalid date format", {
          businessId,
          customerPhone,
          dateStr,
        });
        return false;
      }
    }

    // Garantir que timeStr está no formato HH:MM
    if (!/^\d{1,2}:\d{2}$/.test(timeStr)) {
      logger.error("Invalid time format", {
        businessId,
        customerPhone,
        timeStr,
      });
      return false;
    }

    const startTime = new Date(dateTimeStr);

    // Verificar se a data é válida
    if (isNaN(startTime.getTime())) {
      logger.error("Invalid date/time", {
        businessId,
        customerPhone,
        dateTimeStr,
        dateStr,
        timeStr,
      });
      return false;
    }

    // Verificar se a data está no futuro
    const now = new Date();
    if (startTime <= now) {
      logger.error("Appointment time is in the past or present", {
        businessId,
        customerPhone,
        startTime: startTime.toISOString(),
        now: now.toISOString(),
      });
      return false;
    }

    // Usar a função RPC do Supabase para agendar com verificação de disponibilidade
    logger.debug("Calling create_appointment_transaction RPC", {
      businessId,
      customerId,
      serviceId,
      startTime: startTime.toISOString(),
    });

    const { data, error } = await supabaseClient.rpc(
      "create_appointment_transaction",
      {
        p_business_id: businessId,
        p_customer_id: customerId,
        p_service_id: serviceId,
        p_start_time: startTime.toISOString(),
      },
    );

    if (error) {
      // Verificar mensagem de erro para fornecer feedback adequado
      if (
        error.message.includes("Horário não disponível") ||
        error.message.includes("Horário bloqueado")
      ) {
        logger.warn("Appointment slot unavailable", {
          error: error.message,
          code: error.code,
          businessId,
          customerPhone,
          startTime: startTime.toISOString(),
        });
      } else {
        logger.error("Error booking appointment", {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          businessId,
          customerPhone,
        });
      }
      return false;
    }

    logger.info("Appointment created successfully", {
      businessId,
      customerPhone,
      appointmentId: data,
      startTime: startTime.toISOString(),
    });

    return true;
  } catch (error) {
    logger.error("Unexpected error in appointment booking", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      businessId,
      customerPhone,
      serviceId,
      date: dateStr,
      time: timeStr,
    });
    return false;
  }
}

/**
 * Gera os slots de tempo disponíveis para um serviço em uma data
 * - Melhorias na lógica de erro
 * - Melhor formatação de datas
 * - Validação adicional
 */
async function generateAvailableTimeSlots(
  businessId: string,
  service: Service,
  date: Date,
  startTime: string,
  endTime: string,
  intervalMinutes: number = 30,
): Promise<TimeSlot[]> {
  try {
    // Validar parâmetros
    if (!service || !date || !startTime || !endTime) {
      logger.error("Missing parameters for generateAvailableTimeSlots", {
        businessId,
        serviceId: service?.service_id,
        date: date?.toISOString(),
        startTime,
        endTime,
      });
      return [];
    }

    // Inicializar a data com o horário de início
    const [startHour, startMinute] = startTime.split(":").map(Number);
    const [endHour, endMinute] = endTime.split(":").map(Number);

    if (
      isNaN(startHour) ||
      isNaN(startMinute) ||
      isNaN(endHour) ||
      isNaN(endMinute)
    ) {
      logger.error("Invalid time format in business hours", {
        businessId,
        startTime,
        endTime,
      });
      return [];
    }

    const startDateTime = new Date(date);
    startDateTime.setHours(startHour, startMinute, 0, 0);

    const endDateTime = new Date(date);
    endDateTime.setHours(endHour, endMinute, 0, 0);

    // Se a data já passou, não mostrar slots
    const now = new Date();
    if (isBefore(date, now) && !isSameDay(date, now)) {
      logger.debug("Date is in the past", {
        businessId,
        date: date.toISOString(),
        now: now.toISOString(),
      });
      return [];
    }

    // Se é hoje e o horário de início já passou, ajustar para próximo slot a partir de agora
    if (isSameDay(date, now) && isBefore(startDateTime, now)) {
      // Encontrar o próximo slot após o horário atual
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();

      // Arredondar para o próximo slot
      let nextSlotMinute =
        Math.ceil(currentMinute / intervalMinutes) * intervalMinutes;
      let nextSlotHour = currentHour;

      if (nextSlotMinute >= 60) {
        nextSlotHour += 1;
        nextSlotMinute = 0;
      }

      startDateTime.setHours(nextSlotHour, nextSlotMinute, 0, 0);

      logger.debug("Adjusted start time for today", {
        businessId,
        originalStart: `${startHour}:${startMinute}`,
        adjustedStart: `${nextSlotHour}:${nextSlotMinute}`,
      });

      // Se o próximo slot é depois do horário de fechamento, não há slots disponíveis
      if (isAfter(startDateTime, endDateTime)) {
        logger.debug("No slots available today after current time", {
          businessId,
          date: date.toISOString(),
          now: now.toISOString(),
        });
        return [];
      }
    }

    // Buscar agendamentos existentes para o dia
    const dateStr = format(date, "yyyy-MM-dd");
    const nextDay = addHours(date, 24);
    const nextDayStr = format(nextDay, "yyyy-MM-dd");

    logger.debug("Fetching existing appointments", {
      businessId,
      dateRange: `${dateStr} to ${nextDayStr}`,
    });

    // Buscar em uma única consulta com tratamento de erro
    try {
      // Buscar agendamentos existentes
      const { data: existingAppointments, error: appointmentsError } =
        await supabaseClient
          .from("appointments")
          .select("start_time, end_time")
          .eq("business_id", businessId)
          .gte("start_time", `${dateStr}T00:00:00`)
          .lt("start_time", `${nextDayStr}T00:00:00`)
          .in("status", ["confirmed", "scheduled"])
          .order("start_time", { ascending: true });

      if (appointmentsError) {
        logger.error("Error fetching existing appointments", {
          error: appointmentsError.message,
          code: appointmentsError.code,
          businessId,
          date: dateStr,
        });
        throw new Error(
          `Error fetching appointments: ${appointmentsError.message}`,
        );
      }

      // Buscar bloqueios de agenda
      const { data: scheduleBlocks, error: blocksError } = await supabaseClient
        .from("schedule_blocks")
        .select("start_time, end_time")
        .eq("business_id", businessId)
        .lte("start_time", `${nextDayStr}T00:00:00`)
        .gte("end_time", `${dateStr}T00:00:00`);

      if (blocksError) {
        logger.error("Error fetching schedule blocks", {
          error: blocksError.message,
          code: blocksError.code,
          businessId,
          date: dateStr,
        });
        throw new Error(
          `Error fetching schedule blocks: ${blocksError.message}`,
        );
      }

      // Converter horários ocupados para objetos Date
      const busySlots = [
        ...(existingAppointments || []).map((apt) => ({
          start: new Date(apt.start_time),
          end: new Date(apt.end_time),
        })),
        ...(scheduleBlocks || []).map((block) => ({
          start: new Date(block.start_time),
          end: new Date(block.end_time),
        })),
      ];

      logger.debug("Busy time slots found", {
        businessId,
        appointmentsCount: existingAppointments?.length || 0,
        blocksCount: scheduleBlocks?.length || 0,
      });

      // Gerar slots de tempo
      const timeSlots: TimeSlot[] = [];
      const serviceDuration = service.duration;
      let currentSlot = new Date(startDateTime);

      while (isBefore(currentSlot, endDateTime)) {
        // Verificar se o tempo do serviço cabe antes do horário de fechamento
        const serviceEndTime = addMinutes(currentSlot, serviceDuration);

        if (isAfter(serviceEndTime, endDateTime)) {
          break;
        }

        // Verificar se o slot está disponível
        const isAvailable = !busySlots.some(
          (busy) =>
            (isBefore(currentSlot, busy.end) &&
              isAfter(serviceEndTime, busy.start)) ||
            isSameMinute(currentSlot, busy.start) ||
            isSameMinute(serviceEndTime, busy.end),
        );

        // Formatar o horário e adicionar ao array
        const timeStr = format(currentSlot, "HH:mm");
        timeSlots.push({
          time: timeStr,
          available: isAvailable,
        });

        // Avançar para o próximo slot
        currentSlot = addMinutes(currentSlot, intervalMinutes);
      }

      logger.debug("Generated time slots", {
        businessId,
        date: dateStr,
        slotsCount: timeSlots.length,
        availableSlotsCount: timeSlots.filter((slot) => slot.available).length,
      });

      return timeSlots;
    } catch (queryError) {
      logger.error("Error in time slot generation query", {
        error:
          queryError instanceof Error ? queryError.message : String(queryError),
        businessId,
        date: dateStr,
      });
      return [];
    }
  } catch (error) {
    logger.error("Unexpected error generating available time slots", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      businessId,
      serviceId: service.service_id,
      date: date.toISOString(),
    });
    return [];
  }
}

/**
 * Função auxiliar para verificar se dois horários têm o mesmo minuto
 * Útil para evitar sobreposição exata de horários
 */
function isSameMinute(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate() &&
    date1.getHours() === date2.getHours() &&
    date1.getMinutes() === date2.getMinutes()
  );
}
