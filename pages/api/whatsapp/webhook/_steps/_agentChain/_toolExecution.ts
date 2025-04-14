// pages/api/whatsapp/webhook/_steps/_agentChain/_toolExecution.ts

import { NodeInput, NodeOutput, ToolResult } from "./_types";
import logger from "@/lib/logger";
import { _model } from "./_model";
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
import { format, addDays } from "date-fns";
import { serializeLlmResponse } from "../../_utils";

/**
 * Executa uma ferramenta específica com os parâmetros fornecidos
 */
const _executeTool = async (
  toolName: string,
  businessId: string,
  userPhone: string,
  toolArgs: any,
  isAdmin: boolean,
): Promise<ToolResult> => {
  try {
    // Pré-processamento de datas relativas
    if (toolName === "createAppointment" && toolArgs.date) {
      // Converter referências a datas relativas
      if (typeof toolArgs.date === "string") {
        // Processar "amanhã", "hoje", etc.
        const lowerDate = toolArgs.date.toLowerCase();
        const today = new Date();

        if (lowerDate === "amanhã" || lowerDate === "amanha") {
          const tomorrow = addDays(today, 1);
          toolArgs.date = format(tomorrow, "yyyy-MM-dd");

          logger.debug(
            `Data relativa 'amanhã' processada para: ${toolArgs.date}`,
            {
              businessId,
              userPhone,
            },
          );
        } else if (lowerDate === "hoje") {
          toolArgs.date = format(today, "yyyy-MM-dd");
        }
      }
    }

    // Log de execução da ferramenta com parâmetros detalhados
    logger.debug(`Executando ferramenta ${toolName} com parâmetros:`, {
      toolName,
      toolArgs,
      businessId,
      userPhone,
    });

    let result;
    switch (toolName) {
      case "listServices":
        result = await listServices(businessId);
        // Log detalhado do resultado
        logger.info(`Resultado de listServices:`, {
          businessId,
          userPhone,
          result,
          serviceCount: result.services?.length || 0,
          serviceList: JSON.stringify(result.services),
          success: !result.error,
        });
        return result;
      case "checkAvailableDates":
        // return await checkAvailableDates(
        //   businessId,
        //   toolArgs.serviceName,
        //   toolArgs.referenceMonth,
        // );
        result = await checkAvailableDates(
          businessId,
          toolArgs.serviceName,
          toolArgs.referenceMonth,
        );
        // Log detalhado do resultado
        logger.info(`Resultado de checkAvailableDates:`, {
          businessId,
          userPhone,
          result,
          dateCount: result.dates?.length || 0,
          dateList: JSON.stringify(result.dates),
          success: !result.error,
        });
        return result;

      case "checkAvailableTimes":
        // return await checkAvailableTimes(
        //   businessId,
        //   toolArgs.serviceName,
        //   toolArgs.date,
        // );
        result = await checkAvailableTimes(
          businessId,
          toolArgs.date,
          toolArgs.serviceName,
        );
        // Log detalhado do resultado
        logger.info(`Resultado de checkAvailableTimes:`, {
          businessId,
          userPhone,
          result,
          timeCount: result.times?.length || 0,
          timeList: JSON.stringify(result.times),
          success: !result.error,
        });
        return result;
      case "createAppointment":
        // Registro detalhado dos parâmetros para debugging
        logger.info(`Criando agendamento com parâmetros detalhados:`, {
          businessId,
          userPhone,
          serviceName: toolArgs.serviceName,
          date: toolArgs.date,
          time: toolArgs.time,
          dataTipo: typeof toolArgs.date,
        });

        // return await createAppointment(
        //   businessId,
        //   userPhone,
        //   toolArgs.serviceName,
        //   toolArgs.date,
        //   toolArgs.time,
        // );
        result = await createAppointment(
          businessId,
          userPhone,
          toolArgs.serviceName,
          toolArgs.date,
          toolArgs.time,
        );
        // Log detalhado do resultado
        logger.info(`Resultado de createAppointment:`, {
          businessId,
          userPhone,
          result,
          appointmentId: result.appointmentId,
          success: !result.error,
        });
        return result;
      case "listMyAppointments":
        // return await listMyAppointments(businessId, userPhone);
        result = await listMyAppointments(businessId, userPhone);
        // Log detalhado do resultado
        logger.info(`Resultado de listMyAppointments:`, {
          businessId,
          userPhone,
          result,
          appointmentCount: result.appointments?.length || 0,
          appointmentList: JSON.stringify(result.appointments),
          success: !result.error,
        });
        return result;
      case "cancelAppointment":
        // return await cancelAppointment(
        //   businessId,
        //   userPhone,
        //   toolArgs.appointmentDate,
        //   toolArgs.appointmentTime,
        //   toolArgs.serviceName,
        // );
        result = await cancelAppointment(
          businessId,
          userPhone,
          toolArgs.appointmentDate,
          toolArgs.appointmentTime,
          toolArgs.serviceName,
        );
        // Log detalhado do resultado
        logger.info(`Resultado de cancelAppointment:`, {
          businessId,
          userPhone,
          result,
          appointmentId: toolArgs.appointmentId,
          success: !result.error,
        });
        return result;
      case "rescheduleAppointment":
        // return await rescheduleAppointment(
        //   businessId,
        //   userPhone,
        //   toolArgs.originalDate,
        //   toolArgs.originalTime,
        //   toolArgs.newDate,
        //   toolArgs.newTime,
        //   toolArgs.serviceName,
        // );

        result = await rescheduleAppointment(
          businessId,
          userPhone,
          toolArgs.originalDate,
          toolArgs.originalTime,
          toolArgs.newDate,
          toolArgs.newTime,
          toolArgs.serviceName,
        );
        // Log detalhado do resultado
        logger.info(`Resultado de rescheduleAppointment:`, {
          businessId,
          userPhone,
          ...toolArgs,
          result,
          success: !result.error,
        });
        return result;
      case "getBusinessHours":
        // return await getBusinessHours(businessId);
        result = await getBusinessHours(businessId);
        // Log detalhado do resultado
        logger.info(`Resultado de getBusinessHours:`, {
          businessId,
          userPhone,
          result,
          businessHours: JSON.stringify(result),
          success: !result.error,
        });

      case "getBusinessInfo":
        // return await getBusinessInfo(businessId);
        result = await getBusinessInfo(businessId);
        // Log detalhado do resultado
        logger.info(`Resultado de getBusinessInfo:`, {
          businessId,
          userPhone,
          result,
          businessInfo: JSON.stringify(result),
          success: !result.error,
        });
        return result;
      case "requestHumanAgent":
        // return await requestHumanAgent(businessId, userPhone, toolArgs.reason);]
        result = await requestHumanAgent(
          businessId,
          userPhone,
          // toolArgs.reason,
        );
        // Log detalhado do resultado
        logger.info(`Resultado de requestHumanAgent:`, {
          businessId,
          userPhone,
          result,
          requestId: result.requestId,
          success: !result.error,
        });
      default:
        if (toolName.startsWith("admin_") && !isAdmin) {
          return {
            error:
              "Permissão negada. Esta função é apenas para administradores.",
          };
        } else {
          return {
            error: `Ferramenta "${toolName}" não implementada ou não disponível.`,
          };
        }
    }
  } catch (error) {
    logger.error(`Erro na execução de ferramenta ${toolName}`, {
      error: error instanceof Error ? error.message : String(error),
      toolName,
      toolArgs,
      businessId,
      userPhone,
    });

    throw error;
  }
};

/**
 * Obtém as ferramentas disponíveis com base no status de admin
 */
const _getAvailableTools = (isAdmin: boolean): any[] => {
  return availableTools.filter((tool) => {
    if (isAdmin) return true;
    return !tool.name.startsWith("admin_");
  });
};

/**
 * Converte o formato de histórico de conversa para o formato esperado pelo Gemini
 */
const _convertHistoryToGeminiFormat = (history: any[]): any[] => {
  return history.map((item) => ({
    role: item.role,
    parts: [{ text: item.content }],
  }));
};

/**
 * Extrai ações pendentes do deepThinking analisado
 */
const _extractActionsFromDeepThinking = (deepThinking: string): any[] => {
  if (!deepThinking) return [];

  const actions = [];

  // Verificar se há múltiplas ações
  const isMultipleActions =
    deepThinking.includes("Múltiplas ações: sim") ||
    (deepThinking.includes("Ações identificadas") &&
      deepThinking.includes("1.") &&
      deepThinking.includes("2."));

  if (!isMultipleActions) return [];

  try {
    // Extrair serviços e horários
    // Padrões para encontrar serviços e horários usando regex
    const servicePattern =
      /(Corte de Cabelo|Barba|Design de Sobrancelhas|Corte \+ Barba)/gi;
    const timePattern = /(\d{1,2}[:\.]\d{2})/g;
    const datePattern = /(hoje|amanhã|\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2})/gi;

    const allServices = [];
    const allTimes = [];
    const allDates = [];

    // Encontrar todos os serviços mencionados
    let serviceMatch;
    while ((serviceMatch = servicePattern.exec(deepThinking)) !== null) {
      allServices.push(serviceMatch[1]);
    }

    // Encontrar todos os horários mencionados
    let timeMatch;
    while ((timeMatch = timePattern.exec(deepThinking)) !== null) {
      allTimes.push(timeMatch[1]);
    }

    // Encontrar todas as datas mencionadas
    let dateMatch;
    while ((dateMatch = datePattern.exec(deepThinking)) !== null) {
      allDates.push(dateMatch[1]);
    }

    // Normalizar a data se houver apenas uma
    const defaultDate = allDates.length > 0 ? allDates[0] : "amanhã";

    // Criar mapeamentos para cada ação identificada
    // A heurística aqui é associar serviços com horários na ordem em que aparecem
    const minItems = Math.min(allServices.length, allTimes.length);

    for (let i = 0; i < minItems; i++) {
      actions.push({
        serviceName: allServices[i],
        time: allTimes[i],
        date: defaultDate,
      });
    }

    logger.debug("Ações extraídas do deep thinking:", { actions });
    return actions;
  } catch (error) {
    logger.error("Erro ao extrair ações do deep thinking:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
};

/**
 * Verifica quais ações ainda precisam ser executadas
 */
const _getPendingActions = (
  extractedActions: any[],
  completedToolCalls: any[],
): any[] => {
  if (!extractedActions || extractedActions.length === 0) return [];

  // Filtrar ações completadas
  // Uma ação é considerada completada se existe um createAppointment com o mesmo serviço
  return extractedActions.filter((action) => {
    const isCompleted = completedToolCalls.some((call) => {
      return (
        call.name === "createAppointment" &&
        call.args &&
        call.args.serviceName === action.serviceName
      );
    });

    return !isCompleted;
  });
};

/**
 * Gerencia o ciclo de chamadas de função do Gemini de acordo com a documentação
 * Referência: https://ai.google.dev/docs/function_calling
 */
export const _toolExecution = async (input: NodeInput): Promise<NodeOutput> => {
  const {
    modelResponse,
    businessId,
    userPhone,
    isAdmin,
    prompt,
    deepThinking,
  } = input;

  if (!modelResponse) {
    logger.warn("Sem resposta do modelo para processamento de ferramentas", {
      businessId,
      userPhone,
    });
    return {
      ...input,
      finalResponse: JSON.stringify({
        resposta:
          "Desculpe, estou com dificuldades técnicas no momento. Poderia tentar novamente?",
        meta: {
          intencao_detectada: "erro",
          horarios_mencionados: [],
          horarios_agendados: [],
          servicos_mencionados: [],
          data_referencia: "",
          confianca: 0,
        },
      }),
    };
  }

  // Registrar todas as chamadas de ferramentas executadas
  const completedToolCalls = [];
  // Resultados de chamada de ferramentas para incluir no histórico
  const toolResults = [];

  // Extrair ações planejadas do deepThinking
  const plannedActions = _extractActionsFromDeepThinking(deepThinking || "");

  logger.info("Ações identificadas pelo deep thinking:", {
    plannedActions,
    count: plannedActions.length,
    businessId,
    userPhone,
  });

  // Modelo para geração de conteúdo
  const model = _model();

  // CORRIGIDO: Converter histórico para formato Gemini
  // Importante: O Gemini espera contents no formato { role, parts: [{ text }] }
  // e não { role, content, timestamp } que é o formato armazenado na sessão
  let historyInGeminiFormat = [];
  if (input.session?.conversation_history) {
    historyInGeminiFormat = _convertHistoryToGeminiFormat(
      input.session.conversation_history,
    );
  }

  let currentContent = [...historyInGeminiFormat];

  // Adicionar a análise de Deep Thinking ao prompt se disponível
  if (deepThinking) {
    currentContent.push({
      role: "user",
      parts: [
        {
          text: `Análise da sua solicitação:\n${deepThinking}\n\nPor favor, execute as ações necessárias.`,
        },
      ],
    });
  }

  try {
    // Resultado atual do modelo
    let currentResult = modelResponse;
    let finalResult = null;

    // Contador para evitar loops infinitos
    let interactionCount = 0;
    const MAX_INTERACTIONS = 5; // Limite de segurança

    // Ciclo principal de processamento de chamadas de funções
    // Seguindo o padrão da documentação do Gemini
    while (interactionCount < MAX_INTERACTIONS) {
      interactionCount++;

      // Extrair a chamada de função, se existir
      const functionCall =
        currentResult.response.candidates?.[0]?.content?.parts?.find(
          (part) => part.functionCall,
        )?.functionCall;

      // Se não houver chamada de função, finalizar o ciclo
      if (!functionCall) {
        finalResult = currentResult;
        break;
      }

      // Extrair detalhes da chamada
      const toolName = functionCall.name;
      const toolArgs = functionCall.args || {};

      logger.info(`Executando chamada de ferramenta: ${toolName}`, {
        businessId,
        userPhone,
        toolArgs,
        interactionCount,
      });

      try {
        // Executar a ferramenta
        const toolResult = await _executeTool(
          toolName,
          businessId,
          userPhone,
          toolArgs,
          isAdmin,
        );

        // Registrar chamada completada
        completedToolCalls.push({
          name: toolName,
          args: toolArgs,
          result: toolResult,
          success: !toolResult.error,
        });

        // Armazenar resultado
        toolResults.push({
          name: toolName,
          args: toolArgs,
          result: toolResult,
        });

        // Adicionar a chamada de função e seu resultado ao histórico de conversação
        // para seguir o padrão da API Gemini
        currentContent.push({
          role: "model",
          parts: [
            {
              functionCall: {
                name: toolName,
                args: toolArgs,
              },
            },
          ],
        });

        currentContent.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: { result: toolResult },
              },
            },
          ],
        });

        // Verificar ações pendentes após cada execução
        const pendingActions = _getPendingActions(
          plannedActions,
          completedToolCalls,
        );

        // Se ainda há ações pendentes, adicionar instrução explícita
        if (pendingActions.length > 0) {
          const pendingMessage = `
            AÇÕES PENDENTES IDENTIFICADAS:
            ${pendingActions
              .map(
                (action, i) =>
                  `${i + 1}. Serviço: ${action.serviceName}, Horário: ${action.time}, Data: ${action.date}`,
              )
              .join("\n")}
            
            POR FAVOR, EXECUTE ESTAS AÇÕES PENDENTES ANTES DE RESPONDER AO USUÁRIO.
            NÃO PERGUNTE AO USUÁRIO SOBRE ESTAS AÇÕES, APENAS EXECUTE-AS.
          `;

          currentContent.push({
            role: "user",
            parts: [{ text: pendingMessage }],
          });

          logger.info("Solicitando execução de ações pendentes:", {
            pendingActions,
            businessId,
            userPhone,
          });
        }

        // Gerar nova resposta do modelo com o histórico atualizado
        currentResult = await model.generateContent({
          contents: currentContent,
          tools: [
            {
              functionDeclarations: _getAvailableTools(isAdmin),
            },
          ],
          generationConfig: {
            temperature: 0,
          },
        });
      } catch (error) {
        logger.error(`Erro ao executar ferramenta ${toolName}`, {
          error: error instanceof Error ? error.message : String(error),
          businessId,
          userPhone,
          toolName,
        });

        // Adicionar o erro como resposta da função e continuar
        const errorMessage =
          error instanceof Error ? error.message : "Erro desconhecido";

        currentContent.push({
          role: "model",
          parts: [
            {
              functionCall: {
                name: toolName,
                args: toolArgs,
              },
            },
          ],
        });

        currentContent.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: toolName,
                response: {
                  error: errorMessage,
                  result: {
                    success: false,
                    message: `Falha ao processar: ${errorMessage}`,
                  },
                },
              },
            },
          ],
        });

        // Tentar continuar com uma nova resposta
        try {
          currentResult = await model.generateContent({
            contents: currentContent,
            tools: [
              {
                functionDeclarations: _getAvailableTools(isAdmin),
              },
            ],
            generationConfig: {
              temperature: 0,
            },
          });
        } catch (genError) {
          logger.error("Erro após falha na ferramenta", {
            error:
              genError instanceof Error ? genError.message : String(genError),
            businessId,
            userPhone,
          });
          break;
        }
      }
    }

    // Se chegamos ao limite de interações sem finalizar
    if (!finalResult && interactionCount >= MAX_INTERACTIONS) {
      logger.warn("Atingido limite máximo de interações", {
        businessId,
        userPhone,
        interactionCount,
      });

      // Gerar resposta final sem ferramentas
      finalResult = await model.generateContent({
        contents: [
          ...currentContent,
          {
            role: "user",
            parts: [
              {
                text: "Por favor, forneça uma resposta final considerando todas as ações realizadas até o momento.",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
        },
      });
    }

    // Verificar se a resposta final está no formato JSON esperado
    let finalResponseText = finalResult?.response?.text() || "";
    if (
      !finalResponseText.includes('"resposta":') ||
      !finalResponseText.includes('"meta":')
    ) {
      // Formatar como JSON
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
        ${finalResponseText}
      `;

      try {
        const reformatResult = await model.generateContent(formattingPrompt);
        finalResponseText = reformatResult.response.text();
      } catch (error) {
        logger.warn("Erro ao reformatar resposta como JSON", {
          error: error instanceof Error ? error.message : String(error),
          businessId,
          userPhone,
        });

        // Criar JSON manualmente se falhar
        finalResponseText = JSON.stringify({
          resposta:
            finalResponseText ||
            "Olá! Seja bem-vindo ao Mister Sérgio Cabeleireiro. Como posso ajudar?",
          meta: {
            intencao_detectada: "saudacao",
            horarios_mencionados: [],
            horarios_agendados: [],
            servicos_mencionados: [],
            data_referencia: "",
            confianca: 0.5,
          },
        });

        finalResponseText = serializeLlmResponse(finalResponseText);
      }
    }

    // Validar resposta com ações pendentes
    // Se há ações planejadas que não foram executadas, a resposta não deve confirmar essas ações
    const pendingActions = _getPendingActions(
      plannedActions,
      completedToolCalls,
    );
    if (pendingActions.length > 0) {
      try {
        // Alterar a resposta para indicar quais ações foram realmente completadas
        const responseObj = JSON.parse(finalResponseText);

        // Extrair serviços e horários das ações completadas
        const completedServices = completedToolCalls
          .filter((call) => call.name === "createAppointment" && call.success)
          .map(
            (call) =>
              `${call.args.serviceName}: ${call.result.appointmentId ? "confirmado" : "não confirmado"}`,
          );

        if (completedServices.length === 0) {
          // Nenhum agendamento foi bem-sucedido
          responseObj.resposta =
            "Desculpe, não consegui realizar o agendamento. Por favor, podemos tentar novamente?";
        } else if (completedServices.length < plannedActions.length) {
          // Alguns agendamentos foram bem-sucedidos, outros não
          const pendingServicesText = pendingActions
            .map((a) => a.serviceName)
            .join(" e ");

          responseObj.resposta = `Consegui agendar ${completedServices[0]}. Para o(s) serviço(s) de ${pendingServicesText}, precisarei que você confirme os horários novamente, por favor.`;
        }

        finalResponseText = JSON.stringify(responseObj);
      } catch (error) {
        logger.error("Erro ao ajustar resposta para ações pendentes", {
          error: error instanceof Error ? error.message : String(error),
          businessId,
          userPhone,
        });
      }
    }

    // Logar resumo de execução
    if (completedToolCalls.length > 0) {
      logger.info("Resumo de execução de ferramentas", {
        businessId,
        userPhone,
        totalToolCalls: completedToolCalls.length,
        toolsSummary: completedToolCalls.map(
          (t, i) => `${i + 1}. ${t.name} - ${t.success ? "Sucesso" : "Falha"}`,
        ),
      });
    }

    return {
      ...input,
      finalResponse: finalResponseText,
      toolResponses: toolResults,
    };
  } catch (error) {
    logger.error("Erro crítico durante execução de ferramentas", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      userPhone,
    });

    return {
      ...input,
      finalResponse: JSON.stringify({
        resposta:
          "Desculpe, ocorreu um erro durante o processamento. Por favor, tente novamente mais tarde.",
        meta: {
          intencao_detectada: "erro",
          horarios_mencionados: [],
          horarios_agendados: [],
          servicos_mencionados: [],
          data_referencia: "",
          confianca: 0,
        },
      }),
    };
  }
};
