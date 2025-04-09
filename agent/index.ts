// agent/index.ts
import { UazapiGoPayload } from "@/types";
import { RequestContext, AgentResponse, AgentInitParams } from "./types";
import { GeminiAdapter, ConversationProcessor } from "./processor";
import { DefaultToolProvider, DefaultToolExecutor } from "./tools";
import logger from "@/lib/logger";
import { getBusinessConfig } from "@/lib/utils";
import { sendTextMessage, sendTypingStatus } from "@/lib/uazapiGoClient";

/**
 * Agente principal que processa mensagens e coordena respostas
 */
export class RecepcionistaAgent {
  private processor: ConversationProcessor;
  private initialized: boolean = false;

  /**
   * Inicializa o agente com configurações padrão
   */
  constructor() {
    // Criar instâncias dos componentes necessários
    const toolProvider = new DefaultToolProvider();
    const modelAdapter = new GeminiAdapter(toolProvider);
    const toolExecutor = new DefaultToolExecutor();

    // Criar o processador
    this.processor = new ConversationProcessor(modelAdapter, toolExecutor);
  }

  /**
   * Inicializa o agente com as chaves de API
   * @param params Parâmetros de inicialização
   */
  async init(params: AgentInitParams): Promise<void> {
    try {
      // Inicializar o adaptador do modelo
      const toolProvider = new DefaultToolProvider();
      const modelAdapter = new GeminiAdapter(toolProvider);
      await modelAdapter.init(params);

      // Recriar o processador com o modelo inicializado
      const toolExecutor = new DefaultToolExecutor();
      this.processor = new ConversationProcessor(modelAdapter, toolExecutor);

      this.initialized = true;

      logger.info("Agent initialized successfully", {
        model: params.modelName || "gemini-1.5-flash-latest",
      });
    } catch (error) {
      logger.error("Failed to initialize agent", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Processa uma mensagem recebida do WhatsApp
   * @param payload Payload da mensagem do WhatsApp
   */
  async processMessage(payload: UazapiGoPayload): Promise<void> {
    try {
      // Verificar se o agente está inicializado
      if (!this.initialized) {
        throw new Error("Agent not initialized. Call init() first.");
      }

      const { phone, text, metadata } = payload;
      const businessId = metadata.business_id;

      if (!businessId) {
        logger.error("Missing business_id in payload", { phone });
        return;
      }

      // Log da mensagem recebida
      logger.info("Processing incoming message", {
        businessId,
        phone,
        isAdmin: metadata.is_admin,
        messagePreview: text.substring(0, 50) + (text.length > 50 ? "..." : ""),
      });

      // Obter a configuração do negócio para personalização
      const businessConfig = await getBusinessConfig(businessId);
      if (!businessConfig) {
        logger.error("Business configuration not found", { businessId });
        return;
      }

      // Preparar o contexto da solicitação
      const context: RequestContext = {
        message: text,
        payload,
        businessId,
        isAdmin: !!metadata.is_admin,
        userId: metadata.is_admin
          ? metadata.admin_id || phone
          : metadata.customer_id || phone,
      };

      // Simular digitação para uma experiência mais natural
      await sendTypingStatus(
        businessId,
        phone,
        2000 + Math.floor(Math.random() * 2000),
      );

      // Processar a mensagem
      const response = await this.processor.processUserMessage(context);

      console.log(
        JSON.stringify({ context, businessConfig, payload, response }, null, 2),
      );
      // Enviar a resposta
      await sendTextMessage(businessId, phone, response.text);

      // Se há necessidade de follow-up (ferramentas foram chamadas), processar novamente
      if (response.followupRequired && response.toolCalls?.length) {
        logger.debug("Follow-up required, processing again", {
          businessId,
          phone,
          toolCalls: response.toolCalls.map((tc) => tc.toolName).join(", "),
        });

        // Simular digitação novamente
        await sendTypingStatus(
          businessId,
          phone,
          1500 + Math.floor(Math.random() * 1500),
        );

        // Contexto para continuação (sem a mensagem original do usuário)
        const followupContext: RequestContext = {
          ...context,
          message: "",
          isContinuation: true,
        };

        const followupResponse =
          await this.processor.processUserMessage(followupContext);

        // Enviar a resposta de follow-up
        if (followupResponse.text) {
          await sendTextMessage(businessId, phone, followupResponse.text);
        }
      }

      logger.info("Message processed successfully", {
        businessId,
        phone,
        responseLength: response.text.length,
      });
    } catch (error) {
      logger.error("Error processing message", {
        error: error instanceof Error ? error.message : String(error),
        phone: payload.phone,
        businessId: payload.metadata.business_id,
      });

      // Tentar enviar mensagem de erro amigável
      try {
        await sendTextMessage(
          payload.metadata.business_id || "",
          payload.phone,
          "Desculpe, estou enfrentando algumas dificuldades técnicas. " +
            "Por favor, tente novamente em alguns instantes ou entre em contato " +
            "diretamente com o estabelecimento.",
        );
      } catch (sendError) {
        logger.error("Failed to send error message", {
          error:
            sendError instanceof Error ? sendError.message : String(sendError),
        });
      }
    }
  }
}

/**
 * Instância singleton do agente
 */
export const agent = new RecepcionistaAgent();

/**
 * Inicializa o agente com configurações do ambiente
 */
export async function initializeAgent(): Promise<void> {
  const googleApiKey = process.env.GOOGLE_API_KEY;

  if (!googleApiKey) {
    throw new Error("Missing GOOGLE_API_KEY environment variable");
  }

  await agent.init({
    apiKey: googleApiKey,
    modelName: "gemini-1.5-flash-latest",
    temperature: 0.7,
    topP: 0.95,
    maxOutputTokens: 4096,
  });

  logger.info("Receptionist agent initialized successfully");
}
