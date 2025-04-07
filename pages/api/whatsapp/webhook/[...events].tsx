// pages/api/webhook/[...events].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { handleIncomingMessage } from "@/lib/coreLogic";
import { processWebhookPayload } from "@/lib/uazapiAdapter";
import logger from "@/lib/logger";

/**
 * Handler do webhook do UAZAPI que captura todos os eventos
 *
 * Processa mensagens e as encaminha para o core logic adequado
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  try {
    // Verificar método
    if (req.method !== "POST") {
      logger.warn("Method not allowed", { method: req.method });
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Verificar token de verificação para segurança
    // const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    // const receivedToken = req.headers["x-api-key"] || req.query.verify_token;

    // if (verifyToken && receivedToken !== verifyToken) {
    //   logger.error("Webhook verification failed", {
    //     receivedToken: receivedToken?.toString().substring(0, 10) + "...",
    //   });
    //   return res.status(401).json({ error: "Unauthorized" });
    // }

    // Extrair payload
    const payload = req.body;
    const eventType = Array.isArray(req.query.events)
      ? req.query.events[0]
      : req.query.events || "unknown";

    logger.info(`Webhook received (${eventType})`, {
      payloadExcerpt: JSON.stringify(payload).substring(0, 200) + "...",
    });

    // Processar apenas eventos de mensagens
    if (eventType === "messages") {
      try {
        // Verificar se temos uma mensagem válida
        if (!payload.message) {
          logger.warn("Invalid message payload", { payload });
          return res.status(400).json({ error: "Invalid message payload" });
        }

        // Ignorar mensagens enviadas pelo bot
        if (payload.message.fromMe) {
          logger.debug("Ignoring own message", {
            sender: payload.message.sender,
          });
          return res
            .status(200)
            .json({ status: "ignored", reason: "own message" });
        }

        // Processar o payload e convertê-lo para o formato padronizado
        const processedPayload = await processWebhookPayload(payload);

        // Verificar se o formato da mensagem é suportado
        const isSupportedMessage =
          processedPayload.messageType === "text" ||
          processedPayload.messageType === "image" ||
          processedPayload.messageType === "document" ||
          processedPayload.messageType === "audio";

        // Responder imediatamente ao webhook para evitar timeout
        res.status(200).json({ status: "processing" });

        // Verificar se o businessId está disponível
        if (!processedPayload.metadata.business_id) {
          logger.error("Business ID not found", {
            instanceOwner: processedPayload.metadata.instanceOwner,
            phone: processedPayload.phone,
          });
          return;
        }

        // Verificar se é uma mensagem de grupo
        if (processedPayload.isGroup) {
          logger.debug("Ignoring group message", {
            phone: processedPayload.phone,
            businessId: processedPayload.metadata.business_id,
          });
          return;
        }

        // Processar apenas mensagens suportadas
        if (isSupportedMessage) {
          // Processar mensagem em background
          handleIncomingMessage(processedPayload).catch((err) => {
            logger.error("Error handling message", {
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
              phone: processedPayload.phone,
              businessId: processedPayload.metadata.business_id,
            });
          });
        } else {
          logger.info("Unsupported message type", {
            type: processedPayload.messageType,
            phone: processedPayload.phone,
            businessId: processedPayload.metadata.business_id,
          });
        }

        return;
      } catch (error) {
        logger.error("Error processing webhook", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });

        // Já respondemos 200 antes, então não precisamos responder novamente
        return;
      }
    } else if (eventType === "status") {
      // Processar eventos de status (online, offline, etc.)
      logger.info("Status event received", {
        status: payload.status?.status,
        instance: payload.status?.id,
      });

      return res.status(200).json({ status: "received", type: "status" });
    }

    // Responder OK para outros tipos de eventos
    logger.info(`Unhandled event type: ${eventType}`);
    return res.status(200).json({ status: "received", type: eventType });
  } catch (error) {
    logger.error("Error in webhook handler", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return res.status(500).json({ error: "Internal server error" });
  }
}

// Configuração da API
export const config = {
  api: {
    bodyParser: true,
  },
};
