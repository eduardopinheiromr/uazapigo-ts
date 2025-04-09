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
    logger.info("Iniciando limpeza de histórico de conversas");

    // Tentar limpar a tabela conversation_history
    const { error: deleteError, count } = await supabaseClient
      .from("conversation_history")
      .delete()
      .neq("message_id", "0") // Apenas como precaução, não exclui com ID '0' (caso exista)
      .select("count");

    if (deleteError) {
      logger.error("Erro ao excluir conversas do Supabase", {
        error: deleteError.message,
        code: deleteError.code,
      });

      return res.status(500).json({
        success: false,
        error: "Erro ao excluir histórico de conversas",
        details: deleteError.message,
      });
    }

    const recordsDeleted = count || 0;
    logger.info("Limpeza de histórico de conversas concluída", {
      recordsDeleted,
    });

    // Verificar se realmente foram excluídos
    const { count: remainingCount, error: countError } = await supabaseClient
      .from("conversation_history")
      .select("*", { count: "exact", head: true });

    if (countError) {
      logger.error("Erro ao verificar registros remanescentes", {
        error: countError.message,
      });

      return res.status(200).json({
        success: true,
        message: `${recordsDeleted} registros de conversas removidos, mas não foi possível verificar registros remanescentes`,
        recordsDeleted,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${recordsDeleted} registros de conversas removidos`,
      recordsDeleted,
      remainingCount: remainingCount || 0,
    });
  } catch (error) {
    logger.error("Erro ao limpar histórico de conversas", {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: "Erro ao limpar histórico de conversas",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
}
