import { NextApiRequest, NextApiResponse } from "next";
import logger from "@/lib/logger";
import supabaseClient from "@/lib/supabaseClient";

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
    logger.info("Iniciando limpeza de logs do sistema");

    // Tentar limpar a tabela system_logs
    const { error: deleteError, count } = await supabaseClient
      .from("system_logs")
      .delete()
      .not("level", "eq", "CRITICAL") // Manter logs críticos como segurança
      .select("count");

    if (deleteError) {
      logger.error("Erro ao excluir logs do sistema do Supabase", {
        error: deleteError.message,
        code: deleteError.code,
      });

      return res.status(500).json({
        success: false,
        error: "Erro ao excluir logs do sistema",
        details: deleteError.message,
      });
    }

    const recordsDeleted = count || 0;
    logger.info("Limpeza de logs do sistema concluída", { recordsDeleted });

    // Verificar logs remanescentes (exceto críticos)
    const { count: remainingCount, error: countError } = await supabaseClient
      .from("system_logs")
      .select("*", { count: "exact", head: true })
      .not("level", "eq", "CRITICAL");

    if (countError) {
      logger.error("Erro ao verificar logs remanescentes", {
        error: countError.message,
      });

      return res.status(200).json({
        success: true,
        message: `${recordsDeleted} logs removidos, mas não foi possível verificar logs remanescentes`,
        recordsDeleted,
      });
    }

    // Verificar logs críticos (que não foram excluídos)
    const { count: criticalCount, error: criticalError } = await supabaseClient
      .from("system_logs")
      .select("*", { count: "exact", head: true })
      .eq("level", "CRITICAL");

    if (criticalError) {
      logger.error("Erro ao verificar logs críticos", {
        error: criticalError.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${recordsDeleted} logs não críticos removidos com sucesso`,
      recordsDeleted,
      remainingNonCritical: remainingCount || 0,
      criticalLogsPreserved: criticalCount || 0,
    });
  } catch (error) {
    logger.error("Erro ao limpar logs do sistema", {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: "Erro ao limpar logs do sistema",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
}
