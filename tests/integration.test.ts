// // tests/integration.test.ts

// import { describe, it, expect, beforeAll, afterAll, jest } from "@jest/globals";
// import { handleIncomingMessage } from "@/lib/coreLogic";
// import { getBusinessConfig, getSession, saveSession } from "@/lib/utils";
// import { getRagContext } from "@/lib/rag";
// import { getLLMResponse } from "@/lib/googleAiClient";
// import { checkAvailability, bookAppointment } from "@/lib/scheduling";
// import { sendTextMessage } from "@/lib/uazapiGoClient";
// import logger from "@/lib/logger";
// import supabaseClient from "@/lib/supabaseClient";
// import { UazapiGoPayload } from "@/types";

// // Mock das dependências externas
// jest.mock("@/lib/uazapiGoClient", () => ({
//   sendTextMessage: jest.fn().mockResolvedValue("mock-message-id"),
//   sendImageMessage: jest.fn().mockResolvedValue("mock-image-id"),
//   checkInstanceStatus: jest.fn().mockResolvedValue(true),
// }));

// jest.mock("@/lib/googleAiClient", () => ({
//   getLLMResponse: jest
//     .fn()
//     .mockResolvedValue("Isso é uma resposta de teste do LLM"),
//   buildPrompt: jest.fn().mockReturnValue("Prompt de teste"),
// }));

// jest.mock("@/lib/rag", () => ({
//   getRagContext: jest.fn().mockResolvedValue("Contexto RAG de teste"),
// }));

// jest.mock("@/lib/supabaseClient", () => ({
//   from: jest.fn().mockReturnValue({
//     select: jest.fn().mockReturnThis(),
//     insert: jest.fn().mockReturnThis(),
//     update: jest.fn().mockReturnThis(),
//     delete: jest.fn().mockReturnThis(),
//     eq: jest.fn().mockReturnThis(),
//     single: jest.fn().mockResolvedValue({
//       data: {
//         business_id: "business0",
//         name: "Barbearia Exemplo",
//         admin_phone: "5522997622896",
//         waba_number: "552232421323",
//         config: {
//           defaultPrompt:
//             "Você é um assistente virtual para a Barbearia Exemplo.",
//           ragEnabled: true,
//           businessHours: {
//             monday: { start: "09:00", end: "18:00" },
//             tuesday: { start: "09:00", end: "18:00" },
//             wednesday: { start: "09:00", end: "18:00" },
//             thursday: { start: "09:00", end: "18:00" },
//             friday: { start: "09:00", end: "18:00" },
//             saturday: { start: "09:00", end: "13:00" },
//             sunday: { start: null, end: null },
//           },
//         },
//       },
//       error: null,
//     }),
//   }),
// }));

// // Configurar logger para testes
// jest.mock("@/lib/logger", () => ({
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
//   configure: jest.fn(),
// }));

// describe("WhatsApp Bot Integration Tests", () => {
//   beforeAll(() => {
//     // Configurar ambiente de teste
//     process.env.UPSTASH_REDIS_REST_URL = "https://example-redis.upstash.io";
//     process.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
//     process.env.GOOGLE_API_KEY = "test-api-key";
//     process.env.SUPABASE_URL = "https://example.supabase.co";
//     process.env.SUPABASE_ANON_KEY = "test-supabase-key";
//     process.env.UAZAPIGO_API_KEY = "test-uazapi-key";
//   });

//   afterAll(() => {
//     // Limpar mocks após todos os testes
//     jest.clearAllMocks();
//   });

//   it("should process incoming text message correctly", async () => {
//     // Criar um payload de teste
//     const testPayload: UazapiGoPayload = {
//       phone: "5522987654321",
//       text: "Olá, gostaria de agendar um corte de cabelo",
//       messageType: "text",
//       fromMe: false,
//       isGroup: false,
//       senderName: "Cliente Teste",
//       senderId: "5522987654321@s.whatsapp.net",
//       timestamp: Date.now(),
//       metadata: {
//         originalPayload: {},
//         instanceOwner: "552232421323",
//         business_id: "business0",
//         is_admin: false,
//       },
//     };

//     // Executar a função principal
//     await handleIncomingMessage(testPayload);

//     // Verificar se as funções esperadas foram chamadas
//     expect(getLLMResponse).toHaveBeenCalled();
//     expect(sendTextMessage).toHaveBeenCalled();

//     // Verificar os parâmetros da função de envio de mensagem
//     expect(sendTextMessage).toHaveBeenCalledWith(
//       "business0",
//       "5522987654321",
//       expect.any(String),
//     );
//   });

//   it("should handle admin messages differently", async () => {
//     // Criar um payload de administrador
//     const adminPayload: UazapiGoPayload = {
//       phone: "5522997622896", // número do admin
//       text: "mostrar serviços",
//       messageType: "text",
//       fromMe: false,
//       isGroup: false,
//       senderName: "Admin",
//       senderId: "5522997622896@s.whatsapp.net",
//       timestamp: Date.now(),
//       metadata: {
//         originalPayload: {},
//         instanceOwner: "552232421323",
//         business_id: "business0",
//         is_admin: true,
//         is_root_admin: true,
//       },
//     };

//     // Mock para serviços
//     const mockServices = [
//       {
//         service_id: "service1",
//         name: "Corte de Cabelo",
//         price: 35.0,
//         duration: 30,
//         active: true,
//       },
//       {
//         service_id: "service2",
//         name: "Barba",
//         price: 25.0,
//         duration: 20,
//         active: true,
//       },
//     ];

//     // Sobrescrever mock específico para esta consulta
//     const mockFrom = supabaseClient.from as jest.Mock;
//     mockFrom.mockImplementationOnce(() => ({
//       select: jest.fn().mockReturnThis(),
//       eq: jest.fn().mockReturnThis(),
//       order: jest.fn().mockResolvedValue({
//         data: mockServices,
//         error: null,
//       }),
//     }));

//     // Executar a função principal
//     await handleIncomingMessage(adminPayload);

//     // Verificar se enviou uma mensagem com a lista de serviços
//     expect(sendTextMessage).toHaveBeenCalledWith(
//       "business0",
//       "5522997622896",
//       expect.stringContaining("Serviços Cadastrados"),
//     );
//   });

//   it("should handle scheduling flow correctly", async () => {
//     // Mock para checkAvailability
//     jest.mock("@/lib/scheduling", () => ({
//       ...jest.requireActual("@/lib/scheduling"),
//       checkAvailability: jest.fn().mockResolvedValue([
//         { time: "09:00", available: true },
//         { time: "10:00", available: true },
//         { time: "11:00", available: false },
//       ]),
//       bookAppointment: jest.fn().mockResolvedValue(true),
//     }));

//     // Criar payload para iniciar agendamento
//     const schedulePayload: UazapiGoPayload = {
//       phone: "5522987654321",
//       text: "quero agendar um corte",
//       messageType: "text",
//       fromMe: false,
//       isGroup: false,
//       senderName: "Cliente Teste",
//       senderId: "5522987654321@s.whatsapp.net",
//       timestamp: Date.now(),
//       metadata: {
//         originalPayload: {},
//         instanceOwner: "552232421323",
//         business_id: "business0",
//         is_admin: false,
//       },
//     };

//     // Mock da sessão para simular fluxo de agendamento
//     jest.mock("@/lib/utils", () => ({
//       ...jest.requireActual("@/lib/utils"),
//       getSession: jest.fn().mockResolvedValue({
//         current_intent: "start_scheduling",
//         context_data: {},
//         conversation_history: [],
//         last_updated: Date.now(),
//         is_admin: false,
//         user_id: "customer1",
//       }),
//       saveSession: jest.fn().mockResolvedValue(undefined),
//     }));

//     // Executar a função
//     await handleIncomingMessage(schedulePayload);

//     // Verificar se o LLM foi chamado para construir a resposta
//     expect(getLLMResponse).toHaveBeenCalled();

//     // Verificar se uma mensagem foi enviada ao usuário
//     expect(sendTextMessage).toHaveBeenCalledWith(
//       "business0",
//       "5522987654321",
//       expect.any(String),
//     );
//   });

//   it("should handle errors gracefully", async () => {
//     // Forçar um erro na função LLM
//     (getLLMResponse as jest.Mock).mockRejectedValueOnce(new Error("API Error"));

//     // Criar payload simples
//     const errorPayload: UazapiGoPayload = {
//       phone: "5522987654321",
//       text: "olá",
//       messageType: "text",
//       fromMe: false,
//       isGroup: false,
//       senderName: "Cliente Teste",
//       senderId: "5522987654321@s.whatsapp.net",
//       timestamp: Date.now(),
//       metadata: {
//         originalPayload: {},
//         instanceOwner: "552232421323",
//         business_id: "business0",
//         is_admin: false,
//       },
//     };

//     // Executar a função
//     await handleIncomingMessage(errorPayload);

//     // Verificar se o log de erro foi registrado
//     expect(logger.error).toHaveBeenCalled();

//     // Verificar se uma mensagem de erro foi enviada ao usuário
//     expect(sendTextMessage).toHaveBeenCalledWith(
//       "business0",
//       "5522987654321",
//       expect.stringContaining("Desculpe"),
//     );
//   });
// });

// // Testes para componentes individuais
// describe("Individual Component Tests", () => {
//   it("should generate proper RAG context", async () => {
//     const result = await getRagContext(
//       "Como funciona o serviço de barba?",
//       "business0",
//     );
//     expect(result).toContain("Contexto RAG de teste");
//   });

//   it("should format and process dates correctly", () => {
//     const today = new Date();
//     const formattedDate = formatDate(today);
//     expect(formattedDate).toContain(today.getFullYear().toString());
//   });

//   it("should validate scheduling properly", async () => {
//     // Mock implementation específica para este teste
//     const checkAvailabilityMock = jest.fn().mockResolvedValue([
//       { time: "09:00", available: true },
//       { time: "10:00", available: true },
//     ]);
//     const bookAppointmentMock = jest.fn().mockResolvedValue(true);

//     // Substituir a implementação
//     Object.assign(require("@/lib/scheduling"), {
//       checkAvailability: checkAvailabilityMock,
//       bookAppointment: bookAppointmentMock,
//     });

//     // Data futura para teste
//     const futureDate = new Date();
//     futureDate.setDate(futureDate.getDate() + 7);

//     // Verificar disponibilidade
//     const slots = await checkAvailability("business0", "service1", futureDate);
//     expect(slots).toHaveLength(2);
//     expect(slots[0].time).toBe("09:00");

//     // Testar agendamento
//     const dateStr = futureDate.toISOString().split("T")[0];
//     const result = await bookAppointment(
//       "business0",
//       "5522987654321",
//       "service1",
//       dateStr,
//       "09:00",
//     );
//     expect(result).toBe(true);
//   });
// });

// // Função de formatação de data para teste
// function formatDate(date: Date): string {
//   return date.toLocaleDateString("pt-BR", {
//     weekday: "long",
//     day: "numeric",
//     month: "long",
//     year: "numeric",
//   });
// }
