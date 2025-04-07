// lib/logger.ts

import supabaseClient from "./supabaseClient";

/**
 * Níveis de log suportados
 */
export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}

/**
 * Interface para entrada de log
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  business_id?: string;
  phone?: string;
  intent?: string;
  [key: string]: any;
}

/**
 * Opções de configuração do logger
 */
export interface LoggerOptions {
  minLevel: LogLevel;
  persistToDatabase: boolean;
  includeMetadata: boolean;
}

// Configuração padrão
const defaultOptions: LoggerOptions = {
  minLevel: LogLevel.INFO,
  persistToDatabase: true,
  includeMetadata: true,
};

// Configuração atual
let currentOptions: LoggerOptions = { ...defaultOptions };

/**
 * Converte nível de log para valor numérico para comparação
 */
function getLogLevelValue(level: LogLevel): number {
  switch (level) {
    case LogLevel.DEBUG:
      return 0;
    case LogLevel.INFO:
      return 1;
    case LogLevel.WARN:
      return 2;
    case LogLevel.ERROR:
      return 3;
    default:
      return 1;
  }
}

/**
 * Registra uma entrada de log
 */
export async function logMessage(
  level: LogLevel,
  message: string,
  metadata?: Record<string, any>,
): Promise<void> {
  try {
    // Verificar se o nível de log deve ser registrado
    if (getLogLevelValue(level) < getLogLevelValue(currentOptions.minLevel)) {
      return;
    }

    const timestamp = new Date().toISOString();

    // Construir objeto de log
    const logEntry: LogEntry = {
      timestamp,
      level,
      message,
      ...(currentOptions.includeMetadata && metadata ? metadata : {}),
    };

    // Log para console
    outputToConsole(level, logEntry);

    // Salvar no banco se configurado
    if (currentOptions.persistToDatabase) {
      await persistToDatabase(logEntry);
    }
  } catch (error) {
    // Fallback para não causar erros em cascata
    console.error("Error in logging system:", error);
    console.error("Original log:", { level, message, metadata });
  }
}

/**
 * Exibe log no console
 */
function outputToConsole(level: LogLevel, logEntry: LogEntry): void {
  const { timestamp, message, ...rest } = logEntry;
  const metadata = Object.keys(rest).length > 1 ? rest : {};

  const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

  switch (level) {
    case LogLevel.ERROR:
      console.error(formattedMessage, metadata);
      break;
    case LogLevel.WARN:
      console.warn(formattedMessage, metadata);
      break;
    case LogLevel.INFO:
      console.info(formattedMessage, metadata);
      break;
    case LogLevel.DEBUG:
      console.debug(formattedMessage, metadata);
      break;
  }
}

/**
 * Persiste log no banco de dados
 */
async function persistToDatabase(logEntry: LogEntry): Promise<void> {
  try {
    // Salvar na tabela de logs
    await supabaseClient.from("system_logs").insert([
      {
        level: logEntry.level,
        message: logEntry.message,
        business_id: logEntry.business_id,
        phone: logEntry.phone,
        intent: logEntry.intent,
        metadata: logEntry,
      },
    ]);
  } catch (dbError) {
    // Silenciar erros de persistência para evitar cascata
    console.error("Failed to persist log to database:", dbError);
  }
}

/**
 * Configura o logger
 */
export function configureLogger(options: Partial<LoggerOptions>): void {
  currentOptions = {
    ...currentOptions,
    ...options,
  };
}

/**
 * API do logger para uso em todo o aplicativo
 */
export const logger = {
  debug: (message: string, metadata?: Record<string, any>) =>
    logMessage(LogLevel.DEBUG, message, metadata),

  info: (message: string, metadata?: Record<string, any>) =>
    logMessage(LogLevel.INFO, message, metadata),

  warn: (message: string, metadata?: Record<string, any>) =>
    logMessage(LogLevel.WARN, message, metadata),

  error: (message: string, metadata?: Record<string, any>) =>
    logMessage(LogLevel.ERROR, message, metadata),

  configure: (options: Partial<LoggerOptions>) => configureLogger(options),
};

export default logger;
