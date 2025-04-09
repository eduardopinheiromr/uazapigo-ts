// agent/types.ts
import {
  FunctionDeclaration,
  GenerateContentResult,
} from "@google/generative-ai";
import { UazapiGoPayload } from "@/types";

/**
 * Contexto da solicitação do usuário
 */
export interface RequestContext {
  message: string;
  payload: UazapiGoPayload;
  businessId: string;
  isAdmin: boolean;
  userId?: string;
  isContinuation?: boolean;
}

/**
 * Resposta do agente
 */
export interface AgentResponse {
  text: string;
  followupRequired: boolean;
  toolCalls?: ToolCallInfo[];
}

/**
 * Parâmetros para inicialização do agente
 */
export interface AgentInitParams {
  apiKey: string;
  modelName?: string;
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

/**
 * Informações sobre chamada de ferramenta
 */
export interface ToolCallInfo {
  toolName: string;
  params: any;
  response?: any;
  error?: string;
}

/**
 * Estado da conversa para context tracking
 */
export interface ConversationContext {
  businessId: string;
  userId: string;
  isAdmin: boolean;
  messages: {
    role: "user" | "assistant" | "tool";
    content?: string;
    toolCall?: ToolCallInfo;
  }[];
  previousToolCalls: ToolCallInfo[];
  pendingToolCalls: ToolCallInfo[];
}

/**
 * Interface para adaptadores de modelo
 */
export interface ModelAdapter {
  init(params: AgentInitParams): Promise<void>;
  processMessage(
    context: RequestContext,
    conversationContext: ConversationContext,
  ): Promise<AgentResponse>;
  extractToolCalls(response: GenerateContentResult): ToolCallInfo[];
  formatToolResponse(toolCall: ToolCallInfo): any;
}

/**
 * Interface para execução de ferramentas
 */
export interface ToolExecutor {
  executeToolCall(
    toolCall: ToolCallInfo,
    context: RequestContext,
  ): Promise<void>;
  mapToolName(name: string): string;
  isToolAvailable(name: string, isAdmin: boolean): boolean;
}

/**
 * Interface para seleção de ferramentas
 */
export interface ToolProvider {
  getAvailableTools(isAdmin: boolean): FunctionDeclaration[];
}
