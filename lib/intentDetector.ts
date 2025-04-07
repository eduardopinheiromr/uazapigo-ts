// lib/intentDetector.ts
import { ConversationState } from "@/types";
import logger from "./logger";

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
  SCHEDULING_COLLECT_SERVICE = "scheduling_collect_service",
  SCHEDULING_COLLECT_DATE = "scheduling_collect_date",
  SCHEDULING_COLLECT_TIME = "scheduling_collect_time",
  SCHEDULING_CONFIRM = "scheduling_confirm",
  CHECK_APPOINTMENTS = "check_appointments",
  CANCEL_APPOINTMENT = "cancel_appointment",
  RESCHEDULE_APPOINTMENT = "reschedule_appointment",
}

/**
 * Interface para regras de detecção de intenção
 */
interface IntentRule {
  intent: Intent;
  patterns: RegExp[];
  requiresAdmin?: boolean;
  excludePatterns?: RegExp[];
  contextCondition?: (state: ConversationState) => boolean;
}

/**
 * Regras para detecção de intenções
 */
const intentRules: IntentRule[] = [
  // Comandos de ajuda/gerais (admin)
  {
    intent: Intent.ADMIN_SHOW_HELP,
    patterns: [
      /^(ajuda|help|comandos|menu|admin|\/help)$/i,
      /mostre os comandos/i,
      /quais (sao|são) os comandos/i,
    ],
    requiresAdmin: true,
  },

  // Comandos de prompt (admin)
  {
    intent: Intent.ADMIN_VIEW_PROMPT,
    patterns: [
      /mostrar prompt/i,
      /ver prompt/i,
      /prompt atual/i,
      /qual (é|eh) o prompt/i,
      /exibir prompt/i,
    ],
    requiresAdmin: true,
  },

  {
    intent: Intent.ADMIN_UPDATE_PROMPT,
    patterns: [
      /atualizar prompt/i,
      /mudar prompt/i,
      /novo prompt/i,
      /editar prompt/i,
      /alterar prompt/i,
      /definir prompt/i,
      /configurar prompt/i,
    ],
    requiresAdmin: true,
  },

  // Comandos de serviços (admin)
  {
    intent: Intent.ADMIN_SHOW_SERVICES,
    patterns: [
      /mostrar servi[çc]os/i,
      /ver servi[çc]os/i,
      /listar servi[çc]os/i,
      /servi[çc]os cadastrados/i,
      /quais s[ãa]o os servi[çc]os/i,
    ],
    requiresAdmin: true,
  },

  {
    intent: Intent.ADMIN_ADD_SERVICE,
    patterns: [
      /adicionar servi[çc]o/i,
      /novo servi[çc]o/i,
      /criar servi[çc]o/i,
      /cadastrar servi[çc]o/i,
    ],
    requiresAdmin: true,
  },

  {
    intent: Intent.ADMIN_UPDATE_SERVICE,
    patterns: [
      /atualizar servi[çc]o/i,
      /editar servi[çc]o/i,
      /modificar servi[çc]o/i,
      /alterar servi[çc]o/i,
    ],
    requiresAdmin: true,
  },

  {
    intent: Intent.ADMIN_TOGGLE_SERVICE,
    patterns: [
      /ativar servi[çc]o/i,
      /desativar servi[çc]o/i,
      /(ligar|desligar) servi[çc]o/i,
      /(habilitar|desabilitar) servi[çc]o/i,
    ],
    requiresAdmin: true,
  },

  // Comandos de RAG (admin)
  {
    intent: Intent.ADMIN_TOGGLE_RAG,
    patterns: [
      /(ativar|desativar) rag/i,
      /(ligar|desligar) rag/i,
      /(habilitar|desabilitar) rag/i,
    ],
    requiresAdmin: true,
  },

  // Comandos de horários (admin)
  {
    intent: Intent.ADMIN_SHOW_BUSINESS_HOURS,
    patterns: [
      /mostrar hor[áa]rios/i,
      /ver hor[áa]rios/i,
      /hor[áa]rios de funcionamento/i,
      /quando (est[áa] aberto|funciona)/i,
    ],
    requiresAdmin: true,
  },

  // Bloqueios de agenda (admin)
  {
    intent: Intent.ADMIN_BLOCK_SCHEDULE,
    patterns: [
      /bloquear agenda/i,
      /bloquear (dia|data)/i,
      /marcar bloqueio/i,
      /indispon[íi]vel/i,
      /fechar agenda/i,
    ],
    requiresAdmin: true,
  },

  {
    intent: Intent.ADMIN_VIEW_SCHEDULE_BLOCKS,
    patterns: [
      /ver bloqueios/i,
      /mostrar bloqueios/i,
      /listar bloqueios/i,
      /bloqueios existentes/i,
      /dias bloqueados/i,
    ],
    requiresAdmin: true,
  },

  // Estatísticas (admin)
  {
    intent: Intent.ADMIN_VIEW_STATS,
    patterns: [
      /estat[íi]sticas/i,
      /relat[óo]rio/i,
      /dashboard/i,
      /m[ée]tricas/i,
      /analytics/i,
      /desempenho/i,
    ],
    requiresAdmin: true,
  },

  // Intenções gerais (para todos os usuários)

  // Agendamento (fluxo principal)
  {
    intent: Intent.START_SCHEDULING,
    patterns: [
      /agendar/i,
      /marcar/i,
      /hor[áa]rio/i,
      /consulta/i,
      /reservar/i,
      /quero (um|uma|fazer)/i,
      /gostaria de (um|uma|fazer)/i,
      /marca[rç][aã]o/i,
    ],
    excludePatterns: [/cancelar/i, /reagendar/i, /desmarcar/i],
  },

  // Coleta de serviço - ativa durante o fluxo de agendamento
  {
    intent: Intent.SCHEDULING_COLLECT_SERVICE,
    patterns: [
      /corte/i,
      /barba/i,
      /cabelo/i,
      /servi[çc]o/i,
      /primeira op[çc][ãa]o/i,
      /segunda op[çc][ãa]o/i,
      /terceira op[çc][ãa]o/i,
      /op[çc][ãa]o \d/i,
      /n[úu]mero \d/i,
    ],
    contextCondition: (state) =>
      state.current_intent === Intent.START_SCHEDULING,
  },

  // Coleta de data - ativa durante o fluxo de agendamento
  {
    intent: Intent.SCHEDULING_COLLECT_DATE,
    patterns: [
      /hoje/i,
      /amanh[ãa]/i,
      /depois de amanh[ãa]/i,
      /segunda(\s*-\s*feira)?/i,
      /ter[çc]a(\s*-\s*feira)?/i,
      /quarta(\s*-\s*feira)?/i,
      /quinta(\s*-\s*feira)?/i,
      /sexta(\s*-\s*feira)?/i,
      /s[áa]bado/i,
      /domingo/i,
      /\d{1,2}\/\d{1,2}/i,
      /\d{1,2}[-\.]\d{1,2}/i,
      /dia \d{1,2}/i,
    ],
    contextCondition: (state) =>
      state.current_intent === Intent.SCHEDULING_COLLECT_SERVICE,
  },

  // Coleta de horário - ativa durante o fluxo de agendamento
  {
    intent: Intent.SCHEDULING_COLLECT_TIME,
    patterns: [
      /\d{1,2}:\d{2}/i,
      /\d{1,2}h(\d{2})?/i,
      /\d{1,2} horas/i,
      /meio dia/i,
      /tarde/i,
      /manh[ãa]/i,
      /noite/i,
    ],
    contextCondition: (state) =>
      state.current_intent === Intent.SCHEDULING_COLLECT_DATE,
  },

  // Confirmação - ativa durante o fluxo de agendamento
  {
    intent: Intent.SCHEDULING_CONFIRM,
    patterns: [
      /sim/i,
      /confirmo/i,
      /confirmado/i,
      /pode ser/i,
      /certo/i,
      /correto/i,
      /ok/i,
      /tudo bem/i,
      /perfeito/i,
    ],
    contextCondition: (state) =>
      state.current_intent === Intent.SCHEDULING_COLLECT_TIME,
  },

  // Verificar agendamentos
  {
    intent: Intent.CHECK_APPOINTMENTS,
    patterns: [
      /meus agendamentos/i,
      /meus hor[áa]rios/i,
      /minha agenda/i,
      /pr[óo]ximo agendamento/i,
      /tenho hor[áa]rio/i,
      /ver (meu|meus)/i,
      /consultar (meu|meus)/i,
      /quando (estou|estou marcado|tenho hora marcada)/i,
    ],
  },

  // Cancelamento
  {
    intent: Intent.CANCEL_APPOINTMENT,
    patterns: [
      /cancelar/i,
      /desmarcar/i,
      /remover agendamento/i,
      /n[ãa]o (vou|poderei|posso) (ir|comparecer)/i,
      /cancelamento/i,
    ],
  },

  // Reagendamento
  {
    intent: Intent.RESCHEDULE_APPOINTMENT,
    patterns: [
      /reagendar/i,
      /remarcar/i,
      /mudar hor[áa]rio/i,
      /alterar hor[áa]rio/i,
      /outro dia/i,
      /outra data/i,
      /outro hor[áa]rio/i,
    ],
  },

  // FAQs (perguntas frequentes)
  {
    intent: Intent.FAQ,
    patterns: [
      /quanto custa/i,
      /pre[çc]o/i,
      /valor/i,
      /hor[áa]rio de funcionamento/i,
      /d[úu]vida/i,
      /como funciona/i,
      /onde (fica|est[áa]|se localiza)/i,
      /endere[çc]o/i,
      /aceita(m)? (cart[ãa]o|pix|dinheiro)/i,
      /forma(s)? de pagamento/i,
      /telefone/i,
      /contato/i,
    ],
  },
];

/**
 * Detecta a intenção do usuário com base na mensagem e estado da conversa
 */
export function detectIntent(
  message: string,
  isAdmin: boolean = false,
  state?: ConversationState,
): Intent {
  try {
    const text = message.toLowerCase().trim();

    // Se existe uma conversa em andamento, verificar se a mensagem se encaixa no fluxo atual
    if (state && state.current_intent) {
      for (const rule of intentRules) {
        // Pular regras que requerem admin se o usuário não for admin
        if (rule.requiresAdmin && !isAdmin) continue;

        // Verificar se regra tem condição de contexto e se ele se aplica
        if (rule.contextCondition && rule.contextCondition(state)) {
          // Verificar se algum padrão da regra corresponde
          if (rule.patterns.some((pattern) => pattern.test(text))) {
            logger.debug("Intent detected from context", {
              message: text,
              intent: rule.intent,
              currentContextIntent: state.current_intent,
            });
            return rule.intent;
          }
        }
      }
    }

    // Verificar todas as regras para determinar a intenção
    for (const rule of intentRules) {
      // Pular regras que requerem admin se o usuário não for admin
      if (rule.requiresAdmin && !isAdmin) continue;

      // Pular regras que necessitam de contexto específico
      if (rule.contextCondition) continue;

      // Verificar se há padrões de exclusão e se algum deles corresponde
      if (
        rule.excludePatterns &&
        rule.excludePatterns.some((pattern) => pattern.test(text))
      ) {
        continue;
      }

      // Verificar se algum padrão da regra corresponde
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        logger.debug("Intent detected", { message: text, intent: rule.intent });
        return rule.intent;
      }
    }

    // Se não encontrou nenhuma intenção específica
    logger.debug("No specific intent detected, using GENERAL_CHAT", {
      message: text,
    });
    return Intent.GENERAL_CHAT;
  } catch (error) {
    logger.error("Error detecting intent", {
      message,
      error: error instanceof Error ? error.message : String(error),
    });
    return Intent.GENERAL_CHAT;
  }
}

/**
 * Parâmetros para comandos administrativos
 */
export interface AdminCommandParams {
  command: string;
  newPrompt?: string;
  serviceId?: string;
  serviceName?: string;
  servicePrice?: number;
  serviceDuration?: number;
  serviceDescription?: string;
  serviceActive?: boolean;
  startDate?: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  blockTitle?: string;
  blockId?: string;
  day?: string;
  ragEnabled?: boolean;
  needMoreInfo?: boolean;
}

/**
 * Usa expressões regulares para extrair parâmetros de um comando administrativo
 */
export function parseAdminCommand(
  text: string,
  intent: Intent,
): AdminCommandParams | null {
  try {
    const commandText = text.trim();

    switch (intent) {
      case Intent.ADMIN_UPDATE_PROMPT:
        // Tenta extrair o novo prompt separado por : ou após "para"
        const promptMatch =
          commandText.match(/atualizar prompt(?:\s*para|:)\s*(.+)/is) ||
          commandText.match(/novo prompt(?:\s*para|:)\s*(.+)/is) ||
          commandText.match(/mudar prompt(?:\s*para|:)\s*(.+)/is) ||
          commandText.match(/definir prompt(?:\s*para|:)\s*(.+)/is);

        if (promptMatch && promptMatch[1]) {
          return {
            command: "updatePrompt",
            newPrompt: promptMatch[1].trim(),
          };
        }

        // Se não conseguiu extrair ainda, verifica se a mensagem inteira poderia ser o prompt
        // (Caso o admin tenha enviado o comando em uma mensagem e o prompt em outra)
        if (
          commandText.length > 20 &&
          !commandText.toLowerCase().includes("atualizar prompt") &&
          !commandText.toLowerCase().includes("mostrar prompt")
        ) {
          return {
            command: "updatePrompt",
            newPrompt: commandText.trim(),
          };
        }

        return { command: "updatePrompt", needMoreInfo: true };

      case Intent.ADMIN_ADD_SERVICE:
        // Adicionar serviço: Nome, Preço, Duração, Descrição
        const serviceMatch = commandText.match(
          /adicionar servi[çc]o:?\s*(.+)/i,
        );

        if (serviceMatch && serviceMatch[1]) {
          // Tentar extrair os parâmetros do serviço do texto
          const nameMatch = serviceMatch[1].match(/nome:?\s*([^,]+)/i);
          const priceMatch = serviceMatch[1].match(
            /pre[çc]o:?\s*R?\$?\s*(\d+(?:[.,]\d{1,2})?)/i,
          );
          const durationMatch = serviceMatch[1].match(
            /dura[çc][ãa]o:?\s*(\d+)\s*min/i,
          );
          const descriptionMatch = serviceMatch[1].match(
            /descri[çc][ãa]o:?\s*(.+)(?=$|,\s*nome:|,\s*pre[çc]o:|,\s*dura[çc][ãa]o:)/i,
          );

          return {
            command: "addService",
            serviceName: nameMatch ? nameMatch[1].trim() : undefined,
            servicePrice: priceMatch
              ? parseFloat(priceMatch[1].replace(",", "."))
              : undefined,
            serviceDuration: durationMatch
              ? parseInt(durationMatch[1])
              : undefined,
            serviceDescription: descriptionMatch
              ? descriptionMatch[1].trim()
              : undefined,
            needMoreInfo: !(nameMatch && priceMatch && durationMatch),
          };
        }

        return { command: "addService", needMoreInfo: true };

      case Intent.ADMIN_TOGGLE_SERVICE:
        // Ativar/Desativar serviço
        const toggleMatch = commandText.match(
          /(ativar|desativar) servi[çc]o:?\s*(.+)/i,
        );

        if (toggleMatch) {
          const action = toggleMatch[1].toLowerCase();
          const serviceName = toggleMatch[2].trim();

          return {
            command: "toggleService",
            serviceName,
            serviceActive: action === "ativar",
          };
        }

        return { command: "toggleService", needMoreInfo: true };

      case Intent.ADMIN_BLOCK_SCHEDULE:
        // Bloquear agenda: Data, Horário, Título opcional
        const blockMatch = commandText.match(/bloquear agenda:?\s*(.+)/i);

        if (blockMatch && blockMatch[1]) {
          // Extrair data, horário e título
          const dateMatch =
            blockMatch[1].match(/data:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i) ||
            blockMatch[1].match(/dia:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);

          const timeMatch = blockMatch[1].match(
            /hor[áa]rio:?\s*(\d{1,2}(?::\d{2})?(?:\s*(?:h|hrs))?)\s*(?:(?:a|à)s|at[ée])?\s*(\d{1,2}(?::\d{2})?(?:\s*(?:h|hrs))?)/i,
          );
          const titleMatch = blockMatch[1].match(
            /t[íi]tulo:?\s*(.+?)(?=$|,\s*data:|,\s*dia:|,\s*hor[áa]rio:)/i,
          );

          return {
            command: "blockSchedule",
            startDate: dateMatch ? dateMatch[1].trim() : undefined,
            startTime: timeMatch ? timeMatch[1].trim() : undefined,
            endTime: timeMatch ? timeMatch[2].trim() : undefined,
            blockTitle: titleMatch
              ? titleMatch[1].trim()
              : "Bloqueio de agenda",
            needMoreInfo: !(dateMatch && timeMatch),
          };
        }

        return { command: "blockSchedule", needMoreInfo: true };

      case Intent.ADMIN_TOGGLE_RAG:
        // Ativar/Desativar RAG
        const ragMatch = commandText.match(/(ativar|desativar) rag/i);

        if (ragMatch) {
          return {
            command: "toggleRag",
            ragEnabled: ragMatch[1].toLowerCase() === "ativar",
          };
        }

        return { command: "toggleRag", needMoreInfo: true };

      default:
        return null;
    }
  } catch (error) {
    logger.error("Error parsing admin command", {
      text,
      intent,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
