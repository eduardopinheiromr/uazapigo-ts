// lib/logger.ts

import chalk from "chalk"; // Importa a biblioteca chalk
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
  timestamp: string; // Manter ISO string para precisão e DB
  level: LogLevel;
  message: string;
  business_id?: string;
  phone?: string;
  intent?: string;
  [key: string]: any; // Permite metadados adicionais
}

/**
 * Opções de configuração do logger
 */
export interface LoggerOptions {
  minLevel: LogLevel;
  persistToDatabase: boolean;
  includeMetadata: boolean;
  prettyPrintConsole: boolean; // Nova opção para controlar a formatação bonita
}

// Configuração padrão
const defaultOptions: LoggerOptions = {
  minLevel: LogLevel.INFO,
  persistToDatabase: true,
  includeMetadata: true,
  prettyPrintConsole: true, // Habilitado por padrão
};

// Configuração atual
let currentOptions: LoggerOptions = { ...defaultOptions };

// Mapeamento de níveis para valores numéricos
function getLogLevelValue(level: LogLevel): number {
  const levels = {
    [LogLevel.DEBUG]: 0,
    [LogLevel.INFO]: 1,
    [LogLevel.WARN]: 2,
    [LogLevel.ERROR]: 3,
  };
  return levels[level] ?? levels[LogLevel.INFO];
}

// Mapeamento de níveis para cores do Chalk
const levelColors = {
  [LogLevel.DEBUG]: chalk.gray,
  [LogLevel.INFO]: chalk.blue,
  [LogLevel.WARN]: chalk.yellow,
  [LogLevel.ERROR]: chalk.red.bold, // Erros em negrito e vermelho
};

// Mapeamento de níveis para emojis
const levelEmojis = {
  [LogLevel.DEBUG]: "🐛",
  [LogLevel.INFO]: "ℹ️",
  [LogLevel.WARN]: "⚠️",
  [LogLevel.ERROR]: "🔥",
};

/**
 * Formata um timestamp ISO para um formato mais legível no console
 */
function formatConsoleTimestamp(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString(); // Ex: 14:35:10
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

    // Log para console com formatação aprimorada
    outputToConsole(logEntry);

    // Salvar no banco se configurado
    if (currentOptions.persistToDatabase) {
      await persistToDatabase(logEntry);
    }
  } catch (error) {
    // Fallback para não causar erros em cascata
    console.error(chalk.magenta("Error in logging system:"), error); // Cor no erro do logger
    console.error(chalk.magenta("Original log:"), { level, message, metadata });
  }
}

/**
 * Exibe log no console com cores, emojis e formatação
 */
function outputToConsole(logEntry: LogEntry): void {
  const { timestamp, level, message, ...rest } = logEntry;

  // Usa formatação bonita apenas se habilitado
  if (currentOptions.prettyPrintConsole) {
    const color = levelColors[level] || chalk.white;
    const emoji = levelEmojis[level] || "➡️";
    const consoleTimestamp = chalk.dim(formatConsoleTimestamp(timestamp)); // Timestamp mais sutil
    const levelString = `[${level.toUpperCase()}]`.padEnd(7); // Alinha os níveis

    // Monta a linha de log principal
    let output = `${consoleTimestamp} ${emoji} ${color(levelString)} ${message}`;

    // Verifica se há metadados relevantes para exibir (excluindo os campos já usados)
    const metadataToPrint =
      currentOptions.includeMetadata && Object.keys(rest).length > 0
        ? rest
        : null;

    if (metadataToPrint) {
      // Tenta extrair um erro para logar o stack trace separadamente
      let errorStack: string | undefined;
      if (metadataToPrint.error instanceof Error) {
        errorStack = metadataToPrint.error.stack;
        // Remove o erro dos metadados para não duplicar a informação
        delete metadataToPrint.error;
      }

      // Formata os metadados restantes como JSON indentado e colorido
      if (Object.keys(metadataToPrint).length > 0) {
        try {
          const metadataString = JSON.stringify(metadataToPrint, null, 2);
          // Adiciona os metadados em uma nova linha, com cor diferente
          output += `\n${chalk.cyan(metadataString)}`;
        } catch (e) {
          // Se JSON.stringify falhar (ex: objetos circulares), loga de forma simples
          output += `\n${chalk.cyan("Metadata (raw):")} ${require("util").inspect(metadataToPrint, { depth: null, colors: true })}`;
        }
      }

      // Loga a linha principal e os metadados
      console.log(output);

      // Se havia um stack trace, loga-o separadamente, em vermelho
      if (errorStack) {
        console.log(chalk.red(errorStack));
      }
    } else {
      // Se não há metadados, apenas loga a linha principal
      console.log(output);
    }
  } else {
    // Fallback para o formato antigo se prettyPrintConsole for false
    const fallbackMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    const metadata = Object.keys(rest).length > 0 ? rest : undefined;

    switch (level) {
      case LogLevel.ERROR:
        console.error(fallbackMessage, metadata || ""); // Evita 'undefined' extra no console
        break;
      case LogLevel.WARN:
        console.warn(fallbackMessage, metadata || "");
        break;
      case LogLevel.INFO:
        console.info(fallbackMessage, metadata || "");
        break;
      case LogLevel.DEBUG:
      default:
        console.debug(fallbackMessage, metadata || "");
        break;
    }
  }
}

/**
 * Persiste log no banco de dados
 */
async function persistToDatabase(logEntry: LogEntry): Promise<void> {
  try {
    // Cria uma cópia para não modificar o objeto original antes de enviar ao DB
    const logDataForDb = { ...logEntry };

    // Opcional: Remover campos que não existem ou não interessam na tabela 'system_logs'
    // delete logDataForDb.algumCampoExtra;

    // Salvar na tabela de logs
    const { error } = await supabaseClient.from("system_logs").insert([
      {
        level: logDataForDb.level,
        message: logDataForDb.message,
        business_id: logDataForDb.business_id,
        phone: logDataForDb.phone,
        intent: logDataForDb.intent,
        // Guarda *todos* os metadados extras em uma coluna JSONB
        // Certifique-se que a coluna 'metadata' no Supabase é do tipo JSONB
        metadata: logDataForDb,
      },
    ]);

    if (error) {
      throw error; // Joga o erro para ser capturado pelo catch
    }
  } catch (dbError) {
    // Usa chalk aqui também para consistência no log de erro interno
    console.error(chalk.magenta("Failed to persist log to database:"), dbError);
    // Não relança o erro para evitar que a falha no log quebre a aplicação principal
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
  console.log(chalk.green("Logger configured:"), currentOptions); // Loga a nova configuração
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

  // Permite passar um Error diretamente como metadado para tratamento especial
  error: (message: string, metadataOrError?: Record<string, any> | Error) => {
    let metadata: Record<string, any> | undefined;
    if (metadataOrError instanceof Error) {
      // Se for um erro, coloca-o dentro de um objeto de metadados padronizado
      metadata = { error: metadataOrError };
    } else {
      metadata = metadataOrError;
    }
    logMessage(LogLevel.ERROR, message, metadata);
  },

  configure: (options: Partial<LoggerOptions>) => configureLogger(options),
};

export default logger;
