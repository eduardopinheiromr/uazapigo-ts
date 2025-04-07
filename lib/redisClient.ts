// lib/redisClient.ts

import Redis from "ioredis";

const redisUrl = process.env.UPSTASH_REDIS_URL!;

if (!redisUrl) {
  throw new Error("Missing Redis environment variables");
}

/**
 * Cliente Redis configurado para uso em todo o aplicativo
 */
const redisClient = new Redis(redisUrl);

/**
 * Obtém um valor do cache
 * @param key Chave do cache
 * @returns Valor ou null se não encontrado
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const data = await redisClient.get(key);
  if (!data) return null;

  try {
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`Error parsing Redis data for key ${key}:`, error);
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
  const stringValue = JSON.stringify(value);

  if (ttlSeconds) {
    await redisClient.set(key, stringValue, "EX", ttlSeconds);
  } else {
    await redisClient.set(key, stringValue);
  }
}

/**
 * Remove um valor do cache
 * @param key Chave do cache
 */
export async function deleteCache(key: string): Promise<void> {
  await redisClient.del(key);
}

export default redisClient;
