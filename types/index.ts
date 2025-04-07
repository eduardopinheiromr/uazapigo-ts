// types/index.ts

/**
 * Payload do webhook UazapiGO
 */
export interface UazapiGoPayload {
  instance: string; // Nome da instância
  messageid: string; // ID único da mensagem
  sender: string; // ID do remetente
  phone: string; // Número de telefone do remetente
  fromMe: boolean; // Indica se a mensagem foi enviada pelo WhatsApp Business
  isGroup: boolean; // Indica se a mensagem foi enviada em um grupo
  messageType: MessageType; // Tipo da mensagem (text, image, etc.)
  text: string; // Conteúdo da mensagem (para texto)
  file?: string; // URL do arquivo (para mídia)
  timestamp: number; // Timestamp da mensagem
}

/**
 * Tipos de mensagem suportados
 */
export type MessageType =
  | "text"
  | "image"
  | "video"
  | "document"
  | "audio"
  | "location"
  | "button"
  | "list"
  | "reaction";

/**
 * Dados de sessão/estado da conversa
 */
export interface ConversationState {
  current_intent: string | null;
  context_data: Record<string, any>;
  conversation_history: ChatMessage[];
  last_updated: number; // Timestamp
}

/**
 * Mensagem de chat para histórico e contexto
 */
export interface ChatMessage {
  role: "user" | "bot";
  content: string;
  timestamp: number;
}

/**
 * Configuração de cliente
 */
export interface ClientConfig {
  client_id: string;
  name: string;
  waba_number: string;
  llmApiKey: string;
  ragEnabled: boolean;
  defaultPrompt: string;
  maxHistoryMessages: number;
  sessionTtlHours: number;
  cacheSettings: {
    llmCacheTtlHours: number;
    configCacheTtlHours: number;
  };
}

/**
 * Resultado da busca de conhecimento RAG
 */
export interface KnowledgeChunk {
  chunk_id: string;
  content: string;
  similarity: number;
}

/**
 * Agendamento
 */
export interface Appointment {
  appointment_id: string;
  client_id: string;
  customer_phone: string;
  service: string;
  start_time: Date;
  end_time: Date;
  status: "pending" | "confirmed" | "cancelled";
}

/**
 * Horário disponível
 */
export interface TimeSlot {
  time: string; // Formato "HH:MM"
  available: boolean;
}
