// lib/supabaseClient.ts

import { createClient } from "@supabase/supabase-js";
import logger from "./logger";

// Verificar variáveis de ambiente
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.warn(
    "Missing Supabase environment variables. Database operations will fail.",
  );
}

// Criar e configurar o cliente Supabase
const supabaseClient = createClient(
  supabaseUrl || "https://example.supabase.co",
  supabaseKey || "example-key",
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    // Configurações adicionais para o cliente
    db: {
      schema: "public",
    },
    global: {
      headers: {
        "x-application-name": "whatsapp-bot",
      },
    },
  },
);

/**
 * Verifica a conexão com o Supabase
 */
export async function testConnection(): Promise<boolean> {
  try {
    // Realizar uma consulta simples para verificar a conexão
    const { data, error } = await supabaseClient
      .from("businesses")
      .select("business_id")
      .limit(1);

    if (error) {
      logger.error("Supabase connection test failed", {
        error: error.message,
        code: error.code,
      });
      return false;
    }

    logger.info("Supabase connection test successful");
    return true;
  } catch (error) {
    logger.error("Error testing Supabase connection", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Define um hook para logs antes de cada consulta
 * Isso é útil para debug e monitoramento
 */
function logQueryMiddleware() {
  const originalFrom = supabaseClient.from;

  supabaseClient.from = function (table: string) {
    logger.debug(`DB Query initiated: ${table}`);
    return originalFrom.call(this, table);
  };

  return supabaseClient;
}

// Aplicar middleware de log se estiver em ambiente de desenvolvimento
if (process.env.NODE_ENV === "development") {
  logQueryMiddleware();
}

/**
 * Execute consultas com retry automático em caso de falha
 */
export async function executeWithRetry<T>(
  queryFn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 500,
): Promise<T> {
  let lastError: any;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await queryFn();
    } catch (error) {
      lastError = error;

      // Calcular o atraso com backoff exponencial
      const delay = baseDelayMs * Math.pow(2, attempt);

      logger.warn(
        `Database operation failed, retrying (${attempt + 1}/${maxRetries})`,
        {
          error: error instanceof Error ? error.message : String(error),
          retryIn: `${delay}ms`,
        },
      );

      // Esperar antes de tentar novamente
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  logger.error("Database operation failed after max retries", {
    maxRetries,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  });

  throw lastError;
}

/**
 * Funções extras para simplificar o acesso a operações comuns
 */
export const utils = {
  /**
   * Busca um único registro por ID
   */
  async getById<T>(
    table: string,
    idField: string,
    idValue: string,
    select: string = "*",
  ): Promise<T | null> {
    const { data, error } = await supabaseClient
      .from(table)
      .select(select)
      .eq(idField, idValue)
      .single();

    if (error) {
      logger.error(`Error fetching ${table} by ID`, {
        error: error.message,
        table,
        idField,
        idValue,
      });
      return null;
    }

    return data as T;
  },

  /**
   * Cria um novo registro
   */
  async create<T>(table: string, data: Record<string, any>): Promise<T | null> {
    const { data: result, error } = await supabaseClient
      .from(table)
      .insert(data)
      .select()
      .single();

    if (error) {
      logger.error(`Error creating ${table} record`, {
        error: error.message,
        table,
      });
      return null;
    }

    return result as T;
  },

  /**
   * Atualiza um registro existente
   */
  async update<T>(
    table: string,
    idField: string,
    idValue: string,
    data: Record<string, any>,
  ): Promise<T | null> {
    const { data: result, error } = await supabaseClient
      .from(table)
      .update(data)
      .eq(idField, idValue)
      .select()
      .single();

    if (error) {
      logger.error(`Error updating ${table} record`, {
        error: error.message,
        table,
        idField,
        idValue,
      });
      return null;
    }

    return result as T;
  },

  /**
   * Remove um registro
   */
  async delete(
    table: string,
    idField: string,
    idValue: string,
  ): Promise<boolean> {
    const { error } = await supabaseClient
      .from(table)
      .delete()
      .eq(idField, idValue);

    if (error) {
      logger.error(`Error deleting ${table} record`, {
        error: error.message,
        table,
        idField,
        idValue,
      });
      return false;
    }

    return true;
  },

  /**
   * Verifica se um registro existe
   */
  async exists(
    table: string,
    idField: string,
    idValue: string,
  ): Promise<boolean> {
    const { count, error } = await supabaseClient
      .from(table)
      .select(idField, { count: "exact", head: true })
      .eq(idField, idValue);

    if (error) {
      logger.error(`Error checking if ${table} record exists`, {
        error: error.message,
        table,
        idField,
        idValue,
      });
      return false;
    }

    return count !== null && count > 0;
  },
};

// Exportar o cliente e funções adicionais
export default supabaseClient;
