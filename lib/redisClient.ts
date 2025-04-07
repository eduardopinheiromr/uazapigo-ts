// lib/redisClient.ts

import { Redis } from "@upstash/redis";
import logger from "./logger";

// Configurações Redis do ambiente
const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

// Verifica a presença das variáveis de ambiente necessárias
if (!redisUrl || !redisToken) {
  logger.warn("Redis environment variables missing, using in-memory fallback");
}

/**
 * Mock do cache em memória para ambiente de desenvolvimento ou fallback
 */
class InMemoryCache {
  private cache: Map<string, { value: any; expiry: number | null }> = new Map();

  async get(key: string): Promise<any> {
    const item = this.cache.get(key);
    if (!item) return null;

    // Verificar se o item expirou
    if (item.expiry !== null && item.expiry < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: any, expireSeconds?: number): Promise<void> {
    const expiry = expireSeconds ? Date.now() + expireSeconds * 1000 : null;
    this.cache.set(key, { value, expiry });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async scan(pattern: string): Promise<string[]> {
    const matches: string[] = [];
    for (const key of this.cache.keys()) {
      if (pattern === "*" || key.includes(pattern.replace("*", ""))) {
        matches.push(key);
      }
    }
    return matches;
  }
}

/**
 * Determina qual cliente Redis usar
 */
const redisClient =
  redisUrl && redisToken
    ? new Redis({
        url: redisUrl,
        token: redisToken,
      })
    : (new InMemoryCache() as any);

/**
 * Obtém um valor do cache
 * @param key Chave do cache
 * @returns Valor ou null se não encontrado
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redisClient.get(key);
    if (!data) {
      logger.debug("Cache miss", { key });
      return null;
    }

    logger.debug("Cache hit", { key });

    try {
      // Se for string JSON, converter para objeto
      if (
        typeof data === "string" &&
        (data.startsWith("{") || data.startsWith("[") || data.startsWith('"'))
      ) {
        return JSON.parse(data) as T;
      }

      // Caso contrário, retornar como está
      return data as T;
    } catch (parseError) {
      logger.error("Error parsing Redis data", {
        key,
        error:
          parseError instanceof Error ? parseError.message : String(parseError),
      });
      return data as T;
    }
  } catch (error) {
    logger.error("Error getting cache", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Armazena um valor no cache
 * @param key Chave do cache
 * @param value Valor a ser armazenado
 * @param ttlSeconds Tempo de vida em segundos (opcional)
 */
export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
): Promise<void> {
  try {
    // Converter objetos complexos para string JSON
    const valueToStore =
      typeof value === "object" ? JSON.stringify(value) : value;

    if (ttlSeconds) {
      logger.debug("Setting cache with TTL", { key, ttlSeconds });
      await redisClient.set(key, valueToStore, { ex: ttlSeconds });
    } else {
      logger.debug("Setting cache without TTL", { key });
      await redisClient.set(key, valueToStore);
    }
  } catch (error) {
    logger.error("Error setting cache", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Remove um valor do cache
 * @param key Chave do cache
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    logger.debug("Deleting cache", { key });
    await redisClient.del(key);
  } catch (error) {
    logger.error("Error deleting cache", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Busca chaves no cache baseado em um padrão
 * @param pattern Padrão de busca (ex: "session:*")
 */
export async function scanCache(pattern: string): Promise<string[]> {
  try {
    logger.debug("Scanning cache", { pattern });

    // Upstash Redis usa parâmetros diferentes para scan
    if (redisUrl && redisToken) {
      const result = await redisClient.scan(0, { match: pattern, count: 100 });
      return result[1] || [];
    } else {
      // InMemoryCache
      return await redisClient.scan(pattern);
    }
  } catch (error) {
    logger.error("Error scanning cache", {
      pattern,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/**
 * Limpa o cache baseado em um padrão de chaves
 * @param pattern Padrão de busca (ex: "session:business123:*")
 */
export async function clearCachePattern(pattern: string): Promise<void> {
  try {
    logger.info("Clearing cache pattern", { pattern });

    const keys = await scanCache(pattern);
    logger.debug("Found keys to delete", { count: keys.length });

    // Excluir cada chave encontrada
    if (keys.length > 0) {
      for (const key of keys) {
        await deleteCache(key);
      }
    }
  } catch (error) {
    logger.error("Error clearing cache pattern", {
      pattern,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Verifica a validade e reconexão do cliente Redis
 */
export async function pingRedis(): Promise<boolean> {
  try {
    const response = await redisClient.ping();
    logger.debug("Redis ping", { response });
    return response === "PONG";
  } catch (error) {
    logger.error("Redis ping failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export default {
  getCache,
  setCache,
  deleteCache,
  scanCache,
  clearCachePattern,
  pingRedis,
};
