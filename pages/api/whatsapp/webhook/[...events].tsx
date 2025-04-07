// pages/api/webhook/[...events].ts
import type { NextApiRequest, NextApiResponse } from "next";
import { sendTextMessage } from "@/lib/uazapiGoClient";
import { getCache, setCache } from "@/lib/redisClient";
import { getLLMResponse, buildPrompt } from "@/lib/googleAiClient";
import supabaseClient from "@/lib/supabaseClient";

/**
 * Handler do webhook do UAZAPI que captura todos os eventos
 *
 * Na fase inicial, apenas processamos mensagens de texto e respondemos com IA básica
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  try {
    // Verificar método
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    // Verificar token de verificação para segurança (opcional nesta fase)
    // const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    // const receivedToken = req.headers["x-api-key"] || req.query.verify_token;

    // if (verifyToken && receivedToken !== verifyToken) {
    //   console.error("Webhook verification failed");
    //   return res.status(401).json({ error: "Unauthorized" });
    // }

    // Extrair payload
    const payload = req.body;
    const eventType = req.query.events?.[0] || "unknown";

    console.log(
      `Webhook recebido (${eventType}):`,
      JSON.stringify(payload).substring(0, 200) + "...",
    );

    // Processar apenas eventos de mensagens de texto
    if (
      eventType === "messages" &&
      payload.message?.messageType === "Conversation"
    ) {
      try {
        // Extrair dados básicos da mensagem
        const { message, owner } = payload;

        // Ignorar mensagens enviadas pelo bot
        if (message.fromMe) {
          return res
            .status(200)
            .json({ status: "ignored", reason: "own message" });
        }

        // Extrair número do remetente
        const senderPhone = extractPhoneNumber(message.sender);
        const text = message.text || "";

        // Buscar negócio cadastrado no Supabase
        const { data: business, error } = await supabaseClient
          .from("businesses")
          .select("*")
          .eq("waba_number", owner)
          .single();

        if (error || !business) {
          console.error("Negócio não encontrado:", owner);
          return res
            .status(200)
            .json({ status: "ignored", reason: "business not found" });
        }

        // Processar mensagem em background para responder rapidamente ao webhook
        processMessage(business, senderPhone, text).catch((err) =>
          console.error("Erro ao processar mensagem:", err),
        );

        // Responder ao webhook imediatamente
        return res.status(200).json({ status: "processing" });
      } catch (error) {
        console.error("Erro ao processar webhook:", error);
        return res
          .status(200)
          .json({ status: "error", message: "Error processing webhook" });
      }
    }

    // Responder OK para outros tipos de eventos
    return res.status(200).json({ status: "received", type: eventType });
  } catch (error) {
    console.error("Erro no handler do webhook:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * Extrai o número de telefone do formato JID do WhatsApp
 */
function extractPhoneNumber(jid: string): string {
  if (!jid) return "";

  const match = jid.match(/(\d+)[@-]/);
  if (match && match[1]) {
    return match[1];
  }

  return jid.replace(/\D/g, "");
}

/**
 * Processa a mensagem e envia resposta
 */
async function processMessage(
  business: any,
  phone: string,
  text: string,
): Promise<void> {
  try {
    // Obter configuração do prompt base do negócio
    const config = business.config || {};
    const prompt =
      config.defaultPrompt ||
      "Você é um assistente virtual amigável e prestativo.";
    const businessName = business.name || "Empresa";
    const businessId = business.business_id;

    // Verificar se o usuário é admin (básico para fase inicial)
    const isAdmin = phone === business.admin_phone;

    // Obter histórico da conversa do Redis
    const sessionKey = `session:${businessId}:${phone}`;
    const cachedSession = await getCache<{
      history: { role: string; content: string; timestamp: number }[];
    }>(sessionKey);

    const history = cachedSession?.history || [];

    // Adicionar mensagem atual ao histórico
    history.push({
      role: "user",
      content: text,
      timestamp: Date.now(),
    });

    // Limitar o histórico a 10 mensagens (ou o valor configurado)
    const maxHistory = config.maxHistoryMessages || 10;
    const trimmedHistory = history.slice(-maxHistory);

    // Construir prompt para o LLM
    const fullPrompt = `${prompt}
    
    Você é o assistente virtual da ${businessName}.
    ${isAdmin ? "Você está conversando com um administrador do sistema." : "Você está conversando com um cliente."}`;

    // Formatar histórico para o prompt
    let contextText = "";
    if (trimmedHistory.length > 0) {
      contextText = "Histórico da conversa:\n";
      for (const msg of trimmedHistory) {
        const role = msg.role === "user" ? "Usuário" : "Assistente";
        contextText += `${role}: ${msg.content}\n`;
      }
    }

    // Obter resposta do LLM
    const apiKey = config.llmApiKey || process.env.GOOGLE_API_KEY || "";
    const response = await getLLMResponse(
      `${fullPrompt}\n\n${contextText}\n\nUsuário: ${text}\n\nAssistente:`,
      apiKey,
    );

    // Enviar resposta
    await sendTextMessage(businessId, phone, response);

    // Adicionar resposta ao histórico
    trimmedHistory.push({
      role: "bot",
      content: response,
      timestamp: Date.now(),
    });

    // Salvar histórico atualizado no Redis
    const ttl = config.sessionTtlHours || 2;
    await setCache(sessionKey, { history: trimmedHistory }, ttl * 3600);

    // Salvar mensagem no banco de dados (opcional nesta fase inicial)
    try {
      await supabaseClient.from("conversation_history").insert([
        {
          business_id: businessId,
          customer_id: null, // Será implementado posteriormente
          sender: "customer",
          content: text,
        },
        {
          business_id: businessId,
          customer_id: null, // Será implementado posteriormente
          sender: "bot",
          content: response,
        },
      ]);
    } catch (dbError) {
      console.error("Erro ao salvar conversa no banco:", dbError);
      // Continuar mesmo se houver erro no banco
    }
  } catch (error) {
    console.error("Erro ao processar mensagem:", error);

    // Tentar enviar mensagem de erro
    try {
      await sendTextMessage(
        business.business_id,
        phone,
        "Desculpe, tive um problema ao processar sua mensagem. Por favor, tente novamente em instantes.",
      );
    } catch (sendError) {
      console.error("Erro ao enviar mensagem de falha:", sendError);
    }
  }
}

// Desabilitar o bodyParser padrão do Next.js para permitir o acesso ao corpo bruto
export const config = {
  api: {
    bodyParser: true,
  },
};
