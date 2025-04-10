// pages/api/whatsapp/webhook/[...events].ts
import type { NextApiRequest, NextApiResponse } from "next";
import logger from "@/lib/logger";
import { getSession, saveSession } from "@/lib/utils";
import { MessagePayload } from "@/types";
import { businessIdMap, sendTextMessage } from "@/lib/uazapiGoClient";
import {
  FunctionCallingConfig,
  FunctionCallingMode,
  FunctionDeclaration,
  GoogleGenerativeAI,
} from "@google/generative-ai";
import { availableTools } from "@/tools/definition";
import { listServices } from "@/services/service";
import {
  cancelAppointment,
  checkAvailableDates,
  checkAvailableTimes,
  createAppointment,
  listMyAppointments,
  rescheduleAppointment,
} from "@/services/appointment";
import { getBusinessHours, getBusinessInfo } from "@/services/business";
import { requestHumanAgent } from "@/services/interaction";
import { modelName, supportedWebhooks } from "./_constants";
import { injectPromptCurrentDate } from "./_utils";
import { processLLMResponse } from "./_processLLMResponse";

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

    if (payload.message.fromMe) {
      logger.debug("Ignoring own message", {
        chatId: payload.message.chatid,
      });
      return res.status(200).json({ status: "ignored", reason: "own message" });
    }

    console.log(payload);

    res.status(200).json({ status: "processing" });

    // passo 1 - recuperar a sessão do usuário que mandou a mensagem
    const { businessId, baseUrl } = businessIdMap[payload.token];
    const userPhone = payload.message.sender.split("@")[0];
    const session = await getSession(businessId, userPhone);

    session.conversation_history.push({
      role: "user",
      content: payload.message.text,
      timestamp: Date.now(),
    });

    // passo 2 - inserir o histórico no prompt base
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

    // passo 3 - gerar a resposta
    console.log(currentPrompt);
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({
      model: modelName,
    });

    const getAvailableTools = (isAdmin: boolean): FunctionDeclaration[] => {
      return availableTools.filter((tool) => {
        // Se for admin, todas as ferramentas estão disponíveis
        if (isAdmin) return true;

        // Se não for admin, apenas ferramentas não-admin estão disponíveis
        return !tool.name.startsWith("admin_");
      });
    };

    const functionCallingConfig: FunctionCallingConfig = {
      mode: FunctionCallingMode.ANY,
      allowedFunctionNames: getAvailableTools(isAdmin).map((tool) => tool.name),
    };

    const result = await model.generateContent({
      toolConfig: {
        functionCallingConfig,
      },
      systemInstruction: basePrompt,
      contents: session.conversation_history.map((message) => ({
        role: message.role,
        parts: [{ text: message.content }],
      })),

      generationConfig: {
        temperature: 0,
      },
      tools: [
        {
          functionDeclarations: getAvailableTools(isAdmin),
        },
      ],
    });

    // Processamento de chamadas de ferramentas
    let finalResponseText = "";
    let currentResult = result;
    let toolExecutionCount = 0;
    const MAX_TOOL_EXECUTIONS = 10; // Limite de segurança para evitar loops infinitos

    async function processToolCalls() {
      // Extrair e processar chamadas de ferramentas, se houver
      const toolCalls =
        currentResult.response.candidates?.[0]?.content?.parts?.find(
          (part) => part.functionCall,
        );

      if (!toolCalls || toolExecutionCount >= MAX_TOOL_EXECUTIONS) {
        // Se não houver chamadas de ferramentas ou atingimos o limite, use o texto da resposta
        const finalContent = currentResult.response.text();

        // Verificar se a resposta está em formato JSON
        // Se não estiver, adicionar instruções para formatar como JSON
        if (
          !finalContent.includes('"resposta":') &&
          !finalContent.includes('"meta":')
        ) {
          // A resposta não está formatada como JSON, forçar reformatação
          const formattingPrompt = `
            Por favor, reformate a seguinte resposta para o formato JSON solicitado:
            {
              "resposta": "O texto da resposta para o cliente",
              "meta": {
                "intencao_detectada": "categoria_apropriada",
                "horarios_mencionados": [],
                "horarios_agendados": [],
                "servicos_mencionados": [],
                "data_referencia": "",
                "confianca": 0.9
              }
            }
            
            Resposta a reformatar:
            ${finalContent}
            
            Certifique-se de manter todo o conteúdo da resposta original no campo "resposta".
          `;

          try {
            const reformatResult =
              await model.generateContent(formattingPrompt);
            return reformatResult.response.text();
          } catch (error) {
            logger.warn("Erro ao reformatar resposta como JSON", {
              error: error instanceof Error ? error.message : String(error),
              businessId,
              userPhone,
            });

            // Fallback: criar JSON manualmente
            return JSON.stringify({
              resposta: finalContent,
              meta: {
                intencao_detectada: "desconhecida",
                horarios_mencionados: [],
                horarios_agendados: [],
                servicos_mencionados: [],
                data_referencia: "",
                confianca: 0.5,
              },
            });
          }
        }

        return finalContent;
      }

      // Incrementar contador para evitar loops infinitos
      toolExecutionCount++;

      // Extrair detalhes da chamada de ferramenta
      const functionCall = toolCalls.functionCall;
      const toolName = functionCall.name;
      const toolArgs: any = functionCall.args || {};

      logger.info(`Executing tool: ${toolName}`, {
        businessId,
        userPhone,
        args: toolArgs,
      });

      // Executar a ferramenta solicitada
      let toolResult;
      try {
        switch (toolName) {
          case "listServices":
            toolResult = await listServices(businessId);
            break;
          case "checkAvailableDates":
            toolResult = await checkAvailableDates(
              businessId,
              toolArgs.serviceName,
              toolArgs.referenceMonth,
            );
            break;
          case "checkAvailableTimes":
            toolResult = await checkAvailableTimes(
              businessId,
              toolArgs.serviceName,
              toolArgs.date,
            );
            break;
          case "createAppointment":
            toolResult = await createAppointment(
              businessId,
              userPhone,
              toolArgs.serviceName,
              toolArgs.date,
              toolArgs.time,
            );
            break;
          case "listMyAppointments":
            toolResult = await listMyAppointments(businessId, userPhone);
            break;
          case "cancelAppointment":
            toolResult = await cancelAppointment(
              businessId,
              userPhone,
              toolArgs.appointmentDate,
              toolArgs.appointmentTime,
              toolArgs.serviceName,
            );
            break;
          case "rescheduleAppointment":
            toolResult = await rescheduleAppointment(
              businessId,
              userPhone,
              toolArgs.originalDate,
              toolArgs.originalTime,
              toolArgs.newDate,
              toolArgs.newTime,
              toolArgs.serviceName,
            );
            break;
          case "getBusinessHours":
            toolResult = await getBusinessHours(businessId);
            break;
          case "getBusinessInfo":
            toolResult = await getBusinessInfo(businessId);
            break;
          case "requestHumanAgent":
            toolResult = await requestHumanAgent(
              businessId,
              userPhone,
              toolArgs.reason,
            );
            break;
          default:
            if (toolName.startsWith("admin_") && !isAdmin) {
              toolResult = {
                error:
                  "Permissão negada. Esta função é apenas para administradores.",
              };
            } else {
              toolResult = {
                error: `Ferramenta "${toolName}" não implementada ou não disponível.`,
              };
            }
        }

        logger.debug(`Tool execution result`, {
          businessId,
          userPhone,
          toolName,
          result: toolResult,
        });
      } catch (error) {
        logger.error(`Error executing tool ${toolName}`, {
          error: error instanceof Error ? error.message : String(error),
          businessId,
          userPhone,
        });

        // Use mensagens amigáveis específicas para cada ferramenta
        const userFriendlyMessages = {
          cancelAppointment:
            "Não foi possível cancelar seu agendamento neste momento. Você pode tentar novamente ou ligar para (22) 99977-5122.",
          createAppointment:
            "Não foi possível criar seu agendamento. Por favor, verifique os dados informados e tente novamente.",
          default:
            "Desculpe, não foi possível completar esta operação. Por favor, tente novamente.",
        };

        const errorMessage =
          userFriendlyMessages[toolName] || userFriendlyMessages.default;

        toolResult = {
          error: errorMessage,
        };
      }

      // Enviar o resultado da ferramenta de volta para o Gemini
      const newResult = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: currentPrompt }],
          },
          {
            role: "model",
            parts: [{ text: `Vou verificar isso para você.` }],
          },
          {
            role: "user",
            parts: [
              {
                text: `Resultado da ferramenta ${toolName}: ${JSON.stringify(toolResult, null, 2)}. 
                Por favor, continue a conversa incorporando essas informações.
                Lembre-se de responder no formato JSON solicitado com os campos "resposta" e "meta".`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
        },
        tools: [
          {
            functionDeclarations: getAvailableTools(false),
          },
        ],
      });

      // Atualizar a resposta atual para processamento adicional
      currentResult = newResult;

      // Processar recursivamente se houver mais chamadas de ferramentas
      return await processToolCalls();
    }

    // Iniciar o processamento de chamadas de ferramentas
    finalResponseText = await processToolCalls();

    console.log("Resposta bruta do LLM:", finalResponseText);

    // Processar e validar a resposta JSON
    const { text: processedResponseText, meta } = await processLLMResponse(
      { response: { text: () => finalResponseText } },
      businessId,
      userPhone,
    );

    console.log("Resposta processada:", processedResponseText);
    console.log("Metadados:", meta);

    // Revisar a resposta antes de enviá-la
    // const reviewResult = await reviewResponse(
    //   basePrompt,
    //   processedResponseText,
    //   session,
    // );
    // const validatedResponseText = reviewResult.finalResponse;

    // console.log("Resposta final após revisão:", validatedResponseText);

    // Salvar no histórico e enviar
    session.conversation_history.push({
      role: "model",
      content: processedResponseText, //validatedResponseText,
      timestamp: Date.now(),
      _meta: meta, // Opcional: salvar metadados para análise
    });

    await saveSession(businessId, userPhone, session);
    await sendTextMessage(businessId, userPhone, processedResponseText); //validatedResponseText);

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

var basePrompt = `
Você é a recepcionista que atende via o WhatsApp oficial do Mister Sérgio Cabeleireiro, especializado em gerenciar agendamentos e fornecer informações sobre nossos serviços.

## Sua Personalidade
- Amigável, profissional, paciente, claro e eficiente

## Conhecimentos Principais
- Todos os serviços oferecidos pelo Mister Sérgio Cabeleireiro:
  * Barba: Aparar e modelar barba - Duração: 30 minutos - Preço: R$ 25,00
  * Corte + Barba: Combo corte e barba - Duração: 45 minutos - Preço: R$ 55,00
  * Corte de Cabelo: Corte masculino básico - Duração: 30 minutos - Preço: R$ 35,00
  * Design de Sobrancelhas - Duração: 30 minutos - Preço: R$ 20,00

- Horários de funcionamento:
  * Terça a Sexta: 09:30 às 19:00
  * Sábado: 09:30 às 18:00
  * Domingo e Segunda: Fechado

- Endereço: Rua Dr. Júlio Olivier, 474 - Centro, Macaé - RJ, 27913-161
  * Localizado dentro das Óticas Precisão
  * Ponto de referência: Centro de Macaé
  * Fácil acesso, próximo a diversos comércios

- Contato: (22) 99977-5122

- Sobre o salão:
  * Ambiente climatizado, acolhedor e familiar
  * Equipe de profissionais altamente qualificados
  * Nota 4,6/5 com mais de 80 avaliações no Google
  * Recomendado por sua excelência em atendimento e qualidade dos serviços
  * Preços justos com ótimo custo-benefício
  * Ideal para quem precisa de atendimento rápido no horário de almoço

## Como Responder
- Seja breve e objetivo em suas respostas, mas sempre educado
- Use linguagem simples e evite termos técnicos desnecessários
- Dê sempre as opções disponíveis quando relevante (ex: horários, serviços)
- Confirme informações importantes com o cliente antes de prosseguir
- Use emojis ocasionalmente para uma comunicação mais amigável, mas com moderação, evitando repetição se no histórico já houver muitos emojis
- Se no histórico você já cumprimentou o cliente, não repita o cumprimento(exemplo, não diga mais de um "Olá, tudo bem?" e similares)
- Se o cliente já fez uma pergunta, não pergunte novamente "Como posso ajudar?" ou "O que você gostaria de saber?". Em vez disso, responda diretamente à pergunta anterior.
- Você jamais deve pedir pra ele aguardar um momento, para verificar alguma coisa, pois verificações ocorrem dentro do algoritmo, antes de responder ao cliente.

## Fluxo de Agendamento(flexível, não rigidamente sequencial)
1. Quando um cliente pedir para agendar, apresente claramente todos os serviços disponíveis com preços e duração
2. Após a escolha do serviço, pergunte sobre o dia preferido
3. Depois, ofereça os horários disponíveis para aquele dia
4. Por fim, confirme todos os detalhes antes de finalizar o agendamento
5. Mencione que os horários podem ser disputados, então o agendamento antecipado é recomendado

OBS IMPORTANTE: Para evitar perguntas repetidas, não pergunte "Qual serviço você gostaria de agendar?" se o cliente já mencionou um serviço anteriormente, ou "Qual dia/horário você prefere?" se o cliente já informou um dia/horário. Nesses casos, deve verificar se está disponível e já responder com a confirmação/objeção.

## Limitações
- Você não processa pagamentos
- Você não pode alterar os preços ou criar novos serviços
- Você não tem acesso a informações de clientes além do que eles compartilham durante a conversa

## Respostas Específicas
- **Quando perguntar sobre cortes específicos**: Explique que nossos profissionais são especializados em diversos estilos e podem atender às necessidades específicas durante o atendimento. Nossos barbeiros são elogiados pela precisão e qualidade dos cortes.
- **Quando perguntar sobre cancelamentos**: Informe que cancelamentos podem ser feitos até 2 horas antes do horário agendado sem custo.
- **Quando perguntar sobre atrasos**: Clientes atrasados mais de 15 minutos podem perder sua reserva se houver outros clientes agendados em seguida.
- **Quando perguntar sobre sobrancelhas**: Mencione que o design de sobrancelhas do Mister Sérgio é muito elogiado, sendo considerado por alguns clientes como "o melhor de Macaé".
- **Quando perguntar sobre estacionamento ou como chegar**: Informe que o salão fica no Centro de Macaé, dentro das Óticas Precisão, com fácil acesso e próximo a diversos comércios.
- **Quando perguntar se atende mulheres ou crianças**: Confirme que o salão atende todos os públicos, oferecendo serviços personalizados para cada cliente.

## Finalização
- Ao concluir um agendamento, confirme os detalhes (serviço, data, hora)
- Agradeça o cliente pela preferência
- Sempre relembre que, se precisarem remarcar ou cancelar, basta enviar mensagem
`;

// Configuração da API
export const config = {
  api: {
    bodyParser: true,
  },
};
