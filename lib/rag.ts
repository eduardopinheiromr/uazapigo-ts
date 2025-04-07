// lib/rag.ts
// Correção para uso da tabela knowledge_base em vez de knowledge_base_chunks

import supabaseClient from "./supabaseClient";
import { KnowledgeChunk, VectorSearchResult } from "@/types";
import logger from "./logger";
import { getLLMResponse } from "./googleAiClient";
import { getCache, setCache } from "./redisClient";

/**
 * Obtém contexto relevante da base de conhecimento para uma consulta
 */
export async function getRagContext(
  query: string,
  businessId: string,
  maxResults: number = 3,
  similarityThreshold: number = 0.7,
): Promise<string> {
  try {
    logger.info("Getting RAG context", {
      businessId,
      query: query.substring(0, 50),
    });

    // Verificar cache primeiro
    const cacheKey = `rag_context:${businessId}:${createContextHash(query)}`;
    const cachedContext = await getCache<string>(cacheKey);

    if (cachedContext) {
      logger.debug("RAG context cache hit", { businessId });
      return cachedContext;
    }

    // Gerar embeddings para a consulta
    const queryEmbedding = await generateEmbeddings(query, businessId);

    if (!queryEmbedding) {
      logger.warn("Failed to generate embeddings for query", { businessId });
      return "";
    }

    // Realizar busca vetorial usando a função match_knowledge_base RPC
    const { data: chunks, error } = await supabaseClient.rpc(
      "match_knowledge_base",
      {
        query_embedding: queryEmbedding,
        match_threshold: similarityThreshold,
        match_count: maxResults,
        business_filter: businessId,
      },
    );

    if (error || !chunks || chunks.length === 0) {
      logger.debug("No relevant knowledge chunks found", {
        businessId,
        error: error?.message,
      });
      return "";
    }

    // Formatar o contexto combinado
    let context = "";

    chunks.forEach((chunk, index) => {
      if (context) context += "\n\n";
      context += `[${index + 1}] ${chunk.content}`;
    });

    // Armazenar no cache (24 horas)
    await setCache(cacheKey, context, 86400);

    logger.debug("RAG context retrieved", {
      businessId,
      chunksCount: chunks.length,
      contextLength: context.length,
    });

    return context;
  } catch (error) {
    logger.error("Error in RAG context retrieval", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });
    return "";
  }
}

/**
 * Cria um hash para a consulta para uso como chave de cache
 */
function createContextHash(query: string): string {
  // Simplificar o texto para criar um hash mais estável
  const simplified = query
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100); // Limitar o tamanho para evitar chaves muito longas

  // Criar hash simples
  let hash = 0;
  for (let i = 0; i < simplified.length; i++) {
    const char = simplified.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Converter para 32bit integer
  }

  return hash.toString(16);
}

/**
 * Gerar embeddings usando o Gemini
 * Em produção, você usaria um modelo específico de embeddings
 */
export async function generateEmbeddings(
  content: string,
  businessId: string,
): Promise<number[] | null> {
  try {
    // Na fase inicial, usamos o Gemini para gerar um vetor pseudo-aleatório baseado no conteúdo
    // Em produção, seria substituído por um serviço de embeddings real

    // Verificar cache de embeddings
    const cacheKey = `embeddings:${businessId}:${createContextHash(content)}`;
    const cachedEmbeddings = await getCache<number[]>(cacheKey);

    if (cachedEmbeddings) {
      return cachedEmbeddings;
    }

    // Usar o Gemini para criar uma representação do texto
    // Isso é uma solução temporária até implementar embeddings reais
    const prompt = `
    Analise o seguinte texto e extraia 5 palavras-chave ou conceitos principais.
    Retorne apenas as palavras separadas por vírgula, sem explicação ou pontuação adicional.
    
    Texto: ${content.slice(0, 500)}
    
    Resultado:`;

    const response = await getLLMResponse(
      prompt,
      process.env.GOOGLE_API_KEY || "",
      businessId,
    );
    const keywords = response.split(",").map((k) => k.trim().toLowerCase());

    // Criar um vetor pseudo-aleatório baseado nas palavras-chave
    // Dimensão 384 para compatibilidade com pgvector
    const vector = Array(384).fill(0);

    // Função de hash simples para gerar números a partir de strings
    const hashString = (str: string) => {
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash = hash & hash;
      }
      return hash;
    };

    // Preencher o vetor com valores derivados das palavras-chave
    keywords.forEach((word, i) => {
      const hash = hashString(word);

      // Distribuir os valores pelo vetor
      for (let j = 0; j < 76; j++) {
        const pos = (i * 76 + j) % 384;
        vector[pos] = ((hash + j) % 100) / 100;
      }
    });

    // Normalizar o vetor (importante para búscas de similaridade)
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0),
    );
    const normalizedVector = vector.map((val) => val / magnitude);

    // Armazenar em cache (1 semana)
    await setCache(cacheKey, normalizedVector, 604800);

    return normalizedVector;
  } catch (error) {
    logger.error("Error generating embeddings", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      contentLength: content.length,
    });

    // Retornar um vetor de placeholder em caso de erro
    return Array(384).fill(0);
  }
}

/**
 * Adiciona um novo documento à base de conhecimento
 */
export async function addToKnowledgeBase(
  businessId: string,
  content: string,
  metadata: Record<string, any> = {},
): Promise<string | null> {
  try {
    logger.info("Adding to knowledge base", {
      businessId,
      contentLength: content.length,
    });

    // Validar entrada
    if (!content || content.trim().length < 10) {
      logger.warn("Content too short for knowledge base", { businessId });
      return null;
    }

    // Gerar embedding
    const embedding = await generateEmbeddings(content, businessId);

    if (!embedding) {
      logger.error("Failed to generate embeddings for knowledge base entry", {
        businessId,
      });
      return null;
    }

    // Gerar ID único
    const chunkId = crypto.randomUUID();

    // Inserir no banco de dados - usando tabela knowledge_base (não knowledge_base_chunks)
    const { error } = await supabaseClient.from("knowledge_base").insert({
      chunk_id: chunkId,
      business_id: businessId,
      content,
      embedding,
      metadata,
    });

    if (error) {
      logger.error("Error adding to knowledge base", {
        error: error.message,
        businessId,
      });
      return null;
    }

    logger.info("Successfully added to knowledge base", {
      businessId,
      chunkId,
    });

    return chunkId;
  } catch (error) {
    logger.error("Error in knowledge base insertion", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });
    return null;
  }
}

/**
 * Remove um documento da base de conhecimento
 */
export async function removeFromKnowledgeBase(
  businessId: string,
  chunkId: string,
): Promise<boolean> {
  try {
    logger.info("Removing from knowledge base", { businessId, chunkId });

    // Excluir do banco de dados - usando tabela knowledge_base
    const { error } = await supabaseClient
      .from("knowledge_base")
      .delete()
      .eq("chunk_id", chunkId)
      .eq("business_id", businessId);

    if (error) {
      logger.error("Error removing from knowledge base", {
        error: error.message,
        businessId,
        chunkId,
      });
      return false;
    }

    logger.info("Successfully removed from knowledge base", {
      businessId,
      chunkId,
    });

    return true;
  } catch (error) {
    logger.error("Error in knowledge base deletion", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
      chunkId,
    });
    return false;
  }
}

/**
 * Lista os documentos na base de conhecimento
 */
export async function listKnowledgeBase(
  businessId: string,
): Promise<KnowledgeChunk[]> {
  try {
    logger.info("Listing knowledge base", { businessId });

    // Buscar do banco de dados - usando tabela knowledge_base
    const { data, error } = await supabaseClient
      .from("knowledge_base")
      .select("chunk_id, content, metadata, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("Error listing knowledge base", {
        error: error.message,
        businessId,
      });
      return [];
    }

    logger.debug("Knowledge base listed", {
      businessId,
      count: data.length,
    });

    return data as KnowledgeChunk[];
  } catch (error) {
    logger.error("Error in knowledge base listing", {
      error: error instanceof Error ? error.message : String(error),
      businessId,
    });
    return [];
  }
}

export default {
  getRagContext,
  generateEmbeddings,
  addToKnowledgeBase,
  removeFromKnowledgeBase,
  listKnowledgeBase,
};
