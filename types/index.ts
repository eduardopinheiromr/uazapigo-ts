// types/index.ts

/**
 * Formato padrão para payloads do UAZAPI processados pela aplicação
 */
export interface UazapiGoPayload {
  phone: string;
  text: string;
  messageType: string;
  fromMe: boolean;
  isGroup: boolean;
  senderName: string;
  senderId: string;
  timestamp: number;
  metadata: {
    originalPayload: any;
    instanceOwner: string;
    business_id?: string;
    is_admin?: boolean;
    admin_id?: string;
    is_root_admin?: boolean;
    permissions?: {
      canEditConfig: boolean;
      canEditServices: boolean;
      canViewAppointments: boolean;
    };
    customer_id?: string;
    customer_name?: string;
    is_blocked?: boolean;
    tags?: string[];
  };
}

/**
 * Estado de uma conversa
 */
export interface ConversationState {
  business_id?: string;
  current_intent: string | null;
  context_data: Record<string, any>;
  conversation_history: ChatMessage[];
  last_updated: number;
  is_admin: boolean;
  user_id?: string; // customer_id ou admin_id
}

/**
 * Mensagem de chat
 */
export interface ChatMessage {
  role: "user" | "bot";
  content: string;
  timestamp: number;
}

/**
 * Configuração de um negócio
 */
export interface BusinessConfig {
  business_id: string;
  name: string;
  waba_number: string;
  admin_phone: string;
  llmApiKey: string;
  ragEnabled: boolean;
  defaultPrompt: string;
  maxHistoryMessages: number;
  sessionTtlHours: number;
  businessHours: BusinessHours;
  cacheSettings: {
    llmCacheTtlHours: number;
    configCacheTtlHours: number;
  };
}

/**
 * Horário de funcionamento do negócio
 */
export interface BusinessHours {
  monday: DayHours;
  tuesday: DayHours;
  wednesday: DayHours;
  thursday: DayHours;
  friday: DayHours;
  saturday: DayHours;
  sunday: DayHours;
}

/**
 * Horário de funcionamento de um dia
 */
export interface DayHours {
  start: string | null;
  end: string | null;
}

/**
 * Horário disponível
 */
export interface TimeSlot {
  time: string;
  available: boolean;
}

/**
 * Serviço oferecido
 */
export interface Service {
  service_id: string;
  business_id: string;
  name: string;
  description: string;
  duration: number;
  price: number;
  active: boolean;
}

/**
 * Compromisso agendado
 */
export interface Appointment {
  appointment_id: string;
  business_id: string;
  customer_id: string;
  customer_phone?: string;
  service_id: string;
  service?: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Cliente do negócio
 */
export interface Customer {
  customer_id: string;
  business_id: string;
  phone: string;
  name?: string;
  email?: string;
  notes?: string;
  tags?: string[];
  is_blocked: boolean;
  metadata?: Record<string, any>;
  last_interaction?: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Admin do sistema
 */
export interface Admin {
  admin_id: string;
  business_id: string;
  phone: string;
  name?: string;
  role: string;
  permissions: {
    canEditConfig: boolean;
    canEditServices: boolean;
    canViewAppointments: boolean;
  };
  created_at?: string;
  updated_at?: string;
}

/**
 * Bloqueio de agenda
 */
export interface ScheduleBlock {
  block_id: string;
  business_id: string;
  title: string;
  start_time: string;
  end_time: string;
  created_by: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Chunk de conhecimento para RAG
 */
export interface KnowledgeChunk {
  chunk_id: string;
  business_id: string;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  similarity?: number;
  created_at?: string;
  updated_at?: string;
}

/**
 * Log do sistema
 */
export interface SystemLog {
  log_id: string;
  business_id?: string;
  level: string;
  message: string;
  phone?: string;
  intent?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

/**
 * Registro de conversa
 */
export interface ConversationLog {
  conversation_id: string;
  business_id: string;
  customer_id?: string;
  sender: "customer" | "bot";
  content: string;
  intent?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

/**
 * Opções para envio de mensagem
 */
export interface MessageOptions {
  quotedMessageId?: string;
  linkPreview?: boolean;
  mentions?: string[];
  buttons?: Button[];
  list?: List;
  replyButtons?: ReplyButton[];
}

/**
 * Botão para mensagem interativa
 */
export interface Button {
  id: string;
  text: string;
}

/**
 * Lista para mensagem interativa
 */
export interface List {
  title: string;
  buttonText: string;
  sections: ListSection[];
}

/**
 * Seção da lista
 */
export interface ListSection {
  title: string;
  rows: ListRow[];
}

/**
 * Item da lista
 */
export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

/**
 * Botão de resposta rápida
 */
export interface ReplyButton {
  id: string;
  text: string;
}

/**
 * Parâmetros de mídia
 */
export interface MediaParams {
  number: string;
  type: "image" | "video" | "audio" | "document";
  file: string;
  text?: string;
  docName?: string;
}

/**
 * Resposta do webhook
 */
export interface WebhookResponse {
  status: string;
  reason?: string;
  type?: string;
  error?: string;
  message?: string;
}

/**
 * Configuração de cache
 */
export interface CacheConfig {
  key: string;
  ttlSeconds?: number;
  ttlHours?: number;
}

/**
 * Resultado de busca vetorial
 */
export interface VectorSearchResult {
  chunk_id: string;
  content: string;
  similarity: number;
  metadata?: Record<string, any>;
}

/**
 * Resultado da análise de intenção
 */
export interface IntentAnalysis {
  intent: string;
  confidence: number;
  parameters?: Record<string, any>;
}

/**
 * Configuração de prompt
 */
export interface PromptConfig {
  systemInstruction: string;
  history: ChatMessage[];
  userQuery: string;
  businessConfig: BusinessConfig;
  ragContext?: string;
}
