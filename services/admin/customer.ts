// services/admin/customer.ts
import supabaseClient from "@/lib/supabaseClient";
import logger from "@/lib/logger";
import { Customer } from "@/types";
import { formatPhoneNumber } from "@/lib/utils";

/**
 * Lista os clientes cadastrados
 * @param businessId ID do negócio
 * @param searchTerm Termo para busca por nome ou telefone (opcional)
 * @param limit Limite de resultados
 * @param orderBy Critério de ordenação
 */
export async function admin_listCustomers(
  businessId: string,
  searchTerm?: string,
  limit: number = 20,
  orderBy: string = "nameAsc",
): Promise<Customer[]> {
  try {
    logger.info("[Admin] Listing customers", {
      businessId,
      searchTerm,
      limit,
      orderBy,
    });

    // Construir query base
    let query = supabaseClient
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .limit(limit);

    // Aplicar filtro de busca se fornecido
    if (searchTerm && searchTerm.trim()) {
      const term = searchTerm.trim();
      query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
    }

    // Aplicar ordenação
    switch (orderBy) {
      case "nameDesc":
        query = query.order("name", { ascending: false, nullsFirst: false });
        break;
      case "lastInteractionDesc":
        query = query.order("last_interaction", {
          ascending: false,
          nullsFirst: false,
        });
        break;
      case "createdAtDesc":
        query = query.order("created_at", { ascending: false });
        break;
      case "nameAsc":
      default:
        query = query.order("name", { ascending: true, nullsFirst: false });
    }

    // Executar a query
    const { data, error } = await query;

    if (error) {
      logger.error("Error fetching customers", {
        error: error.message,
        businessId,
      });
      throw new Error(`Failed to fetch customers: ${error.message}`);
    }

    logger.debug("Customers retrieved", {
      businessId,
      count: data?.length || 0,
    });

    return data || [];
  } catch (error) {
    logger.error("Unexpected error in admin_listCustomers", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });
    throw error;
  }
}

/**
 * Visualiza os detalhes de um cliente específico
 * @param businessId ID do negócio
 * @param customerPhone Telefone do cliente
 */
export async function admin_viewCustomerDetails(
  businessId: string,
  customerPhone: string,
): Promise<{
  customer: Customer | null;
  appointments: any[];
  success: boolean;
  message?: string;
}> {
  try {
    logger.info("[Admin] Viewing customer details", {
      businessId,
      customerPhone,
    });

    // Formatar o número de telefone
    const formattedPhone = formatPhoneNumber(customerPhone);

    // Buscar dados do cliente
    const { data: customer, error: customerError } = await supabaseClient
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .eq("phone", formattedPhone)
      .single();

    if (customerError) {
      logger.warn("Customer not found", {
        businessId,
        customerPhone,
        error: customerError.message,
      });
      return {
        customer: null,
        appointments: [],
        success: false,
        message: "Cliente não encontrado.",
      };
    }

    // Buscar histórico de agendamentos do cliente
    const { data: appointments, error: appointmentsError } =
      await supabaseClient
        .from("appointments")
        .select(`
        appointment_id,
        start_time,
        end_time,
        status,
        services:service_id (name, price)
      `)
        .eq("business_id", businessId)
        .eq("customer_id", customer.customer_id)
        .order("start_time", { ascending: false })
        .limit(10);

    if (appointmentsError) {
      logger.error("Error fetching customer appointments", {
        error: appointmentsError.message,
        businessId,
        customerId: customer.customer_id,
      });
      // Continuar mesmo com erro nos agendamentos
    }

    // Formatar agendamentos para exibição
    const formattedAppointments = (appointments || []).map((apt) => ({
      id: apt.appointment_id,
      startTime: apt.start_time,
      endTime: apt.end_time,
      status: apt.status,
      service: apt.services?.[0]?.name || "Serviço desconhecido",
      price: apt.services?.[0]?.price || 0,
    }));

    logger.debug("Customer details retrieved", {
      businessId,
      customerId: customer.customer_id,
      appointmentsCount: formattedAppointments.length,
    });

    return {
      customer,
      appointments: formattedAppointments,
      success: true,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_viewCustomerDetails", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerPhone,
    });

    return {
      customer: null,
      appointments: [],
      success: false,
      message: "Ocorreu um erro ao buscar os detalhes do cliente.",
    };
  }
}

/**
 * Atualiza as informações de um cliente
 * @param businessId ID do negócio
 * @param customerPhone Telefone do cliente
 * @param newName Novo nome (opcional)
 * @param newEmail Novo email (opcional)
 * @param newNotes Novas notas/observações (opcional)
 * @param addTags Tags a serem adicionadas (opcional)
 * @param removeTags Tags a serem removidas (opcional)
 * @param isBlocked Status de bloqueio (opcional)
 */
export async function admin_updateCustomer(
  businessId: string,
  customerPhone: string,
  newName?: string,
  newEmail?: string,
  newNotes?: string,
  addTags?: string[],
  removeTags?: string[],
  isBlocked?: boolean,
): Promise<{ success: boolean; message: string }> {
  try {
    logger.info("[Admin] Updating customer", {
      businessId,
      customerPhone,
      newName,
      isBlocked,
    });

    // Formatar o número de telefone
    const formattedPhone = formatPhoneNumber(customerPhone);

    // Buscar o cliente
    const { data: customer, error: customerError } = await supabaseClient
      .from("customers")
      .select("customer_id, name, email, notes, tags, is_blocked")
      .eq("business_id", businessId)
      .eq("phone", formattedPhone)
      .single();

    if (customerError) {
      logger.warn("Customer not found for update", {
        businessId,
        customerPhone,
        error: customerError.message,
      });
      return {
        success: false,
        message: `Cliente com telefone ${customerPhone} não encontrado.`,
      };
    }

    // Construir objeto de atualização
    const updateObj: Record<string, any> = {};
    let changes = 0;

    if (newName !== undefined) {
      updateObj.name = newName.trim() || customer.name;
      changes++;
    }

    if (newEmail !== undefined) {
      updateObj.email = newEmail.trim() || null;
      changes++;
    }

    if (newNotes !== undefined) {
      updateObj.notes = newNotes.trim();
      changes++;
    }

    if (isBlocked !== undefined) {
      updateObj.is_blocked = isBlocked;
      changes++;
    }

    // Processar tags
    if (addTags || removeTags) {
      const currentTags = Array.isArray(customer.tags) ? customer.tags : [];
      let updatedTags = [...currentTags];

      if (addTags && addTags.length > 0) {
        // Adicionar apenas tags que não existem ainda
        const newTags = addTags.filter((tag) => !currentTags.includes(tag));
        updatedTags = [...updatedTags, ...newTags];
        changes += newTags.length;
      }

      if (removeTags && removeTags.length > 0) {
        const initialLength = updatedTags.length;
        updatedTags = updatedTags.filter((tag) => !removeTags.includes(tag));
        changes += initialLength - updatedTags.length;
      }

      updateObj.tags = updatedTags;
    }

    // Verificar se há alterações
    if (changes === 0) {
      return {
        success: true,
        message: "Nenhuma alteração foi feita.",
      };
    }

    // Atualizar no banco de dados
    const { error: updateError } = await supabaseClient
      .from("customers")
      .update(updateObj)
      .eq("customer_id", customer.customer_id);

    if (updateError) {
      logger.error("Error updating customer", {
        error: updateError.message,
        businessId,
        customerId: customer.customer_id,
      });
      return {
        success: false,
        message: `Erro ao atualizar cliente: ${updateError.message}`,
      };
    }

    logger.info("Customer updated successfully", {
      businessId,
      customerId: customer.customer_id,
      changes,
    });

    // Mensagem de sucesso
    let successMessage = "Cliente atualizado com sucesso!";
    if (isBlocked !== undefined) {
      successMessage += ` Cliente ${isBlocked ? "bloqueado" : "desbloqueado"}.`;
    }

    return {
      success: true,
      message: successMessage,
    };
  } catch (error) {
    logger.error("Unexpected error in admin_updateCustomer", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      customerPhone,
    });

    return {
      success: false,
      message: "Ocorreu um erro inesperado ao atualizar o cliente.",
    };
  }
}
