// lib/init.ts
import { initializeAgent } from "@/agent";
import logger from "@/lib/logger";

/**
 * Função para inicializar todos os componentes do sistema
 */
export async function initializeSystem(): Promise<void> {
  try {
    logger.info("Starting system initialization");

    // Inicializar o agente
    await initializeAgent();

    // Aqui poderiam ser adicionadas outras inicializações:
    // - Verificação de conexão com o Supabase
    // - Verificação de conexão com Redis/cache
    // - Inicialização de outros serviços

    logger.info("System initialization completed successfully");
    return Promise.resolve();
  } catch (error) {
    logger.error("Failed to initialize system", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return Promise.reject(error);
  }
}

// Exportar para usar em outros lugares, como no startup do servidor
export default initializeSystem;
