// lib/intentDetector.ts

/**
 * Tipos de intenções suportadas
 */
export enum Intent {
  // Intenções gerais
  GENERAL_CHAT = "general_chat",
  FAQ = "faq",

  // Intenções administrativas
  ADMIN_SHOW_HELP = "admin_show_help",
  ADMIN_VIEW_PROMPT = "admin_view_prompt",
  ADMIN_UPDATE_PROMPT = "admin_update_prompt",
  ADMIN_SHOW_SERVICES = "admin_show_services",
  ADMIN_ADD_SERVICE = "admin_add_service",
  ADMIN_UPDATE_SERVICE = "admin_update_service",
  ADMIN_TOGGLE_SERVICE = "admin_toggle_service",
  ADMIN_TOGGLE_RAG = "admin_toggle_rag",
  ADMIN_SHOW_BUSINESS_HOURS = "admin_show_business_hours",
  ADMIN_UPDATE_BUSINESS_HOURS = "admin_update_business_hours",
  ADMIN_BLOCK_SCHEDULE = "admin_block_schedule",
  ADMIN_VIEW_SCHEDULE_BLOCKS = "admin_view_schedule_blocks",
  ADMIN_REMOVE_SCHEDULE_BLOCK = "admin_remove_schedule_block",
  ADMIN_VIEW_STATS = "admin_view_stats",

  // Intenções de agendamento
  START_SCHEDULING = "start_scheduling",
  CHECK_APPOINTMENTS = "check_appointments",
  CANCEL_APPOINTMENT = "cancel_appointment",
}

/**
 * Detecta a intenção do usuário com base na mensagem
 */
export function detectIntent(
  message: string,
  isAdmin: boolean = false,
): Intent {
  const text = message.toLowerCase().trim();

  // Se for admin, verificar comandos administrativos
  if (isAdmin) {
    // Comandos de ajuda/gerais
    if (/ajuda|comandos|help|menu|admin/i.test(text)) {
      return Intent.ADMIN_SHOW_HELP;
    }

    // Comandos de prompt
    if (
      /mostrar prompt|ver prompt|prompt atual|qual (é|eh) o prompt/i.test(text)
    ) {
      return Intent.ADMIN_VIEW_PROMPT;
    }

    if (/atualizar prompt|mudar prompt|novo prompt|editar prompt/i.test(text)) {
      return Intent.ADMIN_UPDATE_PROMPT;
    }

    // Comandos de serviços
    if (
      /mostrar serviços|ver serviços|listar serviços|serviços cadastrados/i.test(
        text,
      )
    ) {
      return Intent.ADMIN_SHOW_SERVICES;
    }

    if (
      /adicionar serviço|novo serviço|criar serviço|cadastrar serviço/i.test(
        text,
      )
    ) {
      return Intent.ADMIN_ADD_SERVICE;
    }

    // Comandos de RAG
    if (/ativar rag|ligar rag|habilitar rag/i.test(text)) {
      return Intent.ADMIN_TOGGLE_RAG;
    }

    if (/desativar rag|desligar rag|desabilitar rag/i.test(text)) {
      return Intent.ADMIN_TOGGLE_RAG;
    }

    // Comandos de horários
    if (/mostrar horários|ver horários|horários de funcionamento/i.test(text)) {
      return Intent.ADMIN_SHOW_BUSINESS_HOURS;
    }

    // Bloqueios de agenda
    if (/bloquear agenda|bloquear data|marcar bloqueio/i.test(text)) {
      return Intent.ADMIN_BLOCK_SCHEDULE;
    }

    if (/ver bloqueios|mostrar bloqueios|listar bloqueios/i.test(text)) {
      return Intent.ADMIN_VIEW_SCHEDULE_BLOCKS;
    }

    // Estatísticas
    if (/estatísticas|relatório|dashboard|métricas/i.test(text)) {
      return Intent.ADMIN_VIEW_STATS;
    }
  }

  // Intenções gerais (para todos os usuários)

  // Agendamento
  if (/agendar|marcar|horário|consulta|reservar/i.test(text)) {
    return Intent.START_SCHEDULING;
  }

  // Verificar agendamentos
  if (
    /meus agendamentos|meus horários|minha agenda|próximo agendamento|tenho horário/i.test(
      text,
    )
  ) {
    return Intent.CHECK_APPOINTMENTS;
  }

  // Cancelamento
  if (/cancelar|desmarcar|remover agendamento/i.test(text)) {
    return Intent.CANCEL_APPOINTMENT;
  }

  // FAQs (perguntas frequentes)
  if (
    /quanto custa|preço|valor|horário de funcionamento|dúvida|como funciona/i.test(
      text,
    )
  ) {
    return Intent.FAQ;
  }

  // Se não identificar uma intenção específica
  return Intent.GENERAL_CHAT;
}

/**
 * Usa o Gemini para extrair parâmetros de um comando administrativo
 * Esta função será expandida para usar a IA para extrair parâmetros complexos
 */
export function parseAdminCommand(text: string, intent: Intent): any {
  switch (intent) {
    case Intent.ADMIN_UPDATE_PROMPT:
      // Tenta extrair o novo prompt separado por : ou após "para"
      const promptMatch =
        text.match(/atualizar prompt(?:\s*para|:)\s*(.+)/is) ||
        text.match(/novo prompt(?:\s*para|:)\s*(.+)/is) ||
        text.match(/mudar prompt(?:\s*para|:)\s*(.+)/is);

      if (promptMatch && promptMatch[1]) {
        return {
          newPrompt: promptMatch[1].trim(),
        };
      }

      // Se não conseguiu extrair ainda, verifica se a mensagem inteira poderia ser o prompt
      // (Caso o admin tenha enviado o comando em uma mensagem e o prompt em outra)
      if (
        text.length > 20 &&
        !text.toLowerCase().includes("atualizar prompt")
      ) {
        return {
          newPrompt: text.trim(),
        };
      }

      return { needMoreInfo: true };

    // Outras intenções serão implementadas posteriormente

    default:
      return null;
  }
}
