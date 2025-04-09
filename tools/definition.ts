// tools/definition.ts

import { FunctionDeclaration, SchemaType } from "@google/generative-ai";

/**
 * Definições das ferramentas (funções) que o Gemini pode solicitar para execução.
 * Estas são passadas para o modelo GenerativeModel durante a inicialização ou em cada chamada.
 *
 * IMPORTANTE:
 * - A lógica REAL de execução destas funções (interação com Supabase, Redis, etc.)
 * deve ser implementada separadamente no backend.
 * - O backend DEVE usar o contexto da mensagem (fornecido pelo uazapiAdapter)
 * para obter `businessId`, `customerPhone`, `isAdmin`, etc., e para realizar
 * verificações de permissão (especialmente para funções admin).
 * - As descrições em pt-BR são essenciais para guiar o LLM sobre o propósito e
 * o momento de uso de cada ferramenta.
 */

// -----------------------------------------------------------------------------
// Funções para Usuários Finais (Clientes)
// -----------------------------------------------------------------------------

const listServices: FunctionDeclaration = {
  name: "listServices",
  description:
    "Lista os serviços ativos oferecidos pelo estabelecimento, incluindo nome, descrição, duração e preço.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}, // Sem parâmetros necessários, `businessId` vem do contexto.
  },
};

const checkAvailableDates: FunctionDeclaration = {
  name: "checkAvailableDates",
  description:
    "Verifica e retorna as próximas datas com horários disponíveis para agendamento, opcionalmente filtrando por um nome de serviço específico.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      serviceName: {
        type: SchemaType.STRING,
        description:
          "Nome do serviço desejado para verificar a disponibilidade específica (opcional). Se omitido, verifica disponibilidade geral.",
      },
      referenceMonth: {
        type: SchemaType.STRING,
        description:
          "Mês de referência para a busca no formato AAAA-MM (opcional, padrão: mês atual e próximo).",
      },
    },
    // `businessId` vem do contexto.
  },
};

const checkAvailableTimes: FunctionDeclaration = {
  name: "checkAvailableTimes",
  description:
    "Verifica e retorna os horários de início disponíveis para um serviço específico em uma data específica.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      serviceName: {
        type: SchemaType.STRING,
        description: "Nome exato do serviço desejado.",
      },
      date: {
        type: SchemaType.STRING,
        description: "Data desejada para o agendamento no formato AAAA-MM-DD.",
      },
    },
    required: ["serviceName", "date"],
    // `businessId` vem do contexto.
  },
};

const createAppointment: FunctionDeclaration = {
  name: "createAppointment",
  description:
    "Cria um novo agendamento para o cliente que está interagindo. Requer o nome do serviço, a data e a hora exata de início.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      serviceName: {
        type: SchemaType.STRING,
        description: "Nome exato do serviço a ser agendado.",
      },
      date: {
        type: SchemaType.STRING,
        description: "Data do agendamento no formato AAAA-MM-DD.",
      },
      time: {
        type: SchemaType.STRING,
        description:
          "Hora de início do agendamento no formato HH:MM (ex: 09:00, 14:30).",
      },
    },
    required: ["serviceName", "date", "time"],
    // `businessId` e `customerPhone` (para identificar/criar customer) vêm do contexto.
    // A implementação backend usará a função RPC `create_appointment_transaction`.
  },
};

const listMyAppointments: FunctionDeclaration = {
  name: "listMyAppointments",
  description:
    "Consulta os próximos agendamentos (confirmados ou pendentes) do cliente que está interagindo.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}, // `businessId` e `customerPhone` vêm do contexto.
  },
};

const cancelAppointment: FunctionDeclaration = {
  name: "cancelAppointment",
  description:
    "Cancela um agendamento futuro específico do cliente que está interagindo, identificado pela data e hora.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      appointmentDate: {
        type: SchemaType.STRING,
        description: "Data do agendamento a ser cancelado (AAAA-MM-DD).",
      },
      appointmentTime: {
        type: SchemaType.STRING,
        description: "Hora de início do agendamento a ser cancelado (HH:MM).",
      },
      serviceName: {
        type: SchemaType.STRING,
        description:
          "Nome do serviço do agendamento a ser cancelado (opcional, útil se houver múltiplos agendamentos no mesmo horário).",
      },
    },
    required: ["appointmentDate", "appointmentTime"],
    // `businessId` e `customerPhone` vêm do contexto.
    // Backend precisa localizar o appointment_id correspondente.
  },
};

const rescheduleAppointment: FunctionDeclaration = {
  name: "rescheduleAppointment",
  description:
    "Altera a data e/ou hora de um agendamento existente do cliente que está interagindo para um novo horário disponível.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      originalDate: {
        type: SchemaType.STRING,
        description: "Data original do agendamento (AAAA-MM-DD).",
      },
      originalTime: {
        type: SchemaType.STRING,
        description: "Hora original de início do agendamento (HH:MM).",
      },
      newDate: {
        type: SchemaType.STRING,
        description: "Nova data desejada para o agendamento (AAAA-MM-DD).",
      },
      newTime: {
        type: SchemaType.STRING,
        description: "Nova hora de início desejada para o agendamento (HH:MM).",
      },
      serviceName: {
        type: SchemaType.STRING,
        description:
          "Nome do serviço do agendamento a ser reagendado (opcional, para desambiguação).",
      },
    },
    required: ["originalDate", "originalTime", "newDate", "newTime"],
    // `businessId` e `customerPhone` vêm do contexto.
    // Backend precisa localizar o appointment_id original e verificar disponibilidade do novo horário.
  },
};

const getBusinessHours: FunctionDeclaration = {
  name: "getBusinessHours",
  description:
    "Consulta os dias e horários de funcionamento padrão do estabelecimento.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}, // `businessId` vem do contexto.
  },
};

const getBusinessInfo: FunctionDeclaration = {
  name: "getBusinessInfo",
  description:
    "Fornece informações gerais sobre o estabelecimento (ex: endereço, telefone de contato, formas de pagamento). Usar preferencialmente a base de conhecimento (RAG) se ativada e houver informação relevante, caso contrário, buscar dados básicos configurados.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}, // `businessId` vem do contexto.
  },
};

const requestHumanAgent: FunctionDeclaration = {
  name: "requestHumanAgent",
  description:
    "Marca a conversa atual para direcionamento a um atendente humano quando o assistente não puder resolver a solicitação ou o cliente pedir explicitamente. Notifica a equipe responsável.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      reason: {
        type: SchemaType.STRING,
        description:
          "Motivo pelo qual o atendimento humano está sendo solicitado (opcional).",
      },
    },
    // `businessId` e `customerPhone` vêm do contexto.
  },
};

// -----------------------------------------------------------------------------
// Funções para Administradores
// -----------------------------------------------------------------------------
// IMPORTANTE: O backend DEVE verificar o status de admin (`metadata.isAdmin`)
// do remetente ANTES de executar a lógica destas funções.

const admin_viewCurrentPrompt: FunctionDeclaration = {
  name: "admin_viewCurrentPrompt",
  description:
    "[Admin] Visualiza o prompt de sistema (personalidade) atual configurado para o assistente.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}, // `businessId` vem do contexto.
  },
};

const admin_updatePrompt: FunctionDeclaration = {
  name: "admin_updatePrompt",
  description:
    "[Admin] Atualiza o prompt de sistema (personalidade) do assistente.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      newPrompt: {
        type: SchemaType.STRING,
        description: "O novo texto completo do prompt de sistema.",
      },
    },
    required: ["newPrompt"],
    // `businessId` vem do contexto.
  },
};

const admin_configureRag: FunctionDeclaration = {
  name: "admin_configureRag",
  description:
    "[Admin] Ativa ou desativa o uso da base de conhecimento (RAG - Retrieval-Augmented Generation) para responder perguntas.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      enable: {
        type: SchemaType.BOOLEAN,
        description:
          "Defina como 'true' para ativar o RAG ou 'false' para desativar.",
      },
    },
    required: ["enable"],
    // `businessId` vem do contexto.
  },
};

const admin_listServices: FunctionDeclaration = {
  name: "admin_listServices",
  description:
    "[Admin] Lista todos os serviços cadastrados, incluindo os inativos, com seus detalhes (nome, preço, duração, status).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {}, // `businessId` vem do contexto.
  },
};

const admin_addService: FunctionDeclaration = {
  name: "admin_addService",
  description:
    "[Admin] Adiciona um novo serviço ao catálogo do estabelecimento.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: { type: SchemaType.STRING, description: "Nome do novo serviço." },
      description: {
        type: SchemaType.STRING,
        description: "Descrição detalhada do serviço (opcional).",
      },
      durationMinutes: {
        type: SchemaType.NUMBER,
        description: "Duração do serviço em minutos (número inteiro).",
      },
      price: {
        type: SchemaType.NUMBER,
        description: "Preço do serviço (número decimal).",
      },
    },
    required: ["name", "durationMinutes", "price"],
    // `businessId` vem do contexto.
  },
};

const admin_updateService: FunctionDeclaration = {
  name: "admin_updateService",
  description:
    "[Admin] Atualiza os detalhes de um serviço existente, identificado pelo seu nome atual.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      currentServiceName: {
        type: SchemaType.STRING,
        description: "Nome exato do serviço como está cadastrado atualmente.",
      },
      newName: {
        type: SchemaType.STRING,
        description: "Novo nome para o serviço (opcional).",
      },
      newDescription: {
        type: SchemaType.STRING,
        description: "Nova descrição para o serviço (opcional).",
      },
      newDurationMinutes: {
        type: SchemaType.NUMBER,
        description: "Nova duração em minutos (número inteiro, opcional).",
      },
      newPrice: {
        type: SchemaType.NUMBER,
        description: "Novo preço (número decimal, opcional).",
      },
      isActive: {
        type: SchemaType.BOOLEAN,
        description:
          "Definir como 'true' para tornar o serviço ativo ou 'false' para inativar (opcional).",
      },
    },
    required: ["currentServiceName"],
    // `businessId` vem do contexto. Backend busca o service_id pelo nome atual.
  },
};

const admin_updateBusinessHours: FunctionDeclaration = {
  name: "admin_updateBusinessHours",
  description:
    "[Admin] Atualiza os horários de funcionamento padrão para um dia específico da semana. Use HH:MM para horários ou 'fechado'/'null' para indicar que não abre.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      dayOfWeek: {
        type: SchemaType.STRING,
        description:
          "Dia da semana em inglês, tudo minúsculo (ex: monday, tuesday, saturday).",
      },
      startTime: {
        type: SchemaType.STRING,
        description:
          "Nova hora de início no formato HH:MM ou a palavra 'fechado' ou 'null'.",
      },
      endTime: {
        type: SchemaType.STRING,
        description:
          "Nova hora de fim no formato HH:MM ou a palavra 'fechado' ou 'null'.",
      },
    },
    required: ["dayOfWeek", "startTime", "endTime"],
    // `businessId` vem do contexto. Backend valida a consistência (ambos horários ou ambos 'fechado'/'null').
  },
};

const admin_createScheduleBlock: FunctionDeclaration = {
  name: "admin_createScheduleBlock",
  description:
    "[Admin] Cria um bloqueio na agenda para um período específico (ex: feriado, evento, férias), impedindo novos agendamentos. Use o formato ISO 8601 para data e hora.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      title: {
        type: SchemaType.STRING,
        description:
          "Um nome ou descrição para o bloqueio (ex: Feriado Nacional, Férias Equipe).",
      },
      startTimeIso: {
        type: SchemaType.STRING,
        description:
          "Data e hora de início do bloqueio no formato ISO 8601 (ex: 2025-12-25T00:00:00-03:00 ou 2025-12-25T03:00:00Z).",
      },
      endTimeIso: {
        type: SchemaType.STRING,
        description:
          "Data e hora de término do bloqueio no formato ISO 8601 (ex: 2025-12-25T23:59:59-03:00 ou 2025-12-26T02:59:59Z).",
      },
    },
    required: ["title", "startTimeIso", "endTimeIso"],
    // `businessId` vem do contexto.
  },
};

const admin_listScheduleBlocks: FunctionDeclaration = {
  name: "admin_listScheduleBlocks",
  description:
    "[Admin] Lista os bloqueios de agenda programados, opcionalmente filtrando por um período.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      startDate: {
        type: SchemaType.STRING,
        description:
          "Data de início do período para filtrar os bloqueios (AAAA-MM-DD, opcional, padrão: data atual).",
      },
      endDate: {
        type: SchemaType.STRING,
        description:
          "Data de fim do período para filtrar os bloqueios (AAAA-MM-DD, opcional, padrão: 90 dias a partir do início).",
      },
    },
    // `businessId` vem do contexto.
  },
};

const admin_deleteScheduleBlock: FunctionDeclaration = {
  name: "admin_deleteScheduleBlock",
  description:
    "[Admin] Remove um bloqueio de agenda existente, identificado pelo seu título e data/hora de início.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      title: {
        type: SchemaType.STRING,
        description: "Título exato do bloqueio a ser removido.",
      },
      startTimeIso: {
        type: SchemaType.STRING,
        description:
          "Data e hora de início exata do bloqueio no formato ISO 8601.",
      },
    },
    required: ["title", "startTimeIso"],
    // `businessId` vem do contexto. Backend localiza e remove o bloqueio.
  },
};

const admin_getStatistics: FunctionDeclaration = {
  name: "admin_getStatistics",
  description:
    "[Admin] Exibe estatísticas básicas de desempenho (ex: número de agendamentos, principais serviços).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      period: {
        type: SchemaType.STRING,
        description:
          "Período desejado para as estatísticas (ex: 'today', 'last_7_days', 'current_month', 'YYYY-MM', opcional, padrão: 'current_month').",
      },
    },
    // `businessId` vem do contexto.
  },
};

const admin_listAppointments: FunctionDeclaration = {
  name: "admin_listAppointments",
  description:
    "[Admin] Lista os agendamentos, permitindo filtrar por data e/ou status.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      date: {
        type: SchemaType.STRING,
        description:
          "Filtrar agendamentos por uma data específica (AAAA-MM-DD, opcional).",
      },
      status: {
        type: SchemaType.STRING,
        description:
          "Filtrar agendamentos por status (ex: scheduled, confirmed, cancelled, completed, no_show, all - opcional, padrão: scheduled, confirmed).",
      },
      orderBy: {
        type: SchemaType.STRING,
        description:
          "Critério de ordenação (ex: 'startTimeAsc', 'startTimeDesc', 'createdAtDesc' - opcional, padrão: 'startTimeAsc').",
      },
      limit: {
        type: SchemaType.NUMBER,
        description:
          "Número máximo de agendamentos a serem retornados (opcional, padrão: 20).",
      },
    },
    // `businessId` vem do contexto.
  },
};

const admin_listCustomers: FunctionDeclaration = {
  name: "admin_listCustomers",
  description:
    "[Admin] Lista os clientes cadastrados no sistema, permitindo busca por nome ou telefone.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      searchTerm: {
        type: SchemaType.STRING,
        description:
          "Termo para buscar clientes por nome ou número de telefone (opcional).",
      },
      limit: {
        type: SchemaType.NUMBER,
        description:
          "Número máximo de clientes a serem retornados (opcional, padrão: 20).",
      },
      orderBy: {
        type: SchemaType.STRING,
        description:
          "Critério de ordenação (ex: 'nameAsc', 'lastInteractionDesc', 'createdAtDesc' - opcional, padrão: 'nameAsc').",
      },
    },
    // `businessId` vem do contexto.
  },
};

const admin_viewCustomerDetails: FunctionDeclaration = {
  name: "admin_viewCustomerDetails",
  description:
    "[Admin] Visualiza os detalhes de um cliente específico, identificado pelo número de telefone.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      customerPhone: {
        type: SchemaType.STRING,
        description:
          "Número de telefone do cliente no formato internacional (ex: 5511999998888).",
      },
    },
    required: ["customerPhone"],
    // `businessId` vem do contexto.
  },
};

const admin_updateCustomer: FunctionDeclaration = {
  name: "admin_updateCustomer",
  description:
    "[Admin] Atualiza informações de um cliente (nome, email, notas, tags, status de bloqueio).",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      customerPhone: {
        type: SchemaType.STRING,
        description:
          "Número de telefone do cliente a ser atualizado (formato internacional).",
      },
      newName: {
        type: SchemaType.STRING,
        description: "Novo nome para o cliente (opcional).",
      },
      newEmail: {
        type: SchemaType.STRING,
        description: "Novo email para o cliente (opcional).",
      },
      newNotes: {
        type: SchemaType.STRING,
        description:
          "Novas notas ou observações sobre o cliente (opcional, substitui as existentes).",
      },
      addTags: {
        type: SchemaType.ARRAY,
        description: "Lista de tags a serem adicionadas ao cliente (opcional).",
        items: { type: SchemaType.STRING },
      },
      removeTags: {
        type: SchemaType.ARRAY,
        description: "Lista de tags a serem removidas do cliente (opcional).",
        items: { type: SchemaType.STRING },
      },
      isBlocked: {
        type: SchemaType.BOOLEAN,
        description:
          "Definir como 'true' para bloquear o cliente ou 'false' para desbloquear (opcional).",
      },
    },
    required: ["customerPhone"],
    // `businessId` vem do contexto.
  },
};

// Agrupar todas as ferramentas disponíveis
export const availableTools: FunctionDeclaration[] = [
  // --- Client Tools ---
  listServices,
  checkAvailableDates,
  checkAvailableTimes,
  createAppointment,
  listMyAppointments,
  cancelAppointment,
  rescheduleAppointment,
  getBusinessHours,
  getBusinessInfo,
  requestHumanAgent,
  // --- Admin Tools ---
  admin_viewCurrentPrompt,
  admin_updatePrompt,
  admin_configureRag,
  admin_listServices,
  admin_addService,
  admin_updateService,
  admin_updateBusinessHours,
  admin_createScheduleBlock,
  admin_listScheduleBlocks,
  admin_deleteScheduleBlock, // Adicionada função para remover bloqueios
  admin_getStatistics,
  admin_listAppointments,
  admin_listCustomers,
  admin_viewCustomerDetails,
  admin_updateCustomer,
];

// Opcional: Exportar como Tool object se usar a estrutura mais recente da SDK
// import { Tool } from "@google/generative-ai";
// export const toolConfig: Tool = { functionDeclarations: availableTools };
