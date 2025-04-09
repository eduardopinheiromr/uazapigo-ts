// agent/tools.ts
import { FunctionDeclaration } from "@google/generative-ai";
import {
  ToolCallInfo,
  ToolExecutor,
  ToolProvider,
  RequestContext,
} from "./types";
import logger from "@/lib/logger";
import { availableTools } from "@/tools/definition";

// Importações de serviços
import * as serviceModule from "@/services/service";
import * as appointmentModule from "@/services/appointment";
import * as businessModule from "@/services/business";
import * as interactionModule from "@/services/interaction";

// Importações de serviços de administração
import * as adminPromptModule from "@/services/admin/prompt";
import * as adminServiceModule from "@/services/admin/service";
import * as adminScheduleModule from "@/services/admin/schedule";
import * as adminAnalyticsModule from "@/services/admin/analytics";
import * as adminCustomerModule from "@/services/admin/customer";

/**
 * Mapeamento de nomes de ferramentas para funções de implementação
 */
const TOOL_IMPLEMENTATIONS: Record<string, Function> = {
  // Ferramentas para usuários finais
  listServices: serviceModule.listServices,
  checkAvailableDates: appointmentModule.checkAvailableDates,
  checkAvailableTimes: appointmentModule.checkAvailableTimes,
  createAppointment: appointmentModule.createAppointment,
  listMyAppointments: appointmentModule.listMyAppointments,
  cancelAppointment: appointmentModule.cancelAppointment,
  rescheduleAppointment: appointmentModule.rescheduleAppointment,
  getBusinessHours: businessModule.getBusinessHours,
  getBusinessInfo: businessModule.getBusinessInfo,
  requestHumanAgent: interactionModule.requestHumanAgent,

  // Ferramentas para administradores
  admin_viewCurrentPrompt: adminPromptModule.admin_viewCurrentPrompt,
  admin_updatePrompt: adminPromptModule.admin_updatePrompt,
  admin_configureRag: adminPromptModule.admin_configureRag,
  admin_listServices: adminServiceModule.admin_listServices,
  admin_addService: adminServiceModule.admin_addService,
  admin_updateService: adminServiceModule.admin_updateService,
  admin_updateBusinessHours: adminScheduleModule.admin_updateBusinessHours,
  admin_createScheduleBlock: adminScheduleModule.admin_createScheduleBlock,
  admin_listScheduleBlocks: adminScheduleModule.admin_listScheduleBlocks,
  admin_deleteScheduleBlock: adminScheduleModule.admin_deleteScheduleBlock,
  admin_getStatistics: adminAnalyticsModule.admin_getStatistics,
  admin_listAppointments: adminAnalyticsModule.admin_listAppointments,
  admin_listCustomers: adminCustomerModule.admin_listCustomers,
  admin_viewCustomerDetails: adminCustomerModule.admin_viewCustomerDetails,
  admin_updateCustomer: adminCustomerModule.admin_updateCustomer,
};

/**
 * Implementação de ToolProvider que fornece ferramentas disponíveis com base no perfil
 */
export class DefaultToolProvider implements ToolProvider {
  /**
   * Obtém as ferramentas disponíveis para o perfil
   * @param isAdmin Indica se é administrador
   */
  getAvailableTools(isAdmin: boolean): FunctionDeclaration[] {
    return availableTools.filter((tool) => {
      // Se for admin, todas as ferramentas estão disponíveis
      if (isAdmin) return true;

      // Se não for admin, apenas ferramentas não-admin estão disponíveis
      return !tool.name.startsWith("admin_");
    });
  }
}

/**
 * Implementação de ToolExecutor que executa chamadas de ferramentas
 */
export class DefaultToolExecutor implements ToolExecutor {
  /**
   * Executa uma chamada de ferramenta
   * @param toolCall Informações da chamada de ferramenta
   * @param context Contexto da solicitação
   */
  async executeToolCall(
    toolCall: ToolCallInfo,
    context: RequestContext,
  ): Promise<void> {
    try {
      const { toolName, params } = toolCall;

      logger.info(`Executing tool: ${toolName}`, {
        businessId: context.businessId,
        isAdmin: context.isAdmin,
        userId: context.userId,
        params: JSON.stringify(params),
      });

      // Verificar se a ferramenta existe
      const implementation = TOOL_IMPLEMENTATIONS[toolName];

      if (!implementation) {
        toolCall.error = `Tool not implemented: ${toolName}`;
        logger.error(`Tool not implemented: ${toolName}`, {
          businessId: context.businessId,
        });
        return;
      }

      // Verificar permissões
      if (toolName.startsWith("admin_") && !context.isAdmin) {
        toolCall.error = "Unauthorized: Admin permissions required";
        logger.warn(`Unauthorized tool access attempt: ${toolName}`, {
          businessId: context.businessId,
          userId: context.userId,
        });
        return;
      }

      // Preparar parâmetros de acordo com a ferramenta
      const toolParams = this.prepareToolParameters(toolName, params, context);

      console.log(
        JSON.stringify({ toolParams, toolName, params, context }, null, 2),
      );
      // Executar a ferramenta
      const response = await implementation(...toolParams);
      toolCall.response = response;

      logger.debug(`Tool execution completed: ${toolName}`, {
        businessId: context.businessId,
        success: !toolCall.error,
        responsePreview: JSON.stringify(response).substring(0, 100),
      });
    } catch (error) {
      logger.error(`Error executing tool: ${toolCall.toolName}`, {
        error: error instanceof Error ? error.message : String(error),
        businessId: context.businessId,
        params: toolCall.params,
      });

      toolCall.error =
        error instanceof Error
          ? error.message
          : "Unknown error during tool execution";
    }
  }

  /**
   * Mapeia um nome de ferramenta para outro se necessário
   * @param name Nome da ferramenta
   */
  mapToolName(name: string): string {
    // Se necessário, implementar mapeamentos de nomes alternativos aqui
    return name;
  }

  /**
   * Verifica se uma ferramenta está disponível para o perfil
   * @param name Nome da ferramenta
   * @param isAdmin Indica se é administrador
   */
  isToolAvailable(name: string, isAdmin: boolean): boolean {
    // Se for admin, todas as ferramentas estão disponíveis
    if (isAdmin) return true;

    // Usuários não-admin não podem acessar ferramentas de admin
    return !name.startsWith("admin_");
  }

  /**
   * Prepara os parâmetros para a chamada da ferramenta
   * @param toolName Nome da ferramenta
   * @param params Parâmetros brutos
   * @param context Contexto da solicitação
   */
  private prepareToolParameters(
    toolName: string,
    params: any,
    context: RequestContext,
  ): any[] {
    // Sempre incluir businessId como primeiro parâmetro
    const commonParams = [context.businessId];

    switch (toolName) {
      // Ferramentas que precisam do telefone do cliente
      case "createAppointment":
      case "listMyAppointments":
      case "cancelAppointment":
      case "rescheduleAppointment":
      case "requestHumanAgent":
        return [
          ...commonParams,
          context.payload.phone,
          ...this.extractParamsArray(params, toolName),
        ];

      // Ferramentas admin que precisam apenas do businessId
      case "admin_viewCurrentPrompt":
      case "admin_listServices":
      case "admin_listScheduleBlocks":
      case "admin_getStatistics":
      case "admin_listAppointments":
      case "admin_listCustomers":
        return [...commonParams, ...this.extractParamsArray(params, toolName)];

      // Todas as outras ferramentas
      default:
        return [...commonParams, ...this.extractParamsArray(params, toolName)];
    }
  }

  /**
   * Extrai os parâmetros na ordem correta para cada ferramenta
   * @param params Parâmetros brutos
   * @param toolName Nome da ferramenta
   */
  private extractParamsArray(params: any, toolName: string): any[] {
    // Definir a ordem dos parâmetros para cada ferramenta
    const paramOrders: Record<string, string[]> = {
      // Clientes
      checkAvailableDates: ["serviceName", "referenceMonth"],
      checkAvailableTimes: ["serviceName", "date"],
      createAppointment: ["serviceName", "date", "time"],
      cancelAppointment: ["appointmentDate", "appointmentTime", "serviceName"],
      rescheduleAppointment: [
        "originalDate",
        "originalTime",
        "newDate",
        "newTime",
        "serviceName",
      ],
      requestHumanAgent: ["reason"],

      // Admin
      admin_updatePrompt: ["newPrompt"],
      admin_configureRag: ["enable"],
      admin_addService: ["name", "durationMinutes", "price", "description"],
      admin_updateService: [
        "currentServiceName",
        "newName",
        "newDescription",
        "newDurationMinutes",
        "newPrice",
        "isActive",
      ],
      admin_updateBusinessHours: ["dayOfWeek", "startTime", "endTime"],
      admin_createScheduleBlock: ["title", "startTimeIso", "endTimeIso"],
      admin_deleteScheduleBlock: ["title", "startTimeIso"],
      admin_getStatistics: ["period"],
      admin_listAppointments: ["date", "status", "orderBy", "limit"],
      admin_listCustomers: ["searchTerm", "limit", "orderBy"],
      admin_viewCustomerDetails: ["customerPhone"],
      admin_updateCustomer: [
        "customerPhone",
        "newName",
        "newEmail",
        "newNotes",
        "addTags",
        "removeTags",
        "isBlocked",
      ],
    };

    // Se não houver ordem definida, retornar array vazio
    if (!paramOrders[toolName]) {
      return [];
    }

    // Extrair os parâmetros na ordem especificada
    return paramOrders[toolName].map((paramName) => {
      return params[paramName];
    });
  }
}
