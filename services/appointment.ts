/* ----------------------------------------
 * appointment.ts
 * ----------------------------------------
 * Módulo responsável pelas operações de agendamento:
 * - criar, cancelar, reagendar, listar, consultar disponibilidade.
 * Inclui funções auxiliares para evitar duplicação.
 */

// Ajuste conforme a localização real do seu arquivo de tipos:
import supabaseClient from "@/lib/supabaseClient";
import { Appointment, Customer, Service, BusinessConfig } from "@/types";
import { DateTime } from "luxon"; // se quiser usar luxon para manipular data/hora
import { v4 as uuid } from "uuid";

// -- Helpers --

/**
 * Obtém (ou cria) um registro de cliente a partir do telefone.
 */
async function getOrCreateCustomer(
  businessId: string,
  phone: string,
): Promise<Customer> {
  // Exemplo de busca ou criação:
  const { data: existing, error: findError } = await supabaseClient
    .from("customers")
    .select("*")
    .eq("business_id", businessId)
    .eq("phone", phone)
    .single();

  if (findError && findError.code !== "PGRST116") {
    // Se ocorrer erro que não seja "Row not found"
    throw new Error("Falha ao buscar customer: " + findError.message);
  }

  if (existing) {
    return existing;
  }

  // Cria se não existir:
  const { data: created, error: createError } = await supabaseClient
    .from("customers")
    .insert({
      customer_id: uuid(),
      business_id: businessId,
      phone,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (createError) {
    throw new Error("Falha ao criar customer: " + createError.message);
  }

  return created!;
}

/**
 * Obtém o registro de serviço pelo nome (ou id), se existir.
 */
async function getServiceByName(
  businessId: string,
  serviceName: string,
): Promise<Service | null> {
  const { data, error } = await supabaseClient
    .from("services")
    .select("*")
    .eq("business_id", businessId)
    .ilike("name", serviceName) // ilike para case-insensitive
    .single();

  if (error && error.code !== "PGRST116") {
    throw new Error("Falha ao buscar serviço: " + error.message);
  }
  return data ?? null;
}

/**
 * Valida formato de data/hora e retorna objeto luxon (ou Date), se quiser.
 * Ajuste conforme conveniência. Aqui assumimos strings "yyyy-MM-dd" e "HH:mm".
 */
function parseDateTime(dateStr: string, timeStr: string) {
  // Por exemplo, usando luxon:
  const dateTime = DateTime.fromFormat(
    `${dateStr} ${timeStr}`,
    "yyyy-LL-dd HH:mm",
    { zone: "utc" },
  );
  if (!dateTime.isValid) {
    throw new Error(`Data/hora inválida: ${dateStr} ${timeStr}`);
  }
  return dateTime;
}

/**
 * Verifica se determinado horário está livre.
 */
async function isTimeSlotAvailable(
  businessId: string,
  serviceId: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from("appointments")
    .select("appointment_id")
    .eq("business_id", businessId)
    .eq("service_id", serviceId)
    .neq("status", "CANCELED")
    .or(`and(start_time.lt.${endTime},end_time.gt.${startTime})`);

  if (error) {
    throw new Error("Falha ao verificar disponibilidade: " + error.message);
  }

  return (data?.length ?? 0) === 0;
}

/**
 * Obtém config do negócio (horários, capacity, etc.).
 * Substitua e expanda conforme seu schema.
 */
async function getBusinessConfig(
  businessId: string,
): Promise<BusinessConfig | null> {
  const { data, error } = await supabaseClient
    .from("businesses")
    .select("config")
    .eq("business_id", businessId)
    .single();
  if (error && error.code !== "PGRST116") {
    throw new Error(`Falha ao buscar config do negócio: ${error.message}`);
  }
  return data?.config ?? null;
}

// -- Funções principais --

/**
 * Cria um agendamento (Appointment).
 */
export async function createAppointment(
  businessId: string,
  userPhone: string,
  serviceName: string,
  dateStr: string,
  timeStr: string,
) {
  try {
    const customer = await getOrCreateCustomer(businessId, userPhone);
    const service = await getServiceByName(businessId, serviceName);
    if (!service) {
      return {
        success: false,
        message: `Serviço '${serviceName}' não encontrado.`,
      };
    }

    // Validação de data/hora
    const dt = parseDateTime(dateStr, timeStr);
    // Aqui assumimos duração de 1 hora, mas use a do service.duration caso exista
    const durationMin = service.duration ?? 60;
    const endDt = dt.plus({ minutes: durationMin });

    // Checa disponibilidade
    const available = await isTimeSlotAvailable(
      businessId,
      service.service_id,
      dt.toISO(),
      endDt.toISO(),
    );
    if (!available) {
      return {
        success: false,
        message: "Desculpe, horário indisponível para este serviço.",
      };
    }

    // Cria o agendamento
    const newApt: Partial<Appointment> = {
      appointment_id: uuid(),
      business_id: businessId,
      customer_id: customer.customer_id,
      service_id: service.service_id,
      status: "confirmed",
      start_time: dt.toISO(),
      end_time: endDt.toISO(),
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseClient.from("appointments").insert(newApt);

    if (error) {
      return {
        success: false,
        message: "Falha ao criar agendamento. Tente novamente.",
      };
    }

    return {
      success: true,
      message: `Agendamento confirmado: ${service.name} em ${dateStr} às ${timeStr}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao criar agendamento: ${err.message}`,
    };
  }
}

/**
 * Lista os agendamentos do usuário.
 * Exemplo simples filtrando por phone => customer_id => appointments.
 */
export async function listMyAppointments(
  businessId: string,
  userPhone: string,
) {
  try {
    const customer = await getOrCreateCustomer(businessId, userPhone);

    const { data, error } = await supabaseClient
      .from("appointments")
      .select(`*, services ( name, price ), customers ( phone )`)
      .eq("business_id", businessId)
      .eq("customer_id", customer.customer_id)
      .neq("status", "CANCELED")
      .order("start_time", { ascending: false });

    if (error) {
      return { success: false, message: "Falha ao listar agendamentos." };
    }

    // Mapeia para um retorno mais limpo (adicionar fields extras como preferir)
    const list =
      data?.map((apt) => ({
        appointmentId: apt.appointment_id,
        serviceName: (apt.services as any)?.name || "",
        price: (apt.services as any)?.price || null,
        phone: (apt.customers as any)?.phone || "",
        status: apt.status,
        startTime: apt.start_time,
        endTime: apt.end_time,
      })) || [];

    return { success: true, appointments: list };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao listar agendamentos: ${err.message}`,
    };
  }
}

/**
 * Cancela um agendamento, se ainda não estiver cancelado.
 * Necessita data/hora para buscar ou ID do agendamento.
 */
export async function cancelAppointment(
  businessId: string,
  userPhone: string,
  dateStr: string,
  timeStr: string,
  serviceName: string,
) {
  try {
    const customer = await getOrCreateCustomer(businessId, userPhone);
    const service = await getServiceByName(businessId, serviceName);
    if (!service) {
      return {
        success: false,
        message: `Serviço '${serviceName}' não encontrado.`,
      };
    }

    // Valida data/hora
    const dt = parseDateTime(dateStr, timeStr);
    const { data, error } = await supabaseClient
      .from("appointments")
      .select("*")
      .eq("business_id", businessId)
      .eq("customer_id", customer.customer_id)
      .eq("service_id", service.service_id)
      .eq("status", "confirmed")
      .eq("start_time", dt.toISO())
      .single();

    if (error || !data) {
      return {
        success: false,
        message: "Nenhum agendamento confirmado encontrado para cancelar.",
      };
    }

    // Atualiza status para CANCELED
    const { error: updateError } = await supabaseClient
      .from("appointments")
      .update({ status: "CANCELED" })
      .eq("appointment_id", data.appointment_id);

    if (updateError) {
      return {
        success: false,
        message: "Falha ao cancelar agendamento. Tente novamente.",
      };
    }

    return { success: true, message: "Agendamento cancelado com sucesso." };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao cancelar agendamento: ${err.message}`,
    };
  }
}

/**
 * Reagenda um compromisso existente para nova data/hora.
 * Exemplifica uso de transação e rollback manual.
 */
export async function rescheduleAppointment(
  businessId: string,
  userPhone: string,
  oldDate: string,
  oldTime: string,
  serviceName: string,
  newDate: string,
  newTime: string,
) {
  // Obs: Supabase não tem transação multi-statement nativa. Se precisar,
  // usar RLS ou PGFunction. Aqui exemplificamos um approach "manual".
  const customer = await getOrCreateCustomer(businessId, userPhone);
  const service = await getServiceByName(businessId, serviceName);
  if (!service) {
    return {
      success: false,
      message: `Serviço '${serviceName}' não encontrado.`,
    };
  }

  try {
    // Localizar agendamento existente
    const oldDt = parseDateTime(oldDate, oldTime);
    const { data: oldApt, error: eFind } = await supabaseClient
      .from("appointments")
      .select("*")
      .eq("business_id", businessId)
      .eq("customer_id", customer.customer_id)
      .eq("service_id", service.service_id)
      .eq("status", "confirmed")
      .eq("start_time", oldDt.toISO())
      .single();

    if (eFind || !oldApt) {
      return {
        success: false,
        message: "Agendamento anterior não encontrado.",
      };
    }

    // Valida nova data/hora e disponibilidade
    const newDt = parseDateTime(newDate, newTime);
    const durationMin = service.duration ?? 60;
    const newEnd = newDt.plus({ minutes: durationMin });
    const available = await isTimeSlotAvailable(
      businessId,
      service.service_id,
      newDt.toISO(),
      newEnd.toISO(),
    );
    if (!available) {
      return {
        success: false,
        message: "Horário indisponível para reagendar este serviço.",
      };
    }

    // Cancelar antigo:
    const { error: eCancel } = await supabaseClient
      .from("appointments")
      .update({ status: "CANCELED" })
      .eq("appointment_id", oldApt.appointment_id);

    if (eCancel) {
      throw new Error(
        `Falha ao cancelar agendamento antigo: ${eCancel.message}`,
      );
    }

    // Criar o novo
    const { error: eInsert } = await supabaseClient
      .from("appointments")
      .insert({
        appointment_id: uuid(),
        business_id: businessId,
        customer_id: customer.customer_id,
        service_id: service.service_id,
        status: "confirmed",
        start_time: newDt.toISO(),
        end_time: newEnd.toISO(),
        created_at: new Date().toISOString(),
      });

    if (eInsert) {
      // Tentar reverter o cancelamento
      await supabaseClient
        .from("appointments")
        .update({ status: "confirmed" })
        .eq("appointment_id", oldApt.appointment_id);

      throw new Error(`Falha ao criar novo agendamento: ${eInsert.message}`);
    }

    return {
      success: true,
      message: `Agendamento reagendado para ${newDate} às ${newTime}.`,
    };
  } catch (err: any) {
    return { success: false, message: `Erro ao reagendar: ${err.message}` };
  }
}

/**
 * Retorna uma lista de datas disponíveis em um intervalo de dias,
 * ou filtra por serviceId se quiser.
 * Aqui é um exemplo básico; substitua pela lógica que sua agenda precisa.
 */
export async function checkAvailableDates(
  businessId: string,
  daysAhead: number,
  serviceName?: string,
) {
  try {
    const service = serviceName
      ? await getServiceByName(businessId, serviceName)
      : null;
    const config = await getBusinessConfig(businessId);

    const today = DateTime.now().startOf("day");
    const results: Array<{ date: string; hasAvailability: boolean }> = [];

    for (let i = 0; i < daysAhead; i++) {
      const day = today.plus({ days: i });

      const dayName = day.setLocale("en").toFormat("cccc").toLowerCase();

      const { start, end } = config.businessHours?.[dayName] || {
        start: "09:00",
        end: "18:00",
      };

      const [startHour, startMinute] = start.split(":").map(Number);
      const [endHour, endMinute] = end.split(":").map(Number);

      const durationMin = service?.duration ?? 60;

      let hasAnySlotFree = false;
      let dtStart = day.set({ hour: startHour, minute: startMinute });
      const dtEndLimit = day.set({ hour: endHour, minute: endMinute });

      while (dtStart.plus({ minutes: durationMin }) <= dtEndLimit) {
        const dtEnd = dtStart.plus({ minutes: durationMin });
        const slotAvailable = await isTimeSlotAvailable(
          businessId,
          service?.service_id ?? "any",
          dtStart.toISO(),
          dtEnd.toISO(),
        );
        if (slotAvailable) {
          hasAnySlotFree = true;
          break;
        }
        dtStart = dtStart.plus({ minutes: durationMin });
      }

      results.push({
        date: day.toFormat("yyyy-MM-dd"),
        hasAvailability: hasAnySlotFree,
      });
    }

    return { success: true, dates: results };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao checar datas disponíveis: ${err.message}`,
    };
  }
}

/**
 * Mostra horários disponíveis de um dia específico para determinado serviço (opcional).
 */
export async function checkAvailableTimes(
  businessId: string,
  dateStr: string,
  serviceName?: string,
) {
  try {
    const service = serviceName
      ? await getServiceByName(businessId, serviceName)
      : null;

    const config = await getBusinessConfig(businessId);

    const dayName = DateTime.fromFormat(dateStr, "yyyy-LL-dd")
      .setLocale("en")
      .toFormat("cccc")
      .toLowerCase();

    const { start, end } = config.businessHours?.[dayName] || {
      start: "09:00",
      end: "18:00",
    };

    const durationMin = service?.duration ?? 60;

    const dateObj = DateTime.fromFormat(dateStr, "yyyy-LL-dd", { zone: "utc" });
    if (!dateObj.isValid) {
      return { success: false, message: `Data inválida: ${dateStr}` };
    }

    const slots: string[] = [];

    let currentTime = DateTime.fromFormat(
      `${dateStr} ${start}`,
      "yyyy-LL-dd HH:mm",
      { zone: "utc" },
    );
    const endTime = DateTime.fromFormat(
      `${dateStr} ${end}`,
      "yyyy-LL-dd HH:mm",
      { zone: "utc" },
    );

    while (currentTime.plus({ minutes: durationMin }) <= endTime) {
      const slotEnd = currentTime.plus({ minutes: durationMin });
      const available = await isTimeSlotAvailable(
        businessId,
        service?.service_id ?? "any",
        currentTime.toISO(),
        slotEnd.toISO(),
      );
      if (available) {
        slots.push(currentTime.toFormat("HH:mm"));
      }

      currentTime = currentTime.plus({ minutes: durationMin });
    }

    return { success: true, times: slots };
  } catch (err: any) {
    return {
      success: false,
      message: `Erro ao checar horários: ${err.message}`,
    };
  }
}
