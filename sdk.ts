// UAZAPI SDK for TypeScript
// A complete TypeScript SDK for interacting with the UAZAPI WhatsApp API

/**
 * @packageDocumentation
 * UAZAPI SDK for TypeScript
 *
 * This SDK provides a complete TypeScript interface for the UAZAPI WhatsApp API.
 * It includes type definitions and methods for all endpoints documented in the API reference.
 */

// =============================================================================
// Core SDK Setup
// =============================================================================

/**
 * Configuration options for the UAZAPI SDK
 */
export interface UazapiConfig {
  /** Base URL for the API (default: "https://free.uazapi.com") */
  baseUrl?: string;
  /** Authentication token for the API */
  token: string;
  /** Admin token for administrative operations */
  adminToken?: string;
  /** Default timeout for requests in milliseconds */
  timeout?: number;
  /** Whether to retry failed requests */
  retry?: boolean;
  /** Maximum number of retries */
  maxRetries?: number;
  /** Delay between retries in milliseconds */
  retryDelay?: number;
}

/**
 * Response format from the API
 */
export interface ApiResponse<T = any> {
  /** Response data */
  data: T;
  /** HTTP status code */
  status: number;
  /** Status message */
  message?: string;
  /** Optional error information */
  error?: string;
}

/**
 * Error thrown by the SDK
 */
export class UazapiError extends Error {
  /** HTTP status code */
  status: number;
  /** Original error object */
  originalError?: any;

  constructor(message: string, status: number = 500, originalError?: any) {
    super(message);
    this.name = "UazapiError";
    this.status = status;
    this.originalError = originalError;
  }
}

// =============================================================================
// API Models and Interfaces
// =============================================================================

// ---------------------------------
// Instance
// ---------------------------------

/**
 * Instance status options
 */
export type InstanceStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "hibernated";

/**
 * Instance model
 */
export interface Instance {
  /** ID único gerado automaticamente */
  id: string;
  /** Token de autenticação da instância */
  token: string;
  /** Status atual da conexão */
  status: InstanceStatus;
  /** Código de pareamento */
  paircode?: string;
  /** QR Code em base64 para autenticação */
  qrcode?: string;
  /** Nome da instância */
  name: string;
  /** Nome do perfil WhatsApp */
  profileName?: string;
  /** URL da foto do perfil */
  profilePicUrl?: string;
  /** Indica se é uma conta business */
  isBusiness?: boolean;
  /** Plataforma de origem (iOS/Android/Web) */
  plataform?: string;
  /** Nome do sistema operacional */
  systemName?: string;
  /** Proprietário da instância */
  owner?: string;
  /** Data/hora da última desconexão */
  lastDisconnect?: string;
  /** Motivo da última desconexão */
  lastDisconnectReason?: string;
  /** Campo administrativo 01 */
  adminField01?: string;
  /** Campo administrativo 02 */
  adminField02?: string;
  /** Chave da API OpenAI */
  openai_apikey?: string;
  /** Habilitar chatbot automático */
  chatbot_enabled?: boolean;
  /** Ignorar mensagens de grupos */
  chatbot_ignoreGroups?: boolean;
  /** Palavra-chave para parar conversa */
  chatbot_stopConversation?: string;
  /** Por quanto tempo ficará pausado o chatbot ao usar stop conversation */
  chatbot_stopMinutes?: number;
  /** Por quanto tempo ficará pausada a conversa quando você enviar mensagem manualmente, fora da API */
  chatbot_stopWhenYouSendMsg?: number;
  /** Data de criação da instância */
  created?: string;
  /** Data da última atualização */
  updated?: string;
}

/**
 * Instance creation parameters
 */
export interface CreateInstanceParams {
  /** Nome da instância */
  name: string;
  /** Nome do sistema (opcional, padrão 'uazapiGO' se não informado) */
  systemName?: string;
  /** Campo administrativo 1 para metadados personalizados (opcional) */
  adminField01?: string;
  /** Campo administrativo 2 para metadados personalizados (opcional) */
  adminField02?: string;
}

/**
 * Instance status response
 */
export interface InstanceStatusResponse {
  /** Informações da instância */
  instance: Instance;
  /** Status detalhado */
  status: {
    /** Indica se está conectado ao WhatsApp */
    connected: boolean;
    /** Indica se está autenticado no WhatsApp */
    loggedIn: boolean;
    /** ID do WhatsApp quando conectado */
    jid?: any;
  };
}

/**
 * Instance connect parameters
 */
export interface ConnectInstanceParams {
  /** Número de telefone no formato internacional (ex: 5511999999999) */
  phone?: string;
}

// ---------------------------------
// Webhook
// ---------------------------------

/**
 * Webhook event types
 */
export type WebhookEvent =
  | "connection"
  | "history"
  | "messages"
  | "messages_update"
  | "call"
  | "contacts"
  | "presence"
  | "groups"
  | "labels"
  | "chats"
  | "chat_labels"
  | "blocks"
  | "leads";

/**
 * Webhook message exclusion filters
 */
export type WebhookExcludeMessageFilter =
  | "wasSentByApi"
  | "wasNotSentByApi"
  | "fromMeYes"
  | "fromMeNo"
  | "isGroupYes"
  | "IsGroupNo";

/**
 * Webhook configuration
 */
export interface Webhook {
  /** ID único gerado automaticamente */
  id?: string;
  /** ID da instância associada */
  instance_id?: string;
  /** Webhook ativo/inativo */
  enabled?: boolean;
  /** URL de destino dos eventos */
  url: string;
  /** Tipos de eventos monitorados */
  events: WebhookEvent[];
  /** Incluir na URLs o tipo de mensagem */
  AddUrlTypesMessages?: boolean;
  /** Incluir na URL o nome do evento */
  addUrlEvents?: boolean;
  /** Filtros para excluir tipos de mensagens */
  excludeMessages?: WebhookExcludeMessageFilter[];
  /** Ação (add, update, delete) */
  action?: "add" | "update" | "delete";
  /** Data de criação (automática) */
  created?: string;
  /** Data da última atualização (automática) */
  updated?: string;
}

// ---------------------------------
// Chat
// ---------------------------------

/**
 * Chat model
 */
export interface Chat {
  /** ID único da conversa */
  id: string;
  /** Identificador rápido do WhatsApp */
  wa_fastid?: string;
  /** ID completo do chat no WhatsApp */
  wa_chatid?: string;
  /** Indica se o chat está arquivado */
  wa_archived?: boolean;
  /** Nome do contato no WhatsApp */
  wa_contactName?: string;
  /** Nome do WhatsApp */
  wa_name?: string;
  /** Nome exibido do chat */
  name?: string;
  /** URL da imagem do chat */
  image?: string;
  /** URL da miniatura da imagem */
  imagePreview?: string;
  /** Tempo de expiração de mensagens efêmeras */
  wa_ephemeralExpiration?: number;
  /** Indica se o contato está bloqueado */
  wa_isBlocked?: boolean;
  /** Indica se é um grupo */
  wa_isGroup?: boolean;
  /** Indica se o usuário é admin do grupo */
  wa_isGroup_admin?: boolean;
  /** Indica se é um grupo somente anúncios */
  wa_isGroup_announce?: boolean;
  /** Indica se é uma comunidade */
  wa_isGroup_community?: boolean;
  /** Indica se é membro do grupo */
  wa_isGroup_member?: boolean;
  /** Indica se o chat está fixado */
  wa_isPinned?: boolean;
  /** Labels do chat em JSON */
  wa_label?: string;
  /** Texto/voto da última mensagem */
  wa_lastMessageTextVote?: string;
  /** Tipo da última mensagem */
  wa_lastMessageType?: string;
  /** Timestamp da última mensagem */
  wa_lastMsgTimestamp?: number;
  /** Remetente da última mensagem */
  wa_lastMessageSender?: string;
  /** Timestamp do fim do silenciamento */
  wa_muteEndTime?: number;
  /** Dono da instância */
  owner?: string;
  /** Contador de mensagens não lidas */
  wa_unreadCount?: number;
  /** Número de telefone */
  phone?: string;
  /** Nome do lead */
  lead_name?: string;
  /** Nome completo do lead */
  lead_fullName?: string;
  /** Email do lead */
  lead_email?: string;
  /** Documento de identificação */
  lead_personalid?: string;
  /** Status do lead */
  lead_status?: string;
  /** Tags do lead em JSON */
  lead_tags?: string;
  /** Anotações sobre o lead */
  lead_notes?: string;
  /** Indica se tem ticket aberto */
  lead_isTicketOpen?: boolean;
  /** ID do atendente responsável */
  lead_assignedAttendant_id?: string;
  /** Ordem no kanban */
  lead_kanbanOrder?: number;
  /** Campo personalizado 01 */
  lead_field01?: string;
  /** Campo personalizado 02 */
  lead_field02?: string;
  /** Campo personalizado 03 */
  lead_field03?: string;
  /** Campo personalizado 04 */
  lead_field04?: string;
  /** Campo personalizado 05 */
  lead_field05?: string;
  /** Campo personalizado 06 */
  lead_field06?: string;
  /** Campo personalizado 07 */
  lead_field07?: string;
  /** Campo personalizado 08 */
  lead_field08?: string;
  /** Campo personalizado 09 */
  lead_field09?: string;
  /** Campo personalizado 10 */
  lead_field10?: string;
  /** Campo personalizado 11 */
  lead_field11?: string;
  /** Campo personalizado 12 */
  lead_field12?: string;
  /** Campo personalizado 13 */
  lead_field13?: string;
  /** Campo personalizado 14 */
  lead_field14?: string;
  /** Campo personalizado 15 */
  lead_field15?: string;
  /** Campo personalizado 16 */
  lead_field16?: string;
  /** Campo personalizado 17 */
  lead_field17?: string;
  /** Campo personalizado 18 */
  lead_field18?: string;
  /** Campo personalizado 19 */
  lead_field19?: string;
  /** Campo personalizado 20 */
  lead_field20?: string;
  /** Timestamp do último reset de memória */
  chatbot_agentResetMemoryAt?: number;
  /** ID do último gatilho executado */
  chatbot_lastTrigger_id?: string;
  /** Timestamp do último gatilho */
  chatbot_lastTriggerAt?: number;
  /** Timestamp até quando chatbot está desativado */
  chatbot_disableUntil?: number;
  /** Data de criação */
  created?: string;
  /** Data da última atualização */
  updated?: string;
}

// ---------------------------------
// Message
// ---------------------------------

/**
 * Message types
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
 * Message status
 */
export type MessageStatus =
  | "pending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "deleted";

/**
 * Message source platform
 */
export type MessageSource = "ios" | "web" | "android";

/**
 * Message model
 */
export interface Message {
  /** ID único interno da mensagem */
  id: string;
  /** ID original da mensagem no provedor */
  messageid?: string;
  /** ID da conversa relacionada */
  chatid?: string;
  /** Indica se a mensagem foi enviada pelo usuário */
  fromMe?: boolean;
  /** Indica se é uma mensagem de grupo */
  isGroup?: boolean;
  /** Tipo de conteúdo da mensagem */
  messageType?: MessageType;
  /** Timestamp original da mensagem em milissegundos */
  messageTimestamp?: number;
  /** Histórico de edições da mensagem */
  edited?: string;
  /** ID da mensagem citada/respondida */
  quoted?: string;
  /** ID da mensagem reagida */
  reaction?: string;
  /** ID do remetente da mensagem */
  sender?: string;
  /** Nome exibido do remetente */
  senderName?: string;
  /** Plataforma de origem da mensagem */
  source?: MessageSource;
  /** Status do ciclo de vida da mensagem */
  status?: MessageStatus;
  /** Texto original da mensagem */
  text?: string;
  /** Dados de votação de enquete e listas */
  vote?: string;
  /** ID do botão ou item de lista selecionado */
  buttonOrListid?: string;
  /** Conversão de opções de da mensagem, lista, enquete e botões */
  convertOptions?: string;
  /** URL para download de arquivos de mídia */
  fileURL?: string;
  /** Conteúdo completo da mensagem em formato JSON */
  content?: string;
  /** Dono da mensagem */
  owner?: string;
  /** Data de criação no sistema */
  created?: string;
  /** Data da última atualização */
  updated?: string;
  /** Metadados do processamento por IA */
  ai_metadata?: {
    /** ID do agente de IA responsável */
    agent_id?: string;
    /** Dados da requisição à API de IA */
    request?: {
      /** Histórico de mensagens enviadas para a API */
      messages?: any[];
      /** Ferramentas disponíveis para o agente */
      tools?: any[];
      /** Opções de configuração da API */
      options?: {
        /** Modelo utilizado */
        model?: string;
        /** Temperatura (criatividade) */
        temperature?: number;
        /** Limite de tokens */
        maxTokens?: number;
        /** Parâmetro top-p */
        topP?: number;
        /** Penalidade de frequência */
        frequencyPenalty?: number;
        /** Penalidade de presença */
        presencePenalty?: number;
      };
    };
    /** Resposta da API de IA */
    response?: {
      /** Resultados retornados pela API */
      choices?: any[];
      /** Resultados da execução de ferramentas */
      toolResults?: any[];
      /** Mensagem de erro, se houver */
      error?: string;
    };
  };
}

// ---------------------------------
// Label
// ---------------------------------

/**
 * Label model
 */
export interface Label {
  /** ID único da etiqueta */
  id: string;
  /** Nome da etiqueta */
  name: string;
  /** Índice numérico da cor (0-19) */
  color: number;
  /** Cor hexadecimal correspondente ao índice */
  colorHex: string;
  /** Data de criação */
  createdAt: string;
}

// ---------------------------------
// Group
// ---------------------------------

/**
 * Group member add mode
 */
export type GroupMemberAddMode = "admin_add" | "all_member_add";

/**
 * Group participant
 */
export interface GroupParticipant {
  /** Identificador do participante */
  JID: string;
  /** Identificador local do participante */
  LID?: string;
  /** Indica se é administrador */
  IsAdmin?: boolean;
  /** Indica se é super administrador */
  IsSuperAdmin?: boolean;
  /** Nome exibido no grupo (para usuários anônimos) */
  DisplayName?: string;
  /** Código de erro ao adicionar participante */
  Error?: number;
  /** Informações da solicitação de entrada */
  AddRequest?: {
    /** Código da solicitação */
    Code?: string;
    /** Data de expiração da solicitação */
    Expiration?: string;
  };
}

/**
 * Group model
 */
export interface Group {
  /** Identificador único do grupo */
  JID: string;
  /** JID do proprietário do grupo */
  OwnerJID?: string;
  /** Nome do grupo */
  Name?: string;
  /** Data da última alteração do nome */
  NameSetAt?: string;
  /** JID do usuário que definiu o nome */
  NameSetBy?: string;
  /** Descrição do grupo */
  Topic?: string;
  /** Indica se apenas administradores podem editar informações do grupo */
  IsLocked?: boolean;
  /** Indica se apenas administradores podem enviar mensagens */
  IsAnnounce?: boolean;
  /** Versão da configuração de anúncios */
  AnnounceVersionID?: string;
  /** Indica se as mensagens são temporárias */
  IsEphemeral?: boolean;
  /** Tempo em segundos para desaparecimento de mensagens */
  DisappearingTimer?: number;
  /** Indica se o grupo é incognito */
  IsIncognito?: boolean;
  /** Indica se é um grupo pai (comunidade) */
  IsParent?: boolean;
  /** Indica se requer aprovação para novos membros */
  IsJoinApprovalRequired?: boolean;
  /** JID da comunidade vinculada */
  LinkedParentJID?: string;
  /** Indica se é um subgrupo padrão da comunidade */
  IsDefaultSubGroup?: boolean;
  /** Data de criação do grupo */
  GroupCreated?: string;
  /** Versão da lista de participantes */
  ParticipantVersionID?: string;
  /** Lista de participantes do grupo */
  Participants?: GroupParticipant[];
  /** Modo de adição de novos membros */
  MemberAddMode?: GroupMemberAddMode;
  /** Verifica se é possível você enviar mensagens */
  OwnerCanSendMessage?: boolean;
  /** Verifica se você adminstrador do grupo */
  OwnerIsAdmin?: boolean;
  /** Se o grupo atual for uma comunidade, nesse campo mostrará o ID do subgrupo de avisos */
  DefaultSubGroupId?: string;
  /** Link de convite para entrar no grupo */
  invite_link?: string;
  /** Lista de solicitações de entrada, separados por vírgula */
  request_participants?: string;
}

// ---------------------------------
// Chatbot Trigger
// ---------------------------------

/**
 * Lead field types
 */
export type LeadField =
  | "lead_name"
  | "lead_fullName"
  | "lead_email"
  | "lead_personalid"
  | "lead_status"
  | "lead_tags"
  | "lead_notes"
  | "lead_isTicketOpen"
  | "lead_field01"
  | "lead_field02"
  | "lead_field03"
  | "lead_field04"
  | "lead_field05"
  | "lead_field06"
  | "lead_field07"
  | "lead_field08"
  | "lead_field09"
  | "lead_field10"
  | "lead_field11"
  | "lead_field12"
  | "lead_field13"
  | "lead_field14"
  | "lead_field15"
  | "lead_field16"
  | "lead_field17"
  | "lead_field18"
  | "lead_field19"
  | "lead_field20";

/**
 * Lead operators
 */
export type LeadOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "not_contains"
  | "greater"
  | "less"
  | "empty"
  | "not_empty";

/**
 * Chatbot trigger model
 */
export interface ChatbotTrigger {
  /** Identificador único do trigger */
  id?: string;
  /** Define se o trigger está ativo e disponível para uso */
  active?: boolean;
  /** Tipo do trigger */
  type: "agent" | "quickreply";
  /** ID do agente de IA. Obrigatório quando type='agent' */
  agent_id?: string;
  /** ID da resposta rápida. Obrigatório quando type='quickreply' */
  quickReply_id?: string;
  /** Define se o trigger deve ignorar mensagens de grupos */
  ignoreGroups?: boolean;
  /** Campo do lead usado para condição do trigger */
  lead_field?: LeadField;
  /** Operador de comparação para condição do lead */
  lead_operator?: LeadOperator;
  /** Valor para comparação com o campo do lead */
  lead_value?: string;
  /** Prioridade do trigger */
  priority?: number;
  /** Palavras-chave ou frases que ativam o trigger */
  wordsToStart?: string;
  /** Tempo de espera em segundos antes de executar o trigger */
  responseDelay_seconds?: number;
  /** Identificador do proprietário do trigger */
  owner?: string;
  /** Data e hora de criação */
  created?: string;
  /** Data e hora da última atualização */
  updated?: string;
}

// ---------------------------------
// Chatbot AI Agent
// ---------------------------------

/**
 * AI provider
 */
export type AIProvider = "openai" | "anthropic" | "gemini" | "custom";

/**
 * Chatbot AI agent model
 */
export interface ChatbotAIAgent {
  /** ID único gerado pelo sistema */
  id?: string;
  /** Nome de exibição do agente */
  name: string;
  /** Provedor do serviço de IA */
  provider: AIProvider;
  /** Nome do modelo LLM a ser utilizado */
  model: string;
  /** Chave de API para autenticação no provedor */
  apikey: string;
  /** Prompt base para orientar o comportamento do agente */
  basePrompt?: string;
  /** Número máximo de tokens por resposta */
  maxTokens?: number;
  /** Controle de criatividade (0-100) */
  temperature?: number;
  /** Nível de diversificação das respostas */
  diversityLevel?: number;
  /** Penalidade para repetição de frases */
  frequencyPenalty?: number;
  /** Penalidade para manter foco no tópico */
  presencePenalty?: number;
  /** Adiciona identificação do agente nas mensagens */
  signMessages?: boolean;
  /** Marca mensagens como lidas automaticamente */
  readMessages?: boolean;
  /** Tamanho máximo permitido para mensagens (caracteres) */
  maxMessageLength?: number;
  /** Atraso simulado de digitação em segundos */
  typingDelay_seconds?: number;
  /** Janela temporal para contexto da conversa */
  contextTimeWindow_hours?: number;
  /** Número máximo de mensagens no contexto */
  contextMaxMessages?: number;
  /** Número mínimo de mensagens para iniciar contexto */
  contextMinMessages?: number;
  /** Responsável/Proprietário do agente */
  owner?: string;
  /** Data de criação do registro */
  created?: string;
  /** Data da última atualização */
  updated?: string;
}

// ---------------------------------
// Chatbot AI Function
// ---------------------------------

/**
 * HTTP method
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

/**
 * Parameter type
 */
export type ParameterType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object";

/**
 * Function parameter
 */
export interface FunctionParameter {
  /** Nome do parâmetro */
  name: string;
  /** Tipo do parâmetro */
  type: ParameterType;
  /** Descrição do parâmetro */
  description: string;
  /** Indica se o parâmetro é obrigatório */
  required?: boolean;
  /** Lista de valores permitidos para parâmetros do tipo string, separados por vírgula */
  enum?: string;
  /** Valor mínimo para parâmetros numéricos */
  minimum?: number;
  /** Valor máximo para parâmetros numéricos */
  maximum?: number;
}

/**
 * Chatbot AI function model
 */
export interface ChatbotAIFunction {
  /** ID único da função gerado automaticamente */
  id?: string;
  /** Nome da função */
  name: string;
  /** Descrição da função */
  description: string;
  /** Indica se a função está ativa */
  active?: boolean;
  /** Método HTTP da requisição */
  method: HttpMethod;
  /** Endpoint da API */
  endpoint: string;
  /** Cabeçalhos da requisição */
  headers?: Record<string, string>;
  /** Corpo da requisição */
  body?: Record<string, any>;
  /** Parâmetros da função */
  parameters?: FunctionParameter[];
  /** Parâmetros não documentados */
  undocumentedParameters?: string;
  /** Indica erro de formatação nos cabeçalhos */
  header_error?: boolean;
  /** Indica erro de formatação no corpo */
  body_error?: boolean;
  /** Proprietário da função */
  owner?: string;
  /** Data de criação */
  created?: string;
  /** Data de atualização */
  updated?: string;
}

// ---------------------------------
// Chatbot AI Knowledge
// ---------------------------------

/**
 * Chatbot AI knowledge model
 */
export interface ChatbotAIKnowledge {
  /** ID único gerado automaticamente */
  id: string;
  /** Indica se o conhecimento está ativo */
  active: boolean;
  /** Título do conhecimento */
  tittle: string; // Note: API has a typo in the property name
  /** Conteúdo textual do conhecimento */
  content: string;
  /** Status da vetorização no sistema */
  vectorStatus?: string;
  /** Indica se o conteúdo foi vetorizado */
  isVectorized?: boolean;
  /** Timestamp da última vetorização */
  lastVectorizedAt?: number;
  /** Proprietário do conhecimento */
  owner?: string;
  /** Prioridade de uso do conhecimento */
  priority?: number;
  /** Data de criação */
  created?: string;
  /** Data de atualização */
  updated?: string;
}

// ---------------------------------
// Message Queue
// ---------------------------------

/**
 * Message queue model
 */
export interface MessageQueue {
  /** ID único da mensagem */
  id: string;
  /** ID da pasta que contém a mensagem */
  folder_id?: string;
  /** Tipo da mensagem */
  type?: string;
  /** Número de tentativas de envio */
  attempts?: number;
  /** Timestamp da última tentativa */
  last_attempt_at?: number;
  /** Mensagem de erro, se houver */
  error?: string;
  /** Status atual da mensagem */
  message_status?: string;
  /** ID da mensagem no WhatsApp */
  messageid?: string;
  /** Número de destino */
  number?: string;
  /** Atraso para envio em milissegundos */
  delay?: number;
  /** Menções na mensagem em formato JSON */
  mentions?: string;
  /** Texto da mensagem */
  text?: string;
  /** Habilitar preview de links */
  linkPreview?: boolean;
  /** URL ou path do arquivo anexado */
  file?: string;
  /** Nome do documento */
  docName?: string;
  /** Nome completo do contato */
  fullName?: string;
  /** Número de telefone do contato */
  phoneNumber?: string;
  /** Organização do contato */
  organization?: string;
  /** Email do contato */
  email?: string;
  /** URL associada ao contato */
  url?: string;
  /** Endereço do contato */
  address?: string;
  /** Latitude da localização */
  latitude?: number;
  /** Longitude da localização */
  longitude?: number;
  /** Nome da localização */
  name?: string;
  /** Texto do rodapé */
  footerText?: string;
  /** Texto do botão */
  buttonText?: string;
  /** Número de opções selecionáveis */
  selectableCount?: number;
  /** Opções do menu em formato JSON */
  choices?: string;
  /** Dono da instância */
  owner?: string;
  /** Data de criação */
  created?: string;
  /** Data da última atualização */
  updated?: string;
}

/**
 * Message queue folder model
 */
export interface MessageQueueFolder {
  /** Identificador único */
  id: string;
  /** Informações adicionais sobre a pasta */
  info?: string;
  /** Status atual da pasta */
  status?: string;
  /** Timestamp Unix para execução agendada */
  scheduled_for?: number;
  /** Atraso máximo entre mensagens em milissegundos */
  delayMax?: number;
  /** Atraso mínimo entre mensagens em milissegundos */
  delayMin?: number;
  /** Contagem de mensagens entregues */
  log_delivered?: number;
  /** Contagem de mensagens com falha */
  log_failed?: number;
  /** Contagem de mensagens reproduzidas (para áudio/vídeo) */
  log_played?: number;
  /** Contagem de mensagens lidas */
  log_read?: number;
  /** Contagem de mensagens enviadas com sucesso */
  log_sucess?: number;
  /** Contagem total de mensagens */
  log_total?: number;
  /** Identificador do proprietário da instância */
  owner?: string;
  /** Data e hora de criação */
  created?: string;
  /** Data e hora da última atualização */
  updated?: string;
}

// ---------------------------------
// Quick Reply
// ---------------------------------

/**
 * Quick reply model
 */
export interface QuickReply {
  /** ID único da resposta rápida */
  id?: string;
  /** Atalho para acionar a resposta */
  shortcut: string;
  /** Conteúdo da mensagem pré-definida */
  content: string;
  /** Categoria para organização */
  category?: string;
  /** Data de criação */
  createdAt?: string;
  /** Data da última atualização */
  updatedAt?: string;
}

// =============================================================================
// API Parameters
// =============================================================================

// ---------------------------------
// Send Messages
// ---------------------------------

/**
 * Base parameters for sending messages
 */
export interface SendMessageBaseParams {
  /** Número do destinatário (formato internacional) */
  number: string;
  /** ID da mensagem para responder */
  replyid?: string;
  /** Números para mencionar (separados por vírgula) */
  mentions?: string;
  /** Marca conversa como lida após envio */
  readchat?: boolean;
  /** Atraso em milissegundos antes do envio */
  delay?: number;
}

/**
 * Parameters for sending text messages
 */
export interface SendTextMessageParams extends SendMessageBaseParams {
  /** Texto da mensagem (aceita placeholders) */
  text: string;
  /** Ativa/desativa preview de links */
  linkPreview?: boolean;
}

/**
 * Media types for sending
 */
export type MediaType =
  | "image"
  | "video"
  | "document"
  | "audio"
  | "myaudio"
  | "ptt"
  | "sticker";

/**
 * Parameters for sending media messages
 */
export interface SendMediaMessageParams extends SendMessageBaseParams {
  /** Tipo de mídia */
  type: MediaType;
  /** URL ou base64 do arquivo */
  file: string;
  /** Texto descritivo (caption) - aceita placeholders */
  text?: string;
  /** Nome do arquivo (apenas para documents) */
  docName?: string;
  /** MIME type do arquivo (opcional) */
  mimetype?: string;
}

/**
 * Menu types
 */
export type MenuType = "list" | "poll";

/**
 * Parameters for sending interactive menus
 */
export interface SendMenuParams extends SendMessageBaseParams {
  /** Tipo do menu (list, poll) */
  type: MenuType;
  /** Texto principal (aceita placeholders) */
  text: string;
  /** Texto do rodapé (opcional) */
  footerText?: string;
  /** Texto do botão principal */
  buttonText: string;
  /** Número máximo de opções selecionáveis (para enquetes) */
  selectableCount?: number;
  /** Lista de opções. Use [Título] para seções em listas */
  choices: string[];
}

/**
 * Parameters for sending contact cards
 */
export interface SendContactParams extends SendMessageBaseParams {
  /** Nome completo do contato */
  fullName: string;
  /** Números de telefone (separados por vírgula) */
  phoneNumber: string;
  /** Nome da organização/empresa */
  organization?: string;
  /** Endereço de email */
  email?: string;
  /** URL pessoal ou da empresa */
  url?: string;
  /** Endereço */
  address?: string;
}

/**
 * Parameters for sending location
 */
export interface SendLocationParams extends SendMessageBaseParams {
  /** Nome do local */
  name?: string;
  /** Endereço completo do local */
  address?: string;
  /** Latitude (-90 a 90) */
  latitude: number;
  /** Longitude (-180 a 180) */
  longitude: number;
}

/**
 * Presence types
 */
export type PresenceType = "composing" | "recording" | "paused";

/**
 * Parameters for sending presence updates
 */
export interface SendPresenceParams {
  /** Número do destinatário */
  number: string;
  /** Tipo de presença a ser enviada */
  presence: PresenceType;
  /** Duração em milissegundos que a presença ficará ativa */
  delay?: number;
}

/**
 * Status types
 */
export type StatusType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "myaudio"
  | "ptt";

/**
 * Parameters for sending status (stories)
 */
export interface SendStatusParams {
  /** Tipo do status */
  type: StatusType;
  /** Texto principal ou legenda */
  text?: string;
  /** Código da cor de fundo */
  background_color?: number;
  /** Estilo da fonte (apenas para type=text) */
  font?: number;
  /** URL ou Base64 do arquivo de mídia */
  file?: string;
  /** URL ou Base64 da miniatura (opcional para vídeos) */
  thumbnail?: string;
  /** MIME type do arquivo (opcional) */
  mimetype?: string;
}

// ---------------------------------
// Message Actions
// ---------------------------------

/**
 * Parameters for downloading files from messages
 */
export interface MessageDownloadParams {
  /** ID da mensagem contendo o arquivo */
  id: string;
  /** Se verdadeiro, transcreve áudios para texto */
  transcribe?: boolean;
}

/**
 * Parameters for finding messages
 */
export interface MessageFindParams {
  /** ID do chat no formato internacional */
  chatid: string;
  /** Número máximo de mensagens a retornar (1-100) */
  limit?: number;
}

/**
 * Parameters for marking messages as read
 */
export interface MessageMarkReadParams {
  /** Lista de IDs das mensagens a serem marcadas como lidas */
  id: string[];
}

/**
 * Parameters for reacting to messages
 */
export interface MessageReactParams {
  /** Número do chat no formato internacional */
  number: string;
  /** Emoji Unicode da reação (ou string vazia para remover reação) */
  text: string;
  /** ID da mensagem que receberá a reação */
  id: string;
}

/**
 * Parameters for deleting messages
 */
export interface MessageDeleteParams {
  /** ID da mensagem a ser apagada */
  id: string;
}

// ---------------------------------
// Groups
// ---------------------------------

/**
 * Parameters for creating groups
 */
export interface GroupCreateParams {
  /** Nome do grupo */
  name: string;
  /** Lista de números de telefone dos participantes iniciais */
  participants: string[];
}

/**
 * Parameters for getting group info
 */
export interface GroupInfoParams {
  /** Identificador único do grupo (JID) */
  groupjid: string;
  /** Recuperar link de convite do grupo */
  getInviteLink?: boolean;
  /** Recuperar lista de solicitações pendentes de participação */
  getRequestsParticipants?: boolean;
  /** Forçar atualização, ignorando cache */
  force?: boolean;
}

/**
 * Parameters for getting info from invite code
 */
export interface GroupInviteInfoParams {
  /** Código de convite ou URL completo do grupo */
  inviteCode: string;
}

/**
 * Parameters for joining a group
 */
export interface GroupJoinParams {
  /** Código de convite ou URL completo do grupo */
  inviteCode: string;
}

/**
 * Parameters for leaving a group
 */
export interface GroupLeaveParams {
  /** Identificador único do grupo (JID) */
  groupjid: string;
}

/**
 * Parameters for updating group settings
 */
export interface GroupUpdateParams {
  /** Identificador único do grupo (JID) */
  groupjid: string;
}

/**
 * Parameters for updating group announce setting
 */
export interface GroupUpdateAnnounceParams extends GroupUpdateParams {
  /** Controla quem pode enviar mensagens no grupo */
  announce: boolean;
}

/**
 * Parameters for updating group description
 */
export interface GroupUpdateDescriptionParams extends GroupUpdateParams {
  /** Nova descrição/tópico do grupo */
  description: string;
}

/**
 * Parameters for updating group image
 */
export interface GroupUpdateImageParams extends GroupUpdateParams {
  /** URL da imagem, string base64 ou "remove"/"delete" para remover */
  image: string;
}

/**
 * Parameters for updating group lock setting
 */
export interface GroupUpdateLockedParams extends GroupUpdateParams {
  /** Define permissões de edição */
  locked: boolean;
}

/**
 * Parameters for updating group name
 */
export interface GroupUpdateNameParams extends GroupUpdateParams {
  /** Novo nome para o grupo */
  name: string;
}

/**
 * Group participant action types
 */
export type GroupParticipantAction =
  | "add"
  | "remove"
  | "promote"
  | "demote"
  | "approve"
  | "reject";

/**
 * Parameters for updating group participants
 */
export interface GroupUpdateParticipantsParams extends GroupUpdateParams {
  /** Ação a ser executada */
  action: GroupParticipantAction;
  /** Lista de números de telefone ou JIDs dos participantes */
  participants: string[];
}

/**
 * Parameters for creating a community
 */
export interface CommunityCreateParams {
  /** Nome da comunidade */
  name: string;
}

/**
 * Community action types
 */
export type CommunityAction = "add" | "remove";

/**
 * Parameters for updating community groups
 */
export interface CommunityUpdateGroupsParams {
  /** JID (identificador único) da comunidade */
  community: string;
  /** Tipo de operação a ser realizada */
  action: CommunityAction;
  /** Lista de JIDs dos grupos para adicionar ou remover */
  groupjids: string[];
}

// ---------------------------------
// Chats
// ---------------------------------

/**
 * Parameters for block/unblock chat
 */
export interface ChatBlockParams {
  /** Número do WhatsApp no formato internacional */
  number: string;
  /** True para bloquear, False para desbloquear */
  block: boolean;
}

/**
 * Parameters for managing labels on a chat
 */
export interface ChatLabelsParams {
  /** Número do chat ou grupo */
  number: string;
  /** Lista de IDs das labels a serem aplicadas ao chat */
  labelids: string[];
}

/**
 * Parameters for deleting a chat
 */
export interface ChatDeleteParams {
  /** Número do chat no formato internacional */
  number: string;
  /** Se true, deleta o chat do banco de dados */
  deleteChatDB?: boolean;
  /** Se true, deleta todas as mensagens do chat do banco de dados */
  deleteMessagesDB?: boolean;
  /** Se true, deleta o chat do WhatsApp */
  deleteChatWhatsApp?: boolean;
}

/**
 * Parameters for archiving/unarchiving chat
 */
export interface ChatArchiveParams {
  /** Número do telefone (formato E.164) ou ID do grupo */
  number: string;
  /** true para arquivar, false para desarquivar */
  archive: boolean;
}

/**
 * Parameters for marking chat as read/unread
 */
export interface ChatReadParams {
  /** Identificador do chat */
  number: string;
  /** true: marca o chat como lido, false: marca o chat como não lido */
  read: boolean;
}

/**
 * Parameters for muting a chat
 */
export interface ChatMuteParams {
  /** ID do chat */
  number: string;
  /** Duração do silenciamento: 0, 8, 168 ou -1 */
  muteEndTime: 0 | 8 | 168 | -1;
}

/**
 * Parameters for pinning/unpinning a chat
 */
export interface ChatPinParams {
  /** Número do chat ou ID do grupo */
  number: string;
  /** Define se o chat deve ser fixado (true) ou desafixado (false) */
  pin: boolean;
}

/**
 * Parameters for filtering chats
 */
export interface ChatFindParams {
  /** Operador lógico entre os filtros */
  operator?: "AND" | "OR";
  /** Campo para ordenação (+/-campo). Ex -wa_lastMsgTimestamp */
  sort?: string;
  /** Limite de resultados por página */
  limit?: number;
  /** Offset para paginação */
  offset?: number;
  /** Campos filtráveis (mesmo estrutura do modelo Chat) */
  [key: string]: any;
}

/**
 * Parameters for getting chat name and image
 */
export interface ChatNameAndImageParams {
  /** Número do telefone ou ID do grupo */
  number: string;
  /** Define se deve retornar URL de preview da imagem */
  preview?: boolean;
}

/**
 * Parameters for checking numbers on WhatsApp
 */
export interface ChatCheckParams {
  /** Lista de números ou IDs de grupo para verificar */
  numbers?: string[];
  /** Número único para verificação (alternativa a numbers) */
  query?: string;
}

// ---------------------------------
// CRM
// ---------------------------------

/**
 * Parameters for updating fields mapping
 */
export interface UpdateFieldsMapParams {
  /** Campos personalizados mapeados */
  [key: string]: string;
}

/**
 * Parameters for editing lead information
 */
export interface EditLeadParams {
  /** Identificador do chat */
  id: string;
  /** Timestamp UTC até quando o chatbot deve ficar desativado para este chat */
  chatbot_disableUntil?: number;
  /** Status do ticket associado ao lead */
  lead_isTicketOpen?: boolean;
  /** ID do atendente atribuído ao lead */
  lead_assignedAttendant_id?: string;
  /** Posição do card no quadro kanban */
  lead_kanbanOrder?: number;
  /** Lista de tags associadas ao lead */
  lead_tags?: string[];
  /** Nome principal do lead */
  lead_name?: string;
  /** Nome completo do lead */
  lead_fullName?: string;
  /** Email do lead */
  lead_email?: string;
  /** Documento de identificação (CPF/CNPJ) */
  lead_personalId?: string;
  /** Status do lead no funil de vendas */
  lead_status?: string;
  /** Anotações sobre o lead */
  lead_notes?: string;
  /** Campos personalizados */
  [key: string]: any;
}

// ---------------------------------
// Message Queue
// ---------------------------------

/**
 * Parameters for simple mass sender
 */
export interface SenderSimpleParams {
  /** Lista de números para envio */
  numbers: string[];
  /** Tipo da mensagem */
  type: string;
  /** Nome da campanha de envio */
  folder?: string;
  /** Delay mínimo entre mensagens em segundos */
  delayMin: number;
  /** Delay máximo entre mensagens em segundos */
  delayMax: number;
  /** Timestamp em milissegundos ou minutos a partir de agora para agendamento */
  scheduled_for: number;
  /** Informações adicionais sobre a campanha */
  info?: string;
  /** Delay fixo entre mensagens (opcional) */
  delay?: number;
  /** Menções na mensagem em formato JSON */
  mentions?: string;
  /** Texto da mensagem */
  text?: string;
  /** Habilitar preview de links em mensagens de texto */
  linkPreview?: boolean;
  /** Texto do rodapé */
  footerText?: string;
  /** Texto do botão */
  buttonText?: string;
  /** Opções do menu em formato JSON */
  choices?: string[];
  /** Outras propriedades baseadas no tipo da mensagem */
  [key: string]: any;
}

/**
 * Message definition for advanced sender
 */
export interface SenderAdvancedMessage {
  /** ID do chat ou número do destinatário */
  number: string;
  /** Tipo da mensagem */
  type: string;
  /** Texto da mensagem (quando type é "text") ou legenda para mídia */
  text?: string;
  /** URL da mídia */
  file?: string;
  /** Nome do arquivo (quando type é document) */
  docName?: string;
  /** Se deve gerar preview de links (quando type é text) */
  linkPreview?: boolean;
  /** Nome completo (quando type é contact) */
  fullName?: string;
  /** Número do telefone (quando type é contact) */
  phoneNumber?: string;
  /** Organização (quando type é contact) */
  organization?: string;
  /** Email (quando type é contact) */
  email?: string;
  /** URL (quando type é contact) */
  url?: string;
  /** Latitude (quando type é location) */
  latitude?: number;
  /** Longitude (quando type é location) */
  longitude?: number;
  /** Nome do local (quando type é location) */
  name?: string;
  /** Endereço (quando type é location) */
  address?: string;
  /** Texto do rodapé (quando type é list, ou poll) */
  footerText?: string;
  /** Texto do botão (quando type é list, ou poll) */
  buttonText?: string;
  /** Quantidade de opções selecionáveis (quando type é poll) */
  selectableCount?: number;
  /** Lista de opções (quando type é list, ou poll) */
  choices?: string[];
  /** Outras propriedades específicas do tipo */
  [key: string]: any;
}

/**
 * Parameters for advanced mass sender
 */
export interface SenderAdvancedParams {
  /** Delay mínimo entre mensagens (segundos) */
  delayMin?: number;
  /** Delay máximo entre mensagens (segundos) */
  delayMax?: number;
  /** Descrição ou informação sobre o envio em massa */
  info?: string;
  /** Timestamp ou minutos para agendamento */
  scheduled_for?: number;
  /** Lista de mensagens a serem enviadas */
  messages: SenderAdvancedMessage[];
}

/**
 * Parameters for editing sender campaign
 */
export interface SenderEditParams {
  /** Identificador único da campanha de envio */
  folder_id: string;
  /** Ação a ser executada na campanha */
  action: "stop" | "continue" | "delete";
}

/**
 * Parameters for listing sender messages
 */
export interface SenderListMessagesParams {
  /** ID da campanha a ser consultada */
  folder_id: string;
  /** Status das mensagens para filtrar */
  messageStatus?: "Scheduled" | "Sent" | "Failed";
  /** Número da página para paginação */
  page?: number;
  /** Quantidade de itens por página */
  pageSize?: number;
}

// ---------------------------------
// Chatbot
// ---------------------------------

/**
 * Parameters for updating chatbot settings
 */
export interface UpdateChatbotSettingsParams {
  /** Chave da API OpenAI */
  openai_apikey?: string;
  /** Habilita/desabilita o chatbot */
  chatbot_enabled?: boolean;
  /** Define se o chatbot deve ignorar mensagens de grupos */
  chatbot_ignoreGroups?: boolean;
  /** Palavra-chave que os usuários podem usar para parar o chatbot */
  chatbot_stopConversation?: string;
  /** Por quantos minutos o chatbot deve ficar desativado após receber o comando de parada */
  chatbot_stopMinutes?: number;
  /** Por quantos minutos o chatbot deve ficar desativado após você enviar uma mensagem fora da API */
  chatbot_stopWhenYouSendMsg?: number;
}

/**
 * Parameters for editing a trigger
 */
export interface TriggerEditParams {
  /** ID do trigger. Vazio para criação, obrigatório para atualização/exclusão */
  id?: string;
  /** Quando verdadeiro, exclui o trigger especificado pelo id */
  delete?: boolean;
  /** Configuração do trigger */
  trigger: ChatbotTrigger;
}

/**
 * Parameters for editing an agent
 */
export interface AgentEditParams {
  /** ID do agente. Vazio para criação, obrigatório para atualização/exclusão */
  id?: string;
  /** Quando verdadeiro, exclui o agente especificado pelo id */
  delete?: boolean;
  /** Configuração do agente */
  agent: ChatbotAIAgent;
}

/**
 * Parameters for editing a function
 */
export interface FunctionEditParams {
  /** ID da função. Vazio para criação, obrigatório para atualização/exclusão */
  id?: string;
  /** Quando verdadeiro, exclui a função especificada pelo id */
  delete?: boolean;
  /** Configuração da função */
  function: Omit<ChatbotAIFunction, "id">;
}

/**
 * File type for knowledge
 */
export type KnowledgeFileType = "pdf" | "txt" | "html" | "csv";

/**
 * Parameters for editing knowledge
 */
export interface KnowledgeEditParams {
  /** ID do conhecimento (vazio para criar novo) */
  id?: string;
  /** Define se é uma operação de exclusão */
  delete?: boolean;
  /** Configuração do conhecimento */
  knowledge: {
    /** Status de ativação do conhecimento */
    isActive?: boolean;
    /** Título identificador do conhecimento */
    tittle: string;
    /** Conteúdo textual, URL ou Base64 */
    content: string;
  };
  /** Tipo do arquivo quando não detectado automaticamente */
  fileType?: KnowledgeFileType;
}

// ---------------------------------
// Labels
// ---------------------------------

/**
 * Parameters for editing a label
 */
export interface LabelEditParams {
  /** ID da etiqueta a ser editada */
  labelid: string;
  /** Novo nome da etiqueta */
  name?: string;
  /** Código numérico da nova cor (0-19) */
  color?: number;
  /** Indica se a etiqueta deve ser deletada */
  delete?: boolean;
}

// ---------------------------------
// Quick Replies
// ---------------------------------

/**
 * Parameters for editing a quick reply
 */
export interface QuickReplyEditParams {
  /** ID da resposta rápida (omitir para criar nova) */
  id?: string;
  /** Definir como true para excluir o template */
  delete?: boolean;
  /** Atalho para acesso rápido ao template */
  shortCut: string;
  /** Tipo da mensagem */
  type: MediaType | "text";
  /** Texto para mensagens do tipo texto */
  text?: string;
  /** URL ou Base64 para tipos de mídia */
  file?: string;
  /** Nome do arquivo opcional para tipo documento */
  docName?: string;
}

// =============================================================================
// API Client Implementation
// =============================================================================

/**
 * Generic API request method
 */
type ApiRequestMethod = "GET" | "POST" | "PUT" | "DELETE";

/**
 * Main UAZAPI SDK client class
 */
export class UazapiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly adminToken?: string;
  private readonly timeout: number;
  private readonly retry: boolean;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  /** Instance management methods */
  public instance: InstanceResource;
  /** Webhook management methods */
  public webhook: WebhookResource;
  /** Sender management methods */
  public sender: SenderResource;
  /** Message management methods */
  public message: MessageResource;
  /** Chat management methods */
  public chat: ChatResource;
  /** Group management methods */
  public group: GroupResource;
  /** Agent management methods */
  public agent: AgentResource;
  /** Label management methods */
  public label: LabelResource;
  /** Attendant management methods */
  public attendant: AttendantResource;
  /** Chatbot management methods */
  public chatbot: ChatbotResource;
  /** Admin management methods */
  public admin: AdminResource;
  /** Quick reply management methods */
  public quickReply: QuickReplyResource;

  /**
   * Create a new UAZAPI client instance
   *
   * @param config - Configuration for the client
   */
  constructor(config: UazapiConfig) {
    this.baseUrl = config.baseUrl || "https://free.uazapi.com";
    this.token = config.token;
    this.adminToken = config.adminToken;
    this.timeout = config.timeout || 30000;
    this.retry = config.retry ?? true;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;

    // Initialize resources
    this.instance = new InstanceResource(this);
    this.webhook = new WebhookResource(this);
    this.sender = new SenderResource(this);
    this.message = new MessageResource(this);
    this.chat = new ChatResource(this);
    this.group = new GroupResource(this);
    this.agent = new AgentResource(this);
    this.label = new LabelResource(this);
    this.attendant = new AttendantResource(this);
    this.chatbot = new ChatbotResource(this);
    this.admin = new AdminResource(this);
    this.quickReply = new QuickReplyResource(this);
  }

  /**
   * Make a request to the API
   *
   * @param method - HTTP method
   * @param path - API path (without leading slash)
   * @param data - Request data (for POST/PUT)
   * @param useAdminToken - Whether to use admin token instead of instance token
   * @param retryCount - Current retry count (internal)
   */
  async request<T = any>(
    method: ApiRequestMethod,
    path: string,
    data?: any,
    useAdminToken = false,
    retryCount = 0,
  ): Promise<T> {
    const url = `${this.baseUrl}/${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add authentication token
    if (useAdminToken && this.adminToken) {
      headers["admintoken"] = this.adminToken;
    } else {
      headers["token"] = this.token;
    }

    try {
      // Create request options
      const options: RequestInit = {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined,
      };

      // Add timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);
      options.signal = controller.signal;

      // Make the request
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      // Parse response
      const responseData = await response.json();

      // Handle error responses
      if (!response.ok) {
        const error = new UazapiError(
          responseData.error || `HTTP error ${response.status}`,
          response.status,
          responseData,
        );

        // Retry if enabled and not reached max retries
        if (
          this.retry &&
          retryCount < this.maxRetries &&
          shouldRetry(response.status)
        ) {
          const delay = this.retryDelay * Math.pow(2, retryCount);
          await sleep(delay);
          return this.request<T>(
            method,
            path,
            data,
            useAdminToken,
            retryCount + 1,
          );
        }

        throw error;
      }

      return responseData;
    } catch (error) {
      // Retry on network errors if enabled and not reached max retries
      if (
        this.retry &&
        retryCount < this.maxRetries &&
        error instanceof Error &&
        isNetworkError(error)
      ) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        await sleep(delay);
        return this.request<T>(
          method,
          path,
          data,
          useAdminToken,
          retryCount + 1,
        );
      }

      // Rethrow as UazapiError if it's not already
      if (error instanceof UazapiError) {
        throw error;
      }

      throw new UazapiError(
        error instanceof Error ? error.message : "Unknown error",
        0,
        error,
      );
    }
  }
}

/**
 * Instance resource for managing WhatsApp instances
 */
export class InstanceResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * Get the status of the current instance
   */
  async getStatus(): Promise<InstanceStatusResponse> {
    return this.client.request<InstanceStatusResponse>(
      "GET",
      "instance/status",
    );
  }

  /**
   * Connect the instance to WhatsApp
   *
   * @param params - Connection parameters
   */
  async connect(
    params?: ConnectInstanceParams,
  ): Promise<InstanceStatusResponse> {
    return this.client.request<InstanceStatusResponse>(
      "POST",
      "instance/connect",
      params,
    );
  }

  /**
   * Disconnect the instance from WhatsApp
   */
  async disconnect(): Promise<{
    instance: Instance;
    response: string;
    info: string;
  }> {
    return this.client.request<{
      instance: Instance;
      response: string;
      info: string;
    }>("POST", "instance/disconnect");
  }

  /**
   * Hibernate the instance (pause connection but keep session)
   */
  async hibernate(): Promise<{
    instance: Instance;
    response: string;
    info: string;
  }> {
    return this.client.request<{
      instance: Instance;
      response: string;
      info: string;
    }>("POST", "instance/hibernate");
  }

  /**
   * Update the instance name
   *
   * @param name - New name for the instance
   */
  async updateName(name: string): Promise<Instance> {
    return this.client.request<Instance>(
      "POST",
      "instance/updateinstancename",
      { name },
    );
  }

  /**
   * Delete the instance
   */
  async delete(): Promise<{ response: string; info: string }> {
    return this.client.request<{ response: string; info: string }>(
      "DELETE",
      "instance",
    );
  }

  /**
   * Update chatbot settings for the instance
   *
   * @param settings - Chatbot settings
   */
  async updateChatbotSettings(
    settings: UpdateChatbotSettingsParams,
  ): Promise<Instance> {
    return this.client.request<Instance>(
      "POST",
      "instance/updatechatbotsettings",
      settings,
    );
  }

  /**
   * Update fields mapping for CRM
   *
   * @param fieldsMap - Field mapping configuration
   */
  async updateFieldsMap(fieldsMap: UpdateFieldsMapParams): Promise<Instance> {
    return this.client.request<Instance>(
      "POST",
      "instance/updateFieldsMap",
      fieldsMap,
    );
  }
}

/**
 * Webhook resource for managing webhooks
 */
export class WebhookResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * Get current webhook configuration
   */
  async get(): Promise<Webhook[]> {
    return this.client.request<Webhook[]>("GET", "webhook");
  }

  /**
   * Set webhook configuration
   *
   * @param webhook - Webhook configuration
   */
  async set(webhook: Webhook): Promise<Webhook[]> {
    return this.client.request<Webhook[]>("POST", "webhook", {
      ...webhook,
      action: webhook.id ? "update" : "add",
    });
  }

  /**
   * Delete webhook configuration
   *
   * @param webhookId - ID of the webhook to delete
   */
  async delete(webhookId: string): Promise<Webhook[]> {
    return this.client.request<Webhook[]>("POST", "webhook", {
      id: webhookId,
      action: "delete",
    });
  }
}

/**
 * Sender resource for managing mass message campaigns
 */
export class SenderResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * Create a simple mass message campaign
   *
   * @param params - Simple sender parameters
   */
  async simple(
    params: SenderSimpleParams,
  ): Promise<{ folder_id: string; count: number; status: string }> {
    return this.client.request<{
      folder_id: string;
      count: number;
      status: string;
    }>("POST", "sender/simple", params);
  }

  /**
   * Create an advanced mass message campaign
   *
   * @param params - Advanced sender parameters
   */
  async advanced(
    params: SenderAdvancedParams,
  ): Promise<{ folder_id: string; count: number; status: string }> {
    return this.client.request<{
      folder_id: string;
      count: number;
      status: string;
    }>("POST", "sender/advanced", params);
  }

  /**
   * Edit mass message campaign (stop, continue, delete)
   *
   * @param params - Edit parameters
   */
  async edit(params: SenderEditParams): Promise<{ deleted: number }> {
    return this.client.request<{ deleted: number }>(
      "POST",
      "sender/edit",
      params,
    );
  }

  /**
   * Clear completed messages from the queue
   *
   * @param hours - Number of hours to keep messages (default: 168 - 7 days)
   */
  async clearDone(hours: number = 168): Promise<{ status: string }> {
    return this.client.request<{ status: string }>("POST", "sender/cleardone", {
      hours,
    });
  }

  /**
   * Clear all messages from the queue
   */
  async clearAll(): Promise<{ info: string }> {
    return this.client.request<{ info: string }>("DELETE", "sender/clearall");
  }

  /**
   * List all campaigns
   *
   * @param status - Filter by status (Active, Archived)
   */
  async listFolders(
    status?: "Active" | "Archived",
  ): Promise<MessageQueueFolder[]> {
    const queryParams = status ? `?status=${status}` : "";
    return this.client.request<MessageQueueFolder[]>(
      "GET",
      `sender/listfolders${queryParams}`,
    );
  }

  /**
   * List messages in a campaign
   *
   * @param params - List parameters
   */
  async listMessages(params: SenderListMessagesParams): Promise<{
    messages: MessageQueue[];
    pagination: {
      total: number;
      page: number;
      pageSize: number;
      lastPage: number;
    };
  }> {
    return this.client.request<{
      messages: MessageQueue[];
      pagination: {
        total: number;
        page: number;
        pageSize: number;
        lastPage: number;
      };
    }>("POST", "sender/listmessages", params);
  }
}

/**
 * Message resource for sending and managing messages
 */
export class MessageResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * Send a text message
   *
   * @param params - Text message parameters
   */
  async sendText(params: SendTextMessageParams): Promise<Message> {
    return this.client.request<Message>("POST", "send/text", params);
  }

  /**
   * Send a media message (image, video, document, audio)
   *
   * @param params - Media message parameters
   */
  async sendMedia(params: SendMediaMessageParams): Promise<Message> {
    return this.client.request<Message>("POST", "send/media", params);
  }

  /**
   * Send an interactive menu (list or poll)
   *
   * @param params - Menu parameters
   */
  async sendMenu(params: SendMenuParams): Promise<Message> {
    return this.client.request<Message>("POST", "send/menu", params);
  }

  /**
   * Send a contact card
   *
   * @param params - Contact parameters
   */
  async sendContact(params: SendContactParams): Promise<Message> {
    return this.client.request<Message>("POST", "send/contact", params);
  }

  /**
   * Send a location
   *
   * @param params - Location parameters
   */
  async sendLocation(params: SendLocationParams): Promise<Message> {
    return this.client.request<Message>("POST", "send/location", params);
  }

  /**
   * Send a presence update (typing/recording)
   *
   * @param params - Presence parameters
   */
  async sendPresence(
    params: SendPresenceParams,
  ): Promise<{ response: string }> {
    return this.client.request<{ response: string }>(
      "POST",
      "message/presence",
      params,
    );
  }

  /**
   * Send a WhatsApp story/status
   *
   * @param params - Status parameters
   */
  async sendStatus(params: SendStatusParams): Promise<{
    Id: string;
    content: any;
    messageTimestamp: number;
    status: string;
  }> {
    return this.client.request<{
      Id: string;
      content: any;
      messageTimestamp: number;
      status: string;
    }>("POST", "send/status", params);
  }

  /**
   * Download media from a message
   *
   * @param params - Download parameters
   */
  async download(params: MessageDownloadParams): Promise<{
    fileURL: string;
    mimetype: string;
    transcription?: string;
  }> {
    return this.client.request<{
      fileURL: string;
      mimetype: string;
      transcription?: string;
    }>("POST", "message/download", params);
  }

  /**
   * Find messages in a chat
   *
   * @param params - Find parameters
   */
  async find(params: MessageFindParams): Promise<{ messages: Message[] }> {
    return this.client.request<{ messages: Message[] }>(
      "POST",
      "message/find",
      params,
    );
  }

  /**
   * Mark messages as read
   *
   * @param params - Mark read parameters
   */
  async markRead(params: MessageMarkReadParams): Promise<{
    results: Array<{
      message_id: string;
      status: "success" | "error";
      error?: string;
    }>;
  }> {
    return this.client.request<{
      results: Array<{
        message_id: string;
        status: "success" | "error";
        error?: string;
      }>;
    }>("POST", "message/markread", params);
  }

  /**
   * React to a message
   *
   * @param params - React parameters
   */
  async react(params: MessageReactParams): Promise<Message> {
    return this.client.request<Message>("POST", "message/react", params);
  }

  /**
   * Delete a message
   *
   * @param params - Delete parameters
   */
  async delete(
    params: MessageDeleteParams,
  ): Promise<{ timestamp: string; id: string }> {
    return this.client.request<{ timestamp: string; id: string }>(
      "POST",
      "message/delete",
      params,
    );
  }
}

/**
 * Chat resource for managing chats
 */
export class ChatResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * Block or unblock a contact
   *
   * @param params - Block parameters
   */
  async block(params: ChatBlockParams): Promise<{
    response: string;
    blockList: string[];
  }> {
    return this.client.request<{
      response: string;
      blockList: string[];
    }>("POST", "chats/block", params);
  }

  /**
   * Get a list of blocked contacts
   */
  async getBlockList(): Promise<{ blockList: string[] }> {
    return this.client.request<{ blockList: string[] }>(
      "GET",
      "chats/blocklist",
    );
  }

  /**
   * Update labels for a chat
   *
   * @param params - Labels parameters
   */
  async updateLabels(params: ChatLabelsParams): Promise<{
    response: string;
    editions: string[];
  }> {
    return this.client.request<{
      response: string;
      editions: string[];
    }>("POST", "chats/labels", params);
  }

  /**
   * Delete a chat
   *
   * @param params - Delete parameters
   */
  async delete(params: ChatDeleteParams): Promise<{
    response: string;
    actions: string[];
    errors?: string[];
  }> {
    return this.client.request<{
      response: string;
      actions: string[];
      errors?: string[];
    }>("POST", "chats/delete", params);
  }

  /**
   * Archive or unarchive a chat
   *
   * @param params - Archive parameters
   */
  async archive(params: ChatArchiveParams): Promise<{ response: string }> {
    return this.client.request<{ response: string }>(
      "POST",
      "chat/archive",
      params,
    );
  }

  /**
   * Mark a chat as read or unread
   *
   * @param params - Read parameters
   */
  async read(params: ChatReadParams): Promise<{ response: string }> {
    return this.client.request<{ response: string }>(
      "POST",
      "chats/read",
      params,
    );
  }

  /**
   * Mute a chat
   *
   * @param params - Mute parameters
   */
  async mute(params: ChatMuteParams): Promise<{ response: string }> {
    return this.client.request<{ response: string }>(
      "POST",
      "chats/mute",
      params,
    );
  }

  /**
   * Pin or unpin a chat
   *
   * @param params - Pin parameters
   */
  async pin(params: ChatPinParams): Promise<{ response: string }> {
    return this.client.request<{ response: string }>(
      "POST",
      "chats/pin",
      params,
    );
  }

  /**
   * Find chats with filters
   *
   * @param params - Find parameters
   */
  async find(params: ChatFindParams): Promise<{
    chats: Chat[];
    totalChatsStats: any;
    pagination: {
      totalRecords: number;
      pageSize: number;
      currentPage: number;
      totalPages: number;
    };
  }> {
    return this.client.request<{
      chats: Chat[];
      totalChatsStats: any;
      pagination: {
        totalRecords: number;
        pageSize: number;
        currentPage: number;
        totalPages: number;
      };
    }>("POST", "chat/find", params);
  }

  /**
   * Get chat counters
   */
  async count(): Promise<{
    total_chats: number;
    unread_chats: number;
    archived_chats: number;
    pinned_chats: number;
    blocked_chats: number;
    groups: number;
    admin_groups: number;
    member_groups: number;
  }> {
    return this.client.request<{
      total_chats: number;
      unread_chats: number;
      archived_chats: number;
      pinned_chats: number;
      blocked_chats: number;
      groups: number;
      admin_groups: number;
      member_groups: number;
    }>("GET", "chats/count");
  }

  /**
   * Edit lead information
   *
   * @param params - Edit lead parameters
   */
  async editLead(params: EditLeadParams): Promise<Chat> {
    return this.client.request<Chat>("POST", "chat/editLead", params);
  }

  /**
   * Get chat name and image URL
   *
   * @param params - Get name and image parameters
   */
  async getNameAndImageUrl(params: ChatNameAndImageParams): Promise<{
    id: string;
    wa_fastid: string;
    wa_chatid: string;
    wa_name: string;
    name: string;
    phone: string;
    owner: string;
    lead_tags: string[];
    wa_label: string[];
    imagePreview: string;
    image: string;
    lead_name: string;
    lead_fullName: string;
    wa_contactName: string;
  }> {
    return this.client.request<{
      id: string;
      wa_fastid: string;
      wa_chatid: string;
      wa_name: string;
      name: string;
      phone: string;
      owner: string;
      lead_tags: string[];
      wa_label: string[];
      imagePreview: string;
      image: string;
      lead_name: string;
      lead_fullName: string;
      wa_contactName: string;
    }>("POST", "chat/getNameAndImageUrl", params);
  }

  /**
   * Check if numbers are on WhatsApp
   *
   * @param params - Check parameters
   */
  async check(params: ChatCheckParams): Promise<
    Array<{
      query: string;
      jid: string;
      isInWhatsapp: boolean;
      verifiedName?: string;
      groupName?: string;
      error?: string;
    }>
  > {
    return this.client.request<
      Array<{
        query: string;
        jid: string;
        isInWhatsapp: boolean;
        verifiedName?: string;
        groupName?: string;
        error?: string;
      }>
    >("POST", "chat/check", params);
  }
}

/**
 * Group resource for managing WhatsApp groups
 */
export class GroupResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * Create a new group
   *
   * @param params - Create parameters
   */
  async create(params: GroupCreateParams): Promise<Group> {
    return this.client.request<Group>("POST", "group/create", params);
  }

  /**
   * Get information about a group
   *
   * @param params - Info parameters
   */
  async getInfo(params: GroupInfoParams): Promise<Group> {
    return this.client.request<Group>("POST", "group/info", params);
  }

  /**
   * Get information about a group from invite code
   *
   * @param params - Invite info parameters
   */
  async getInviteInfo(params: GroupInviteInfoParams): Promise<Group> {
    return this.client.request<Group>("POST", "group/inviteInfo", params);
  }

  /**
   * Get invite link for a group
   *
   * @param groupJID - JID of the group
   */
  async getInviteLink(groupJID: string): Promise<{ inviteLink: string }> {
    return this.client.request<{ inviteLink: string }>(
      "GET",
      `group/invitelink/${encodeURIComponent(groupJID)}`,
    );
  }

  /**
   * Join a group using invite code
   *
   * @param params - Join parameters
   */
  async join(params: GroupJoinParams): Promise<{
    response: string;
    group: Group;
  }> {
    return this.client.request<{
      response: string;
      group: Group;
    }>("POST", "group/join", params);
  }

  /**
   * Leave a group
   *
   * @param params - Leave parameters
   */
  async leave(params: GroupLeaveParams): Promise<{ response: string }> {
    return this.client.request<{ response: string }>(
      "POST",
      "group/leave",
      params,
    );
  }

  /**
   * List all groups
   *
   * @param force - Force update of group cache
   */
  async list(force?: boolean): Promise<{ groups: Group[] }> {
    const queryParams = force ? "?force=true" : "";
    return this.client.request<{ groups: Group[] }>(
      "GET",
      `group/list${queryParams}`,
    );
  }

  /**
   * Reset invite code for a group
   *
   * @param params - Reset invite code parameters
   */
  async resetInviteCode(params: GroupUpdateParams): Promise<{
    InviteLink: string;
    group: Group;
  }> {
    return this.client.request<{
      InviteLink: string;
      group: Group;
    }>("POST", "group/resetInviteCode", params);
  }

  /**
   * Update group announce setting
   *
   * @param params - Update announce parameters
   */
  async updateAnnounce(params: GroupUpdateAnnounceParams): Promise<{
    response: string;
    group: Group;
  }> {
    return this.client.request<{
      response: string;
      group: Group;
    }>("POST", "group/updateAnnounce", params);
  }

  /**
   * Update group description
   *
   * @param params - Update description parameters
   */
  async updateDescription(params: GroupUpdateDescriptionParams): Promise<{
    response: string;
    group: Group;
  }> {
    return this.client.request<{
      response: string;
      group: Group;
    }>("POST", "group/updateDescription", params);
  }

  /**
   * Update group image
   *
   * @param params - Update image parameters
   */
  async updateImage(params: GroupUpdateImageParams): Promise<{
    response: string;
    group: Group;
  }> {
    return this.client.request<{
      response: string;
      group: Group;
    }>("POST", "group/updateImage", params);
  }

  /**
   * Update group locked setting
   *
   * @param params - Update locked parameters
   */
  async updateLocked(params: GroupUpdateLockedParams): Promise<{
    response: string;
    group: Group;
  }> {
    return this.client.request<{
      response: string;
      group: Group;
    }>("POST", "group/updateLocked", params);
  }

  /**
   * Update group name
   *
   * @param params - Update name parameters
   */
  async updateName(params: GroupUpdateNameParams): Promise<{
    response: string;
    group: Group;
  }> {
    return this.client.request<{
      response: string;
      group: Group;
    }>("POST", "group/updateName", params);
  }

  /**
   * Update group participants
   *
   * @param params - Update participants parameters
   */
  async updateParticipants(params: GroupUpdateParticipantsParams): Promise<{
    groupUpdated: Array<{
      JID: string;
      Error: number;
    }>;
    group: Group;
  }> {
    return this.client.request<{
      groupUpdated: Array<{
        JID: string;
        Error: number;
      }>;
      group: Group;
    }>("POST", "group/updateParticipants", params);
  }

  /**
   * Create a community
   *
   * @param params - Create community parameters
   */
  async createCommunity(params: CommunityCreateParams): Promise<{
    group: Group;
    failed: string[];
  }> {
    return this.client.request<{
      group: Group;
      failed: string[];
    }>("POST", "community/create", params);
  }

  /**
   * Update community groups
   *
   * @param params - Update community groups parameters
   */
  async updateCommunityGroups(params: CommunityUpdateGroupsParams): Promise<{
    message: string;
    success: string[];
    failed: string[];
  }> {
    return this.client.request<{
      message: string;
      success: string[];
      failed: string[];
    }>("POST", "community/updategroups", params);
  }
}

/**
 * Agent resource for managing AI agents
 */
export class AgentResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * List all agents
   */
  async list(): Promise<ChatbotAIAgent[]> {
    return this.client.request<ChatbotAIAgent[]>("GET", "agent/list");
  }

  /**
   * Create or edit an agent
   *
   * @param params - Agent edit parameters
   */
  async edit(params: AgentEditParams): Promise<ChatbotAIAgent> {
    return this.client.request<ChatbotAIAgent>("POST", "agent/edit", params);
  }
}

/**
 * Label resource for managing labels
 */
export class LabelResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * List all labels
   */
  async list(): Promise<Label[]> {
    return this.client.request<Label[]>("GET", "labels");
  }

  /**
   * Edit a label
   *
   * @param params - Label edit parameters
   */
  async edit(params: LabelEditParams): Promise<{ response: string }> {
    return this.client.request<{ response: string }>(
      "POST",
      "label/edit",
      params,
    );
  }
}

/**
 * Attendant resource for managing attendants
 */
export class AttendantResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  // Additional methods will be implemented as needed
}

/**
 * Chatbot resource for managing chatbot settings
 */
export class ChatbotResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * List all triggers
   */
  async listTriggers(): Promise<ChatbotTrigger[]> {
    return this.client.request<ChatbotTrigger[]>("GET", "trigger/list");
  }

  /**
   * Create or edit a trigger
   *
   * @param params - Trigger edit parameters
   */
  async editTrigger(params: TriggerEditParams): Promise<ChatbotTrigger> {
    return this.client.request<ChatbotTrigger>("POST", "trigger/edit", params);
  }

  /**
   * List all AI functions
   */
  async listFunctions(): Promise<ChatbotAIFunction[]> {
    return this.client.request<ChatbotAIFunction[]>("GET", "function/list");
  }

  /**
   * Create or edit an AI function
   *
   * @param params - Function edit parameters
   */
  async editFunction(params: FunctionEditParams): Promise<ChatbotAIFunction> {
    return this.client.request<ChatbotAIFunction>(
      "POST",
      "function/edit",
      params,
    );
  }

  /**
   * List all knowledge
   */
  async listKnowledge(): Promise<ChatbotAIKnowledge[]> {
    return this.client.request<ChatbotAIKnowledge[]>("GET", "knowledge/list");
  }

  /**
   * Create or edit knowledge
   *
   * @param params - Knowledge edit parameters
   */
  async editKnowledge(
    params: KnowledgeEditParams,
  ): Promise<ChatbotAIKnowledge> {
    return this.client.request<ChatbotAIKnowledge>(
      "POST",
      "knowledge/edit",
      params,
    );
  }
}

/**
 * Admin resource for admin operations
 */
export class AdminResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * Create a new instance
   *
   * @param params - Create instance parameters
   */
  async createInstance(params: CreateInstanceParams): Promise<{
    response: string;
    instance: Instance;
    connected: boolean;
    loggedIn: boolean;
    name: string;
    token: string;
    info: string;
  }> {
    return this.client.request<{
      response: string;
      instance: Instance;
      connected: boolean;
      loggedIn: boolean;
      name: string;
      token: string;
      info: string;
    }>("POST", "instance/init", params, true);
  }

  /**
   * List all instances
   */
  async listInstances(): Promise<Instance[]> {
    return this.client.request<Instance[]>(
      "GET",
      "instance/all",
      undefined,
      true,
    );
  }

  /**
   * Update admin fields for an instance
   *
   * @param id - Instance ID
   * @param adminField01 - Admin field 1
   * @param adminField02 - Admin field 2
   */
  async updateAdminFields(
    id: string,
    adminField01?: string,
    adminField02?: string,
  ): Promise<Instance> {
    return this.client.request<Instance>(
      "POST",
      "instance/updateAdminFields",
      {
        id,
        adminField01,
        adminField02,
      },
      true,
    );
  }

  /**
   * Get global webhook
   */
  async getGlobalWebhook(): Promise<Webhook> {
    return this.client.request<Webhook>(
      "GET",
      "globalwebhook",
      undefined,
      true,
    );
  }

  /**
   * Set global webhook
   *
   * @param webhook - Webhook configuration
   */
  async setGlobalWebhook(webhook: Webhook): Promise<Webhook> {
    return this.client.request<Webhook>("POST", "globalwebhook", webhook, true);
  }
}

/**
 * Quick reply resource for managing quick replies
 */
export class QuickReplyResource {
  private client: UazapiClient;

  constructor(client: UazapiClient) {
    this.client = client;
  }

  /**
   * List all quick replies
   */
  async list(): Promise<QuickReply[]> {
    return this.client.request<QuickReply[]>("GET", "quickreply/showall");
  }

  /**
   * Create or edit a quick reply
   *
   * @param params - Quick reply edit parameters
   */
  async edit(params: QuickReplyEditParams): Promise<{
    message: string;
    quickReplies: QuickReply[];
  }> {
    return this.client.request<{
      message: string;
      quickReplies: QuickReply[];
    }>("POST", "quickreply/edit", params);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Determine if an error is a network error
 *
 * @param error - Error to check
 */
function isNetworkError(error: Error): boolean {
  return (
    error.message.includes("Failed to fetch") ||
    error.message.includes("Network request failed") ||
    error.message.includes("network timeout") ||
    error.message.includes("network connection") ||
    error.message.includes("ECONNREFUSED") ||
    error.message.includes("ENOTFOUND")
  );
}

// Continuação do SDK UAZAPI

/**
 * Determine if a status code should trigger a retry
 *
 * @param status - HTTP status code
 */
function shouldRetry(status: number): boolean {
  // Retry on server errors (5xx) and some specific client errors
  return (
    status >= 500 || // Server errors
    status === 429 || // Too many requests
    status === 408 || // Request timeout
    status === 409 || // Conflict
    status === 423 || // Locked
    status === 425 || // Too Early
    status === 429 // Too Many Requests
  );
}

/**
 * Sleep for a specified duration
 *
 * @param ms - Duration in milliseconds
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// =============================================================================
// Usage Examples
// =============================================================================

/**
 * Example: Initialize the SDK
 */
export async function initializeSDKExample(): Promise<UazapiClient> {
  // Create a new instance of the SDK
  const client = new UazapiClient({
    baseUrl: "https://free.uazapi.com",
    token: "your-instance-token",
    adminToken: "your-admin-token", // Optional
    timeout: 30000,
    retry: true,
    maxRetries: 3,
    retryDelay: 1000,
  });

  return client;
}

/**
 * Example: Connect to WhatsApp
 */
export async function connectToWhatsAppExample(
  client: UazapiClient,
): Promise<void> {
  try {
    // Get current status
    const status = await client.instance.getStatus();
    console.log("Current status:", status.instance.status);

    // Connect if not already connected
    if (status.instance.status !== "connected") {
      console.log("Connecting to WhatsApp...");
      const result = await client.instance.connect({
        phone: "5511999999999",
      });
      console.log("Connection initiated:", result.status);
    }
  } catch (error) {
    console.error("Error connecting to WhatsApp:", error);
  }
}

/**
 * Example: Send a text message
 */
export async function sendTextMessageExample(
  client: UazapiClient,
): Promise<void> {
  try {
    const result = await client.message.sendText({
      number: "5511999999999",
      text: "Hello from UAZAPI SDK!",
      linkPreview: true,
      readchat: true,
    });

    console.log("Message sent:", result.id);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

/**
 * Example: Send a media message
 */
export async function sendMediaMessageExample(
  client: UazapiClient,
): Promise<void> {
  try {
    const result = await client.message.sendMedia({
      number: "5511999999999",
      type: "image",
      file: "https://example.com/image.jpg",
      text: "Check out this image!",
      readchat: true,
    });

    console.log("Media message sent:", result.id);
  } catch (error) {
    console.error("Error sending media message:", error);
  }
}

/**
 * Example: Create and manage a group
 */
export async function groupManagementExample(
  client: UazapiClient,
): Promise<void> {
  try {
    // Create a new group
    const group = await client.group.create({
      name: "My Test Group",
      participants: ["5511999999991", "5511999999992"],
    });

    console.log("Group created:", group.JID);

    // Update group name
    const updatedGroup = await client.group.updateName({
      groupjid: group.JID,
      name: "Updated Group Name",
    });

    console.log("Group name updated:", updatedGroup.group.Name);

    // Add participants
    const addParticipants = await client.group.updateParticipants({
      groupjid: group.JID,
      action: "add",
      participants: ["5511999999993"],
    });

    console.log("Participants added:", addParticipants.groupUpdated);
  } catch (error) {
    console.error("Error in group management:", error);
  }
}

/**
 * Example: Set up a webhook
 */
export async function setupWebhookExample(client: UazapiClient): Promise<void> {
  try {
    // Configure a webhook
    const webhook = await client.webhook.set({
      url: "https://your-webhook-url.com/webhook",
      events: ["messages", "messages_update", "presence"],
      enabled: true,
      excludeMessages: ["wasSentByApi"],
    });

    console.log("Webhook configured:", webhook);
  } catch (error) {
    console.error("Error configuring webhook:", error);
  }
}

/**
 * Example: Create a mass message campaign
 */
export async function massMessageCampaignExample(
  client: UazapiClient,
): Promise<void> {
  try {
    // Simple campaign
    const campaign = await client.sender.simple({
      numbers: ["5511999999991", "5511999999992", "5511999999993"],
      type: "text",
      text: "Hello from our campaign!",
      delayMin: 10,
      delayMax: 30,
      scheduled_for: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      info: "My test campaign",
    });

    console.log("Campaign created:", campaign.folder_id);

    // Check campaign status
    const folders = await client.sender.listFolders();
    console.log("All campaigns:", folders);

    // List messages in the campaign
    const messages = await client.sender.listMessages({
      folder_id: campaign.folder_id,
    });

    console.log("Campaign messages:", messages);
  } catch (error) {
    console.error("Error creating campaign:", error);
  }
}

/**
 * Example: Working with AI agents
 */
export async function aiAgentExample(client: UazapiClient): Promise<void> {
  try {
    // Create a new AI agent
    const agent = await client.agent.edit({
      agent: {
        name: "Customer Support",
        provider: "openai",
        model: "gpt-3.5-turbo",
        apikey: "your-openai-api-key",
        basePrompt:
          "You are a customer support agent for our company. Be helpful and concise.",
        temperature: 70,
        maxTokens: 2000,
        signMessages: true,
        readMessages: true,
      },
    });

    console.log("AI agent created:", agent.id);

    // Create a trigger for the agent
    const trigger = await client.chatbot.editTrigger({
      trigger: {
        type: "agent",
        agent_id: agent.id,
        active: true,
        ignoreGroups: true,
        priority: 1,
        wordsToStart: "help|support|assist",
        responseDelay_seconds: 2,
      },
    });

    console.log("Trigger created:", trigger.id);
  } catch (error) {
    console.error("Error working with AI agents:", error);
  }
}

/**
 * Example: Working with quick replies
 */
export async function quickReplyExample(client: UazapiClient): Promise<void> {
  try {
    // Create a quick reply
    const quickReply = await client.quickReply.edit({
      shortCut: "greeting",
      type: "text",
      text: "Hello! Thank you for contacting us. How can I help you today?",
    });

    console.log("Quick reply created");

    // List all quick replies
    const quickReplies = await client.quickReply.list();
    console.log("All quick replies:", quickReplies);
  } catch (error) {
    console.error("Error working with quick replies:", error);
  }
}

/**
 * Example: Working with contacts and chats
 */
export async function contactsAndChatsExample(
  client: UazapiClient,
): Promise<void> {
  try {
    // Check number on WhatsApp
    const checkResult = await client.chat.check({
      numbers: ["5511999999999"],
    });

    console.log("Number check result:", checkResult);

    if (checkResult[0].isInWhatsapp) {
      // Get chat details
      const chatDetails = await client.chat.getNameAndImageUrl({
        number: "5511999999999",
      });

      console.log("Chat details:", chatDetails);

      // Update lead information
      const updatedChat = await client.chat.editLead({
        id: chatDetails.id,
        lead_name: "John Doe",
        lead_email: "john.doe@example.com",
        lead_status: "new",
        lead_tags: ["new-customer", "priority"],
      });

      console.log("Lead information updated:", updatedChat);
    }
  } catch (error) {
    console.error("Error working with contacts and chats:", error);
  }
}

// Example of full usage
export async function fullExample(): Promise<void> {
  try {
    // Initialize client
    const client = await initializeSDKExample();

    // Connect to WhatsApp
    await connectToWhatsAppExample(client);

    // Send messages
    await sendTextMessageExample(client);
    await sendMediaMessageExample(client);

    // Work with groups
    await groupManagementExample(client);

    // Set up webhook
    await setupWebhookExample(client);

    // Create mass message campaign
    await massMessageCampaignExample(client);

    // Work with AI agents
    await aiAgentExample(client);

    // Work with quick replies
    await quickReplyExample(client);

    // Work with contacts and chats
    await contactsAndChatsExample(client);

    console.log("All examples completed successfully");
  } catch (error) {
    console.error("Error in examples:", error);
  }
}
