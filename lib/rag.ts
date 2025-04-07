// lib/rag.ts

import supabaseClient from "./supabaseClient";
import { KnowledgeChunk } from "@/types";

/**
 * Obtém contexto relevante da base de conhecimento para uma consulta
 *
 * Inicialmente, esta é uma implementação simplificada sem geração de embeddings
 * Na produção, você precisaria usar um modelo para gerar embeddings da consulta
 */
export async function getRagContext(
  query: string,
  clientId: string,
): Promise<string> {
  try {
    // Placeholder para um vetor de embedding
    // Em produção, você usaria um modelo para gerar este vetor com base na consulta
    const placeholderEmbedding = Array(384).fill(0);

    // Configuração da busca
    const matchThreshold = 0.7;
    const matchCount = 3;

    // Realizar busca vetorial (usando função RPC do Supabase)
    const { data, error } = await supabaseClient.rpc("match_knowledge_base", {
      query_embedding: placeholderEmbedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
      client_filter: clientId,
    });

    if (error) {
      console.error("Error querying knowledge base:", error);
      return "";
    }

    // Processar resultados
    const chunks = data as KnowledgeChunk[];

    if (!chunks || chunks.length === 0) {
      console.log("No relevant knowledge chunks found");
      return "";
    }

    // Montar o contexto combinado
    let context = "Informações relevantes:\n\n";

    chunks.forEach((chunk, index) => {
      context += `[${index + 1}] ${chunk.content}\n\n`;
    });

    return context;
  } catch (error) {
    console.error("Error in RAG context retrieval:", error);
    return "";
  }
}

/**
 * Para implementação futura: Função para gerar embeddings de documentos
 * e armazená-los no Supabase para uso com pgvector
 */
export async function generateEmbeddings(content: string): Promise<number[]> {
  // Implementação futura:
  // - Integrar com um serviço de embeddings (OpenAI, HuggingFace, etc.)
  // - Retornar o vetor de embeddings para armazenar no Supabase
  return Array(384).fill(0); // Placeholder de 384 dimensões
}

/**
 * Adiciona um novo documento à base de conhecimento
 */
export async function addToKnowledgeBase(
  clientId: string,
  content: string,
  embedding?: number[],
): Promise<string | null> {
  try {
    const chunk_id = crypto.randomUUID();

    // Se não for fornecido um embedding, usar o placeholder
    const vectorEmbedding = embedding || Array(384).fill(0);

    const { data, error } = await supabaseClient
      .from("knowledge_base_chunks")
      .insert([
        {
          chunk_id,
          client_id: clientId,
          content,
          embedding: vectorEmbedding,
        },
      ])
      .select();

    if (error) {
      console.error("Error adding to knowledge base:", error);
      return null;
    }

    return chunk_id;
  } catch (error) {
    console.error("Error in knowledge base insertion:", error);
    return null;
  }
}
