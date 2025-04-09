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
    logger.info("Iniciando limpeza de agendamentos futuros");

    // Obter a data atual para excluir apenas agendamentos futuros
    const now = new Date().toISOString();

    // Tentar limpar agendamentos futuros na tabela appointments
    const { error: deleteError, count } = await supabaseClient
      .from("appointments")
      .delete()
      .gte("start_time", now) // Apenas agendamentos futuros
      .select("count");

    if (deleteError) {
      logger.error("Erro ao excluir agendamentos do Supabase", {
        error: deleteError.message,
        code: deleteError.code,
      });

      return res.status(500).json({
        success: false,
        error: "Erro ao excluir agendamentos futuros",
        details: deleteError.message,
      });
    }

    const recordsDeleted = count || 0;
    logger.info("Limpeza de agendamentos futuros concluída", {
      recordsDeleted,
    });

    // Verificar se ainda há agendamentos futuros
    const { count: remainingCount, error: countError } = await supabaseClient
      .from("appointments")
      .select("*", { count: "exact", head: true })
      .gte("start_time", now);

    if (countError) {
      logger.error("Erro ao verificar agendamentos remanescentes", {
        error: countError.message,
      });

      return res.status(200).json({
        success: true,
        message: `${recordsDeleted} agendamentos futuros removidos, mas não foi possível verificar agendamentos remanescentes`,
        recordsDeleted,
      });
    }

    if (remainingCount && remainingCount > 0) {
      logger.warn("Ainda existem agendamentos futuros após a limpeza", {
        remainingCount,
      });

      return res.status(200).json({
        success: true,
        message: `${recordsDeleted} agendamentos futuros removidos, mas ainda existem ${remainingCount} agendamentos pendentes`,
        recordsDeleted,
        remainingCount,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${recordsDeleted} agendamentos futuros removidos com sucesso`,
      recordsDeleted,
      remainingCount: 0,
    });
  } catch (error) {
    logger.error("Erro ao limpar agendamentos futuros", {
      error: error instanceof Error ? error.message : String(error),
    });

    return res.status(500).json({
      success: false,
      error: "Erro ao limpar agendamentos futuros",
      details: error instanceof Error ? error.message : "Erro desconhecido",
    });
  }
}
