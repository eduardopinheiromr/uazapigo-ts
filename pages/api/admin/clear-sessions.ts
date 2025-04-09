import { NextApiRequest, NextApiResponse } from "next";
import logger from "@/lib/logger";
import { scanCache, clearCachePattern } from "@/lib/redisClient";

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
    logger.info("Executando limpeza de sessões no Redis");

    // Buscar todas as chaves de sessão (formato: session:*)
    const sessionKeys = await scanCache("session:*");

    if (sessionKeys.length === 0) {
      logger.info("Nenhuma sessão encontrada no Redis para limpar");
      return res.status(200).json({
        success: true,
        message: "Nenhuma sessão encontrada para limpar",
        sessionsRemoved: 0,
      });
    }

    // Limpar todas as sessões
    await clearCachePattern("session:*");

    // Verificar se a limpeza foi bem-sucedida
    const remainingSessions = await scanCache("session:*");
    const success = remainingSessions.length === 0;

    if (success) {
      logger.info("Limpeza de sessões concluída com sucesso", {
        sessionsRemoved: sessionKeys.length,
      });
      return res.status(200).json({
        success: true,
        message: `${sessionKeys.length} sessões removidas com sucesso`,
        sessionsRemoved: sessionKeys.length,
      });
    } else {
      logger.error("Falha na limpeza de algumas sessões", {
        totalSessions: sessionKeys.length,
        remainingSessions: remainingSessions.length,
      });
      return res.status(500).json({
        success: false,
        error: "Falha na limpeza de algumas sessões",
        sessionsRemoved: sessionKeys.length - remainingSessions.length,
        sessionsRemaining: remainingSessions.length,
      });
    }
  } catch (error) {
    logger.error("Erro ao limpar sessões do Redis", {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: "Erro ao limpar sessões do Redis",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
}
