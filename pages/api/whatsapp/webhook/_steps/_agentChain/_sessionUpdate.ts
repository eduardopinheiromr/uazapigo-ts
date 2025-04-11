// pages/api/whatsapp/webhook/_steps/_agentChain/_sessionUpdate.ts

import { NodeInput, NodeOutput } from "./_types";
import { saveSession } from "@/lib/utils";

export const _sessionUpdate = async (input: NodeInput): Promise<NodeOutput> => {
  const { session, responseText, meta, businessId, userPhone } = input;

  // Atualizar o histórico da conversa
  session.conversation_history.push({
    role: "model",
    content: responseText,
    timestamp: Date.now(),
    _meta: meta, // Salvar metadados para análise
  });

  // Salvar a sessão atualizada
  await saveSession(businessId, userPhone, session);

  // Retornar o output final
  return input;
};
