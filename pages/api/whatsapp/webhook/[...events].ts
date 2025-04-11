// pages/api/whatsapp/webhook/[...events].ts
import type { NextApiRequest, NextApiResponse } from "next";
import type { MessagePayload } from "@/types";

import { supportedWebhooks } from "./_constants";

import logger from "@/lib/logger";

import { _adminFlow } from "./_steps/_adminFlow";
import { _recoverUserSession } from "./_steps/_recoverUserSession";
import { _agentChain } from "./_steps/_agentChain";

import { sendTextMessage } from "@/lib/uazapiGoClient";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<void> {
  try {
    const isAdmin = false;
    const webhookPath = req.url.split("/webhook")[1];

    if (!supportedWebhooks.includes(webhookPath || "")) {
      return res.send(204);
    }

    if (req.method !== "POST") {
      logger.warn("Method not allowed", { method: req.method });
      return res.status(405).json({ error: "Method not allowed" });
    }

    const payload = req.body as MessagePayload;

    // step 1 - _adminFlow
    console.log(payload);

    res.status(200).json({ status: "processing" });

    if (payload.message.fromMe) {
      await _adminFlow(req, res);
      return;
    }
    // _recoverUserSession: recuperar a sessão do usuário que mandou a mensagem
    const { businessId, userPhone, session } =
      await _recoverUserSession(payload);

    // _agentChain: executar o fluxo de conversação
    const { responseText, meta } = await _agentChain({
      session,
      payload,
      businessId,
      userPhone,
      isAdmin,
    });

    // responde o usuário
    await sendTextMessage(businessId, userPhone, responseText); //validatedResponseText);

    // Registrar métricas (opcional)
    if (meta && meta.intencao_detectada) {
      logger.info(`Intenção detectada: ${meta.intencao_detectada}`, {
        businessId,
        userPhone,
        confianca: meta.confianca,
      });
    }
  } catch (error) {
    logger.error("Error in webhook handler", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Se ainda não respondeu, retornar erro
    if (!res.writableEnded) {
      return res.status(500).json({ error: "Internal server error" });
    }
  }
}

export const config = {
  api: {
    bodyParser: true,
  },
};
