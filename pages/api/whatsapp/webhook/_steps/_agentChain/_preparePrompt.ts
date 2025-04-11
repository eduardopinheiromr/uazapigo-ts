// pages/api/whatsapp/webhook/_steps/_agentChain/_preparePrompt.ts

import { NodeInput, NodeOutput } from "./_types";
import { injectPromptCurrentDate } from "../../_utils";
import { basePrompt } from "./_basePrompt";

export const _preparePrompt = async (input: NodeInput): Promise<NodeOutput> => {
  const { session } = input;

  // Preparando o prompt base
  const currentPrompt =
    basePrompt +
    `
    ## Formato de Resposta
    Você DEVE responder no seguinte formato JSON:
    {
      "resposta": "O texto completo da resposta para o cliente",
      "meta": {
        "intencao_detectada": "agendamento | cancelamento | reagendamento | consulta_horarios | saudacao | outro",
        "horarios_mencionados": ["14:00", "15:30"],
        "horarios_agendados": ["14:00"],
        "servicos_mencionados": ["Corte de Cabelo"],
        "data_referencia": "2025-04-10",
        "confianca": 0.95
      }
    }
      
    IMPORTANTE: O texto dentro do campo "resposta" será enviado diretamente ao cliente no WhatsApp. Os metadados serão usados apenas internamente. Mantenha o JSON válido.
    ` +
    injectPromptCurrentDate() +
    `\n\n# Histórico de mensagens\n` +
    `${JSON.stringify(session.conversation_history)}\n\n` +
    `# Você deve responder a última mensagem, mantendo a fluidez da conversa\n`;

  // Passar para o próximo passo
  return {
    ...input,
    prompt: currentPrompt,
  };
};
