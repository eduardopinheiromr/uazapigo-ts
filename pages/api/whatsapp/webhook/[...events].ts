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

const modelName = "gemini-2.0-flash-lite";
const supportedWebhooks = ["/messages/text"];

// Implementação do Agente de Revisão
async function reviewResponse(responseText, context) {
  // Usar o modelo Gemini para revisar a resposta
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
  });

  const reviewPrompt = `
    Você é um agente de controle de qualidade para um assistente virtual de barbearia.
    
    Analise esta resposta que será enviada para um cliente via WhatsApp e verifique:
    1. Se contém informações técnicas de erro que não deveriam ser expostas
    2. Se é consistente com o contexto da conversa
    3. Se fornece informações precisas e úteis ao cliente
    4. Se há contradições com respostas anteriores
    
    Contexto da conversa: ${JSON.stringify(context.conversation_history)}
    
    Resposta a ser analisada: "${responseText}"
    
    Se a resposta for adequada, retorne apenas "APPROVED".
    Se a resposta tiver problemas, retorne "REJECTED" seguido de uma explicação breve
    e uma versão corrigida que deveria ser enviada.
  `;

  const result = await model.generateContent(reviewPrompt);
  const reviewResult = result.response.text();

  if (reviewResult.startsWith("APPROVED")) {
    return { approved: true, finalResponse: responseText };
  } else {
    // Extrair a versão corrigida da resposta
    const correctedResponse =
      reviewResult.split("Versão corrigida:")[1]?.trim() ||
      "Desculpe, estamos com um problema temporário. Por favor, tente novamente em alguns instantes ou entre em contato pelo telefone (22) 99977-5122.";

    logger.warn("Response rejected by review agent", {
      originalResponse: responseText,
      reviewFeedback: reviewResult,
    });

    return { approved: false, finalResponse: correctedResponse };
  }
}

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

    basePrompt += `Hoje é dia ${new Date().toLocaleDateString("pt-BR")}, ${new Date().toLocaleTimeString("pt-BR")}  `;
    basePrompt += `\n\n# Histórico de mensagens\n`;
    basePrompt += `${JSON.stringify(session.conversation_history)}\n\n`;
    basePrompt += `# Você deve responder a última mensagem, mantendo a fluidez da conversa\n`;

    // passo 3 - gerar a resposta
    console.log(basePrompt);
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
      contents: [
        {
          role: "user",
          parts: [
            {
              text: basePrompt,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
      },
      tools: [
        {
          functionDeclarations: getAvailableTools(isAdmin),
        },
      ],
    });

    // Substitua esta linha:
    // const responseText = result.response.text();

    // Por este trecho de código para processar chamadas de ferramentas:
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
        return currentResult.response.text();
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
        toolResult = {
          error: `Erro ao executar ${toolName}: ${
            error instanceof Error ? error.message : "Erro desconhecido"
          }`,
        };
      }

      // Enviar o resultado da ferramenta de volta para o Gemini
      const newResult = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: basePrompt }],
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
        Por favor, continue a conversa incorporando essas informações.`,
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

    console.log(
      JSON.stringify({
        finalResponseText,
      }),
    );
    // Revisar a resposta antes de enviá-la
    const reviewResult = await reviewResponse(finalResponseText, session);
    finalResponseText = reviewResult.finalResponse;

    // Salvar no histórico e enviar
    session.conversation_history.push({
      role: "bot",
      content: finalResponseText,
      timestamp: Date.now(),
    });

    await saveSession(businessId, userPhone, session);
    await sendTextMessage(businessId, userPhone, finalResponseText);
    // Extrair resposta e chamadas de ferramenta
    // const responseText = result.response.text();

    // console.log(
    //   JSON.stringify(
    //     { result, availableTools: getAvailableTools(isAdmin) },
    //     null,
    //     2,
    //   ),
    // );

    // // passo 4 - validar com um agente a resposta gerada, se não estiver ok, gerar de novo

    // // passo 5 - salvar a resposta no historico da conversa
    // session.conversation_history.push({
    //   role: "bot",
    //   content: responseText,
    //   timestamp: Date.now(),
    // });

    // await saveSession(businessId, userPhone, session);

    // // passo 6 - enviar para o usuário
    // await sendTextMessage(businessId, userPhone, responseText);
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
Você é a recepcionista que atende via o WhatsApp oficial do MISTER SÉRGIO CABELEIREIRO, especializado em gerenciar agendamentos e fornecer informações sobre nossos serviços.

## Sua Personalidade
- Amigável, profissional e eficiente
- Paciente com clientes que ainda não conhecem nossos serviços
- Direto e claro ao explicar os procedimentos de agendamento
- Sempre mantém um tom cortês e acolhedor
- Não repete cumprimentos se já houver um no histórico

## Conhecimentos Principais
- Todos os serviços oferecidos pelo MISTER SÉRGIO CABELEIREIRO:
  * Barba: Aparar e modelar barba - Duração: 20 minutos - Preço: R$ 25,00
  * Corte + Barba: Combo corte e barba - Duração: 45 minutos - Preço: R$ 55,00
  * Corte de Cabelo: Corte masculino básico - Duração: 30 minutos - Preço: R$ 35,00
  * Design de Sobrancelhas - Duração: 15 minutos - Preço: R$ 20,00

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

- Processo completo de agendamento, cancelamento e reagendamento
- Políticas sobre atrasos e cancelamentos

## Como Responder
- Seja breve e objetivo em suas respostas, mas sempre educado
- Use linguagem simples e evite termos técnicos desnecessários
- Dê sempre as opções disponíveis quando relevante (ex: horários, serviços)
- Confirme informações importantes com o cliente antes de prosseguir
- Use emojis ocasionalmente para uma comunicação mais amigável, mas com moderação, evitando repetição se no histórico já houver muitos emojis
- Se no histórico você já cumprimentou o cliente, não repita o cumprimento

## Fluxo de Agendamento
1. Quando um cliente pedir para agendar, apresente claramente todos os serviços disponíveis com preços e duração
2. Após a escolha do serviço, pergunte sobre o dia preferido
3. Depois, ofereça os horários disponíveis para aquele dia
4. Por fim, confirme todos os detalhes antes de finalizar o agendamento
5. Mencione que os horários podem ser disputados, então o agendamento antecipado é recomendado

## Limitações
- Você não processa pagamentos
- Você não pode alterar os preços ou criar novos serviços
- Você não tem acesso a informações de clientes além do que eles compartilham durante a conversa
- Você não pode acessar o histórico médico ou informações pessoais sensíveis

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
