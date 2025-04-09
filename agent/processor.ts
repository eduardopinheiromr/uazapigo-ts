// agent/processor.ts
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerativeModel,
  GenerateContentResult,
  FunctionCallingConfig,
  Part,
  FunctionCallingMode,
} from "@google/generative-ai";
import {
  AgentInitParams,
  AgentResponse,
  ConversationContext,
  ModelAdapter,
  RequestContext,
  ToolCallInfo,
  ToolExecutor,
  ToolProvider,
} from "./types";
import logger from "@/lib/logger";
import { getCache, setCache } from "@/lib/redisClient";
import { getRagContext } from "@/lib/rag";
import { getBusinessConfig } from "@/lib/utils";

/**
 * Adaptador para o modelo Gemini
 */
export class GeminiAdapter implements ModelAdapter {
  private model: GenerativeModel | null = null;
  private apiKey: string = "";
  private modelName: string = "gemini-1.5-flash-latest";
  private maxOutputTokens: number = 2048;
  private temperature: number = 0.7;
  private topP: number = 0.8;
  private topK: number = 40;
  private toolProvider: ToolProvider;

  constructor(toolProvider: ToolProvider) {
    this.toolProvider = toolProvider;
  }

  /**
   * Inicializa o modelo
   * @param params Parâmetros de inicialização
   */
  async init(params: AgentInitParams): Promise<void> {
    this.apiKey = params.apiKey;
    this.modelName = params.modelName || this.modelName;
    this.maxOutputTokens = params.maxOutputTokens || this.maxOutputTokens;
    this.temperature = params.temperature || this.temperature;
    this.topP = params.topP || this.topP;
    this.topK = params.topK || this.topK;

    try {
      const genAI = new GoogleGenerativeAI(this.apiKey);

      this.model = genAI.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          maxOutputTokens: this.maxOutputTokens,
          temperature: this.temperature,
          topP: this.topP,
          topK: this.topK,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
          },
        ],
      });

      logger.info("Gemini model initialized", {
        model: this.modelName,
        temperature: this.temperature,
      });
    } catch (error) {
      logger.error("Error initializing Gemini model", {
        error: error instanceof Error ? error.message : String(error),
        model: this.modelName,
      });
      throw error;
    }
  }

  /**
   * Processa uma mensagem do usuário
   * @param context Contexto da solicitação
   * @param conversationContext Contexto da conversa
   */
  async processMessage(
    context: RequestContext,
    conversationContext: ConversationContext,
  ): Promise<AgentResponse> {
    try {
      if (!this.model) {
        throw new Error("Model not initialized");
      }

      // Buscar configuração do negócio para obter prompt personalizado
      const businessConfig = await getBusinessConfig(context.businessId);
      if (!businessConfig) {
        throw new Error(
          `Business configuration not found for ${context.businessId}`,
        );
      }

      // Preparar o contexto de ferramentas
      const functionCallingConfig: FunctionCallingConfig = {
        mode: FunctionCallingMode.ANY,
        allowedFunctionNames: this.toolProvider
          .getAvailableTools(context.isAdmin)
          .map((tool) => tool.name),
      };

      // Preparar o conteúdo para o chat
      const parts: Part[] = [];

      // Adicionar o sistema de prompt personalizado
      parts.push({
        text:
          businessConfig.defaultPrompt ||
          "Você é um assistente virtual amigável e prestativo.",
      });

      // Adicionar contexto RAG se habilitado
      if (businessConfig.ragEnabled) {
        try {
          const ragContext = await getRagContext(
            context.message,
            context.businessId,
          );
          if (ragContext) {
            parts.push({
              text: `\n\nInformações relevantes do estabelecimento:\n${ragContext}`,
            });
          }
        } catch (ragError) {
          logger.warn("Error fetching RAG context", {
            error:
              ragError instanceof Error ? ragError.message : String(ragError),
            businessId: context.businessId,
          });
          // Continuar sem RAG se houver erro
        }
      }

      // Adicionar histórico de mensagens (limitado às últimas 10)
      for (const message of conversationContext.messages.slice(-10)) {
        if (message.role === "user" && message.content) {
          parts.push({ text: `Usuário: ${message.content}` });
        } else if (message.role === "assistant" && message.content) {
          parts.push({ text: `Assistente: ${message.content}` });
        } else if (message.role === "tool" && message.toolCall) {
          const { toolName, params, response, error } = message.toolCall;

          if (error) {
            parts.push({
              text: `Resultado da ferramenta ${toolName}: Erro - ${error}`,
            });
          } else {
            parts.push({
              text: `Resultado da ferramenta ${toolName}: ${JSON.stringify(response)}`,
            });
          }
        }
      }

      // Adicionar a mensagem atual do usuário
      parts.push({ text: `Usuário: ${context.message}` });
      parts.push({ text: "Assistente: " });

      console.log(JSON.stringify({ parts }, null, 2));
      // Gerar resposta
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: {
          maxOutputTokens: this.maxOutputTokens,
          temperature: this.temperature,
          topP: this.topP,
          topK: this.topK,
        },

        toolConfig: {
          functionCallingConfig,
        },
        tools: [
          {
            functionDeclarations: this.toolProvider.getAvailableTools(
              context.isAdmin,
            ),
          },
        ],
        // functionCallingConfig,
      });

      // Extrair resposta e chamadas de ferramenta
      const responseText = result.response.text();
      const toolCalls = this.extractToolCalls(result);

      logger.debug("Model response generated", {
        businessId: context.businessId,
        textLength: responseText.length,
        toolCalls: toolCalls.length,
      });

      return {
        text: responseText,
        toolCalls,
        followupRequired: toolCalls.length > 0,
      };
    } catch (error) {
      logger.error("Error processing message with Gemini", {
        error: error instanceof Error ? error.message : String(error),
        businessId: context.businessId,
        message:
          context.message.substring(0, 100) +
          (context.message.length > 100 ? "..." : ""),
      });

      return {
        text: "Desculpe, estou enfrentando dificuldades técnicas no momento. Por favor, tente novamente em alguns instantes.",
        followupRequired: false,
      };
    }
  }

  /**
   * Extrai chamadas de ferramentas da resposta do modelo
   * @param response Resultado da geração
   */
  extractToolCalls(response: GenerateContentResult): ToolCallInfo[] {
    const functionCalls = response.response.functionCalls() || [];

    return functionCalls.map((call) => {
      let params: any = {};

      try {
        params = JSON.parse(JSON.stringify(call.args || "{}"));
      } catch (error) {
        // Em caso de erro no parsing, usar objeto vazio
        logger.warn("Error parsing tool params", {
          error: error instanceof Error ? error.message : String(error),
          toolName: call.name,
        });
      }

      return {
        toolName: call.name,
        params,
      };
    });
  }

  /**
   * Formata a resposta de uma ferramenta para o modelo
   * @param toolCall Informações da chamada de ferramenta
   */
  formatToolResponse(toolCall: ToolCallInfo): any {
    return {
      name: toolCall.toolName,
      response: toolCall.response,
      error: toolCall.error,
    };
  }
}

/**
 * Processador que coordena a interação com o modelo e execução de ferramentas
 */
export class ConversationProcessor {
  private modelAdapter: ModelAdapter;
  private toolExecutor: ToolExecutor;
  private contextTtl: number = 3600; // 1 hora

  constructor(modelAdapter: ModelAdapter, toolExecutor: ToolExecutor) {
    this.modelAdapter = modelAdapter;
    this.toolExecutor = toolExecutor;
  }

  /**
   * Processa uma mensagem do usuário
   * @param context Contexto da solicitação
   */
  async processUserMessage(context: RequestContext): Promise<AgentResponse> {
    // Carregar ou criar contexto de conversa
    const conversationContext = await this.loadConversationContext(context);

    // Adicionar mensagem do usuário ao contexto
    conversationContext.messages.push({
      role: "user",
      content: context.message,
    });

    // Obter resposta do modelo
    const response = await this.modelAdapter.processMessage(
      context,
      conversationContext,
    );

    console.log(
      JSON.stringify({ context, conversationContext, response }, null, 2),
    );

    // Se há chamadas de ferramenta, executá-las
    if (response.toolCalls && response.toolCalls.length > 0) {
      conversationContext.pendingToolCalls = response.toolCalls;

      // Executar ferramentas
      for (const toolCall of response.toolCalls) {
        await this.toolExecutor.executeToolCall(toolCall, context);

        // Adicionar resultado ao histórico
        conversationContext.messages.push({
          role: "tool",
          toolCall,
        });

        // Adicionar ao histórico de chamadas
        conversationContext.previousToolCalls.push(toolCall);
      }

      // Limpar chamadas pendentes
      conversationContext.pendingToolCalls = [];
    }

    // Adicionar resposta do assistente ao contexto
    conversationContext.messages.push({
      role: "assistant",
      content: response.text,
    });

    // Salvar contexto atualizado
    await this.saveConversationContext(context, conversationContext);

    return response;
  }

  /**
   * Carrega o contexto da conversa
   * @param context Contexto da solicitação
   */
  private async loadConversationContext(
    context: RequestContext,
  ): Promise<ConversationContext> {
    const cacheKey = `conversation:${context.businessId}:${context.payload.phone}`;
    const cached = await getCache<ConversationContext>(cacheKey);

    if (cached) {
      logger.debug("Loaded conversation context from cache", {
        businessId: context.businessId,
        userPhone: context.payload.phone,
        messagesCount: cached.messages.length,
      });
      return cached;
    }

    logger.debug("Creating new conversation context", {
      businessId: context.businessId,
      userPhone: context.payload.phone,
    });

    return {
      businessId: context.businessId,
      userId: context.userId || context.payload.phone,
      isAdmin: context.isAdmin,
      messages: [],
      previousToolCalls: [],
      pendingToolCalls: [],
    };
  }

  /**
   * Salva o contexto da conversa
   * @param context Contexto da solicitação
   * @param conversationContext Contexto da conversa
   */
  private async saveConversationContext(
    context: RequestContext,
    conversationContext: ConversationContext,
  ): Promise<void> {
    const cacheKey = `conversation:${context.businessId}:${context.payload.phone}`;

    // Limitar o tamanho do histórico para evitar contextos muito grandes
    if (conversationContext.messages.length > 20) {
      conversationContext.messages = conversationContext.messages.slice(-20);
    }

    if (conversationContext.previousToolCalls.length > 10) {
      conversationContext.previousToolCalls =
        conversationContext.previousToolCalls.slice(-10);
    }

    await setCache(cacheKey, conversationContext, this.contextTtl);

    logger.debug("Saved conversation context to cache", {
      businessId: context.businessId,
      userPhone: context.payload.phone,
      messagesCount: conversationContext.messages.length,
    });
  }
}
