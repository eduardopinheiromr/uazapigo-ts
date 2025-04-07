// lib/redisClient.ts

import { Redis } from "@upstash/redis";

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!redisUrl || !redisToken) {
  throw new Error("Variáveis de ambiente do Redis estão faltando");
}

/**
 * Cliente Redis configurado para uso em todo o aplicativo
 */
const redisClient = new Redis({
  url: redisUrl,
  token: redisToken,
});

/**
 * Obtém um valor do cache
 * @param key Chave do cache
 * @returns Valor ou null se não encontrado
 */
export async function getCache<T>(key: string): Promise<T | null> {
  const data = await redisClient.get(key);
  if (!data) return null;

  console.log(
    JSON.stringify(
      {
        key,
        data,
      },
      null,
      2,
    ),
  );

  try {
    return data as T; //JSON.parse(data as unknown as string) as T;
  } catch (error) {
    console.error(
      `Erro ao analisar os dados do Redis para a chave ${key}:`,
      error,
    );
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
    await redisClient.set(key, stringValue, { ex: ttlSeconds });
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
