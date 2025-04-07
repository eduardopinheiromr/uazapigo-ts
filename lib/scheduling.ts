// lib/scheduling.ts

import supabaseClient from "./supabaseClient";
import { TimeSlot, Appointment } from "@/types";
import { format, parse, addHours } from "date-fns";

/**
 * Verifica a disponibilidade de horários para um serviço em uma data específica
 *
 * Inicialmente implementado como um placeholder retornando horários fixos.
 * Em produção, este seria integrado com um sistema de calendário real.
 */
export async function checkAvailability(
  clientId: string,
  service: string,
  date: Date,
): Promise<TimeSlot[]> {
  // Na implementação inicial, retornamos horários fixos
  // Na produção, buscar horários reais do calendário/banco
  return [
    { time: "09:00", available: true },
    { time: "10:00", available: true },
    { time: "11:00", available: false },
    { time: "14:00", available: true },
    { time: "15:00", available: true },
    { time: "16:00", available: false },
    { time: "17:00", available: true },
  ];
}

/**
 * Agenda um compromisso
 *
 * @param clientId ID do cliente
 * @param customerPhone Telefone do cliente
 * @param service Serviço a ser agendado
 * @param date Data do agendamento no formato YYYY-MM-DD
 * @param time Horário no formato HH:MM
 */
export async function bookAppointment(
  clientId: string,
  customerPhone: string,
  service: string,
  date: string,
  time: string,
): Promise<boolean> {
  try {
    // Combinar data e hora em um objeto Date
    const dateTimeStr = `${date} ${time}`;
    const startTime = parse(dateTimeStr, "yyyy-MM-dd HH:mm", new Date());

    // Assumindo que cada compromisso dura 1 hora
    const endTime = addHours(startTime, 1);

    // Chamar a função RPC do Supabase para realizar a transação
    const { data, error } = await supabaseClient.rpc(
      "create_appointment_transaction",
      {
        p_client_id: clientId,
        p_customer_phone: customerPhone,
        p_service: service,
        p_start_time: startTime.toISOString(),
        p_end_time: endTime.toISOString(),
        p_status: "confirmed",
      },
    );

    if (error) {
      console.error("Error booking appointment:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in appointment booking:", error);
    return false;
  }
}

/**
 * Obtém compromissos futuros para um cliente específico
 */
export async function getUpcomingAppointments(
  clientId: string,
  customerPhone: string,
): Promise<Appointment[]> {
  try {
    const { data, error } = await supabaseClient
      .from("appointments")
      .select("*")
      .eq("client_id", clientId)
      .eq("customer_phone", customerPhone)
      .gte("start_time", new Date().toISOString())
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching appointments:", error);
      return [];
    }

    return data as Appointment[];
  } catch (error) {
    console.error("Error in appointments retrieval:", error);
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
    const { error } = await supabaseClient
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("appointment_id", appointmentId);

    if (error) {
      console.error("Error cancelling appointment:", error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error in appointment cancellation:", error);
    return false;
  }
}
