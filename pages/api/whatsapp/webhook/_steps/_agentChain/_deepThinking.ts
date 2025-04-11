// pages/api/whatsapp/webhook/_steps/_agentChain/_deepThinking.ts

import { NodeInput, NodeOutput } from "./_types";
import { _model } from "./_model";
import logger from "@/lib/logger";

export const _deepThinking = async (input: NodeInput): Promise<NodeOutput> => {
  const { prompt, businessId, userPhone, session } = input;

  // Extrair a última mensagem do usuário para focar nossa análise
  const lastUserMessage =
    session.conversation_history.filter((msg) => msg.role === "user").pop()
      ?.content || "";

  // Prompt específico para análise profunda
  const thinkingPrompt = `
    # Análise profunda de intenção do usuário
    
    ## Última mensagem do usuário:
    "${lastUserMessage}"
    
    ## Histórico relevante:
    ${JSON.stringify(session.conversation_history.slice(-5))}
    
    ## Instruções de análise:
    1. Identifique exatamente o que o usuário está pedindo (agendamento, cancelamento, reagendamento, consulta, etc)
    2. Verifique se o usuário está solicitando MÚLTIPLAS AÇÕES em uma única mensagem
    3. Se menciona múltiplos serviços, horários ou datas, detalhe cada um separadamente
    4. Se for um agendamento, liste todos os serviços mencionados e seus respectivos horários
    5. Indique se será necessário chamar múltiplas ferramentas ou a mesma ferramenta várias vezes
    
    ## Analise detalhadamente possibilidades como:
    - Agendamento de serviços diferentes em horários diferentes (mesmo dia ou dias diferentes)
    - Agendamento do mesmo serviço em múltiplos horários ou dias
    - Solicitação ambígua que pode ter múltiplas interpretações
    
    ## Responda no formato abaixo:
    - Tipo de solicitação: [agendamento/cancelamento/reagendamento/consulta/outro]
    - Múltiplas ações: [sim/não]
    - Ações identificadas:
      1. [Descreva a primeira ação e seus parâmetros]
      2. [Descreva a segunda ação, se houver]
    - Ambiguidades encontradas: [liste possíveis ambiguidades]
    - Ferramentas necessárias: [liste as ferramentas que serão necessárias]
    - Parâmetros para cada ferramenta: [detalhe os parâmetros para cada ferramenta]
  `;

  const model = _model();

  try {
    logger.debug("Iniciando deep thinking", { businessId, userPhone });

    const thinkingResult = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: thinkingPrompt }] }],
      generationConfig: {
        temperature: 0, // Queremos uma análise determinística e lógica
      },
    });

    const analysis = thinkingResult.response.text();

    logger.debug("Análise de deep thinking completa", {
      businessId,
      userPhone,
      analysisLength: analysis.length,
    });

    // Adicionar a análise ao prompt original como contexto adicional
    const enhancedPrompt =
      prompt +
      `
    
    # ANÁLISE PRELIMINAR (USE COMO REFERÊNCIA)
    ${analysis}
    
    # INSTRUÇÕES CRÍTICAS PARA FERRAMENTAS:
    - Se identificou múltiplas ações na análise acima, você DEVE chamar as ferramentas separadamente para cada ação
    - Para múltiplos agendamentos em um mesmo dia, NÃO use o serviço combinado, use serviços separados
    - Verifique cuidadosamente os parâmetros de cada chamada de ferramenta
    - Se houver qualquer ambiguidade, pergunte ao usuário para esclarecimento antes de executar ações
    `;

    const result = {
      ...input,
      prompt: enhancedPrompt,
      deepThinking: analysis,
    };

    console.log(JSON.stringify(result, null, 2));

    return result;
  } catch (error) {
    logger.warn("Erro durante deep thinking, continuando sem análise", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    // Se falhar, continuamos com o prompt original
    return input;
  }
};
