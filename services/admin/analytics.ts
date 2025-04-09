// services/admin/analytics.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { format, addDays, subDays, startOfMonth, endOfMonth } from "date-fns";

/**
 * Obtém estatísticas básicas de desempenho
 * @param businessId ID do negócio
 * @param period Período desejado (ex: today, last_7_days, current_month, YYYY-MM)
 */
export async function admin_getStatistics(
  businessId: string,
  period: string = "current_month",
): Promise<{
  appointments: {
    total: number;
    scheduled: number;
    confirmed: number;
    cancelled: number;
    completed: number;
    noShow: number;
  };
  topServices: { name: string; count: number }[];
  customers: { total: number; new: number };
  periodDescription: string;
}> {
  try {
    logger.info("[Admin] Getting statistics", {
      businessId,
      period,
    });

    // Determinar datas de início e fim com base no período
    let startDate: Date;
    let endDate: Date;
    let periodDescription: string;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Determinar o período
    switch (period) {
      case "today":
        startDate = new Date(today);
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        periodDescription = "Hoje";
        break;

      case "yesterday":
        startDate = subDays(today, 1);
        endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);
        periodDescription = "Ontem";
        break;

      case "last_7_days":
        startDate = subDays(today, 6); // últimos 7 dias incluindo hoje
        endDate = new Date(today);
        endDate.setHours(23, 59, 59, 999);
        periodDescription = "Últimos 7 dias";
        break;

      case "current_month":
        startDate = startOfMonth(today);
        endDate = endOfMonth(today);
        periodDescription = `Mês atual (${format(today, "MMMM/yyyy")})`;
        break;

      default:
        // Verificar se é um mês específico (YYYY-MM)
        if (/^\d{4}-\d{2}$/.test(period)) {
          const [year, month] = period.split("-").map(Number);
          startDate = new Date(year, month - 1, 1);
          endDate = endOfMonth(startDate);
          periodDescription = `${format(startDate, "MMMM/yyyy")}`;
        } else {
          // Default para mês atual
          startDate = startOfMonth(today);
          endDate = endOfMonth(today);
          periodDescription = `Mês atual (${format(today, "MMMM/yyyy")})`;
        }
    }

    // Formatar datas para query
    const startIso = startDate.toISOString();
    const endIso = endDate.toISOString();

    // 1. Buscar estatísticas de agendamentos
    const { data: appointmentsStatsData, error: appointmentsError } =
      await supabaseClient.rpc("get_appointments_statistics", {
        p_business_id: businessId,
        p_start_date: startIso,
        p_end_date: endIso,
      });

    let appointmentsStats = appointmentsStatsData;

    if (appointmentsError) {
      logger.error("Error fetching appointments statistics", {
        error: appointmentsError.message,
        businessId,
      });
      throw new Error(
        `Failed to fetch appointments statistics: ${appointmentsError.message}`,
      );
    }

    // 2. Buscar top serviços para o período
    const { data: topServices, error: servicesError } =
      await supabaseClient.rpc("get_top_services", {
        p_business_id: businessId,
        p_start_date: startIso,
        p_end_date: endIso,
        p_limit: 5,
      });

    if (servicesError) {
      logger.error("Error fetching top services", {
        error: servicesError.message,
        businessId,
      });
      // Continuar mesmo com erro parcial
    }

    // 3. Buscar estatísticas de clientes
    const { data: customersStats, error: customersError } =
      await supabaseClient.rpc("get_customers_statistics", {
        p_business_id: businessId,
        p_start_date: startIso,
        p_end_date: endIso,
      });

    if (customersError) {
      logger.error("Error fetching customers statistics", {
        error: customersError.message,
        businessId,
      });
      // Continuar mesmo com erro parcial
    }

    // Se as RPCs não estão disponíveis, fazer queries diretas
    // Isso é um fallback caso as funções RPC não existam no banco
    if (!appointmentsStats) {
      // Fazer query direta para agendamentos
      const { data: appointments, error } = await supabaseClient
        .from("appointments")
        .select("status")
        .eq("business_id", businessId)
        .gte("created_at", startIso)
        .lte("created_at", endIso);

      if (!error && appointments) {
        // Calcular estatísticas manualmente
        const stats = {
          total: appointments.length,
          scheduled: appointments.filter((a) => a.status === "scheduled")
            .length,
          confirmed: appointments.filter((a) => a.status === "confirmed")
            .length,
          cancelled: appointments.filter((a) => a.status === "cancelled")
            .length,
          completed: appointments.filter((a) => a.status === "completed")
            .length,
          noShow: appointments.filter((a) => a.status === "no_show").length,
        };

        appointmentsStats = stats;
      }
    }

    // Preparar resultado final
    const result = {
      appointments: appointmentsStats || {
        total: 0,
        scheduled: 0,
        confirmed: 0,
        cancelled: 0,
        completed: 0,
        noShow: 0,
      },
      topServices: topServices || [],
      customers: customersStats || { total: 0, new: 0 },
      periodDescription,
    };

    logger.debug("Statistics retrieved", {
      businessId,
      period,
      appointmentsTotal: result.appointments.total,
    });

    return result;
  } catch (error) {
    logger.error("Unexpected error in admin_getStatistics", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      period,
    });

    // Retornar estatísticas vazias em caso de erro
    return {
      appointments: {
        total: 0,
        scheduled: 0,
        confirmed: 0,
        cancelled: 0,
        completed: 0,
        noShow: 0,
      },
      topServices: [],
      customers: { total: 0, new: 0 },
      periodDescription: period,
    };
  }
}

/**
 * Lista os agendamentos com filtros
 * @param businessId ID do negócio
 * @param date Data específica para filtrar (opcional, formato: YYYY-MM-DD)
 * @param status Status dos agendamentos (opcional, ex: scheduled, confirmed)
 * @param orderBy Critério de ordenação (opcional)
 * @param limit Limite de resultados (opcional)
 */
export async function admin_listAppointments(
  businessId: string,
  date?: string,
  status: string = "scheduled,confirmed",
  orderBy: string = "startTimeAsc",
  limit: number = 20,
): Promise<any[]> {
  try {
    logger.info("[Admin] Listing appointments", {
      businessId,
      date,
      status,
      orderBy,
      limit,
    });

    // Construir query base
    let query = supabaseClient
      .from("appointments")
      .select(`
        appointment_id,
        start_time,
        end_time,
        status,
        notes,
        services:service_id (name, price, duration),
        customers:customer_id (name, phone)
      `)
      .eq("business_id", businessId)
      .limit(limit);

    // Aplicar filtro de data se fornecido
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      query = query
        .gte("start_time", `${date}T00:00:00`)
        .lt("start_time", `${date}T23:59:59`);
    }

    // Aplicar filtro de status
    if (status && status !== "all") {
      // Permitir múltiplos status separados por vírgula
      const statusList = status.split(",").map((s) => s.trim());
      query = query.in("status", statusList);
    }

    // Aplicar ordenação
    switch (orderBy) {
      case "startTimeDesc":
        query = query.order("start_time", { ascending: false });
        break;
      case "createdAtDesc":
        query = query.order("created_at", { ascending: false });
        break;
      case "startTimeAsc":
      default:
        query = query.order("start_time", { ascending: true });
    }

    // Executar a query
    const { data, error } = await query;

    if (error) {
      logger.error("Error fetching appointments", {
        error: error.message,
        businessId,
      });
      throw new Error(`Failed to fetch appointments: ${error.message}`);
    }

    // Formatar resultados para melhor legibilidade
    const formattedAppointments = data.map((apt) => ({
      id: apt.appointment_id,
      startTime: apt.start_time,
      endTime: apt.end_time,
      status: apt.status,
      service: apt.services?.[0]?.name || "Serviço desconhecido",
      price: apt.services?.[0]?.price || 0,
      duration: apt.services?.[0]?.duration || 0,
      customerName: apt.customers?.[0]?.name || "Cliente desconhecido",
      customerPhone: apt.customers?.[0]?.phone || "",
      notes: apt.notes || "",
    }));

    logger.debug("Appointments retrieved", {
      businessId,
      count: formattedAppointments.length,
    });

    return formattedAppointments;
  } catch (error) {
    logger.error("Unexpected error in admin_listAppointments", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      date,
      status,
    });
    throw error;
  }
}
