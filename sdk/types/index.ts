// types/index.ts

/**
 * Payload original do webhook UazapiGO
 */
export interface UazapiGoWebhookPayload {
  EventType: string; // Tipo de evento ('messages', 'messages_update', 'call', etc)
  message?: UazapiGoMessage; // Presente quando EventType = 'messages'
  owner: string; // ID do owner da instância
  token: string; // Token da instância
}

/**
 * Estrutura de mensagem do UazapiGO
 */
export interface UazapiGoMessage {
  buttonOrListid: string;
  chatid: string;
  content: string;
  convertOptions: string;
  edited: string;
  fromMe: boolean;
  groupName: string;
  id: string;
  isGroup: boolean;
  mediaType: string;
  messageTimestamp: number;
  messageType: string;
  messageid: string;
  owner: string;
  quoted: string;
  reaction: string;
  sender: string; // Formato: '5511999999999@s.whatsapp.net'
  senderName: string;
  source: string;
  status: string;
  text: string;
  type: string; // 'text', 'image', etc
  vote: string;
}

/**
 * Payload adaptado e normalizado para uso interno
 */
export interface UazapiGoPayload {
  instance: string; // ID da instância/owner
  messageid: string; // ID único da mensagem
  sender: string; // ID completo do remetente com @s.whatsapp.net
  phone: string; // Número de telefone do remetente (sem @s.whatsapp.net)
  fromMe: boolean; // Indica se a mensagem foi enviada pelo WhatsApp Business
  isGroup: boolean; // Indica se a mensagem foi enviada em um grupo
  messageType: MessageType; // Tipo da mensagem (text, image, etc.)
  text: string; // Conteúdo da mensagem (para texto)
  file?: string; // URL do arquivo (para mídia)
  timestamp: number; // Timestamp da mensagem
  senderName?: string; // Nome exibido do remetente
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
