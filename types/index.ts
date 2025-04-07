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
  service_id: string;
  start_time: string;
  end_time: string;
  status: "scheduled" | "confirmed" | "cancelled" | "completed" | "no_show";
  notes?: string;
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
}

/**
 * Chunk de conhecimento para RAG
 */
export interface KnowledgeChunk {
  chunk_id: string;
  business_id: string;
  content: string;
  similarity: number;
}

/**
 * Intenções disponíveis no sistema
 */
export enum Intent {
  // Intenções gerais
  GENERAL_CHAT = "general_chat",
  FAQ = "faq",

  // Intenções de agendamento
  START_SCHEDULING = "start_scheduling",
  SCHEDULING_COLLECT_SERVICE = "scheduling_collect_service",
  SCHEDULING_COLLECT_DATE = "scheduling_collect_date",
  SCHEDULING_COLLECT_TIME = "scheduling_collect_time",
  SCHEDULING_CONFIRM = "scheduling_confirm",
  CANCEL_APPOINTMENT = "cancel_appointment",
  CHECK_APPOINTMENTS = "check_appointments",
  RESCHEDULE_APPOINTMENT = "reschedule_appointment",

  // Intenções de admin
  ADMIN_CONFIG = "admin_config",
  ADMIN_SERVICES = "admin_services",
  ADMIN_BLOCKS = "admin_blocks",
  ADMIN_BUSINESS_HOURS = "admin_business_hours",
  ADMIN_REPORTS = "admin_reports",
}
