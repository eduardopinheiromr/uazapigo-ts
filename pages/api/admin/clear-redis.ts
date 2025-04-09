import { NextApiRequest, NextApiResponse } from "next";
import logger from "@/lib/logger";
import redisClient, { scanCache, clearCachePattern } from "@/lib/redisClient";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Verificar método HTTP
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Método não permitido" });
  }

  try {
    logger.info("Executando limpeza de todas as chaves do Redis");

    // Buscar todas as chaves
    const keys = await scanCache("*");

    if (keys.length === 0) {
      logger.info("Nenhuma chave encontrada no Redis para limpar");
      return res.status(200).json({
        success: true,
        message: "Nenhuma chave encontrada para limpar",
        keysRemoved: 0,
      });
    }

    // Limpar todas as chaves
    await clearCachePattern("*");

    // Verificar se a limpeza foi bem-sucedida
    const remainingKeys = await scanCache("*");
    const success = remainingKeys.length === 0;

    if (success) {
      logger.info("Limpeza do Redis concluída com sucesso", {
        keysRemoved: keys.length,
      });
      return res.status(200).json({
        success: true,
        message: `${keys.length} chaves removidas com sucesso`,
        keysRemoved: keys.length,
      });
    } else {
      logger.error("Falha na limpeza de algumas chaves do Redis", {
        totalKeys: keys.length,
        remainingKeys: remainingKeys.length,
      });
      return res.status(500).json({
        success: false,
        error: "Falha na limpeza de algumas chaves",
        keysRemoved: keys.length - remainingKeys.length,
        keysRemaining: remainingKeys.length,
      });
    }
  } catch (error) {
    logger.error("Erro ao limpar cache do Redis", {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: "Erro ao limpar cache do Redis",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
}
