# UazapiGO Chatbot Backend

Backend para chatbot WhatsApp multi-cliente utilizando Next.js, UazapiGO, Supabase, Redis e Google Gemini.

## Requisitos

- Node.js 18+ 
- PNPM
- Conta na UazapiGO
- Conta no Supabase
- Conta no Upstash Redis
- Chave de API do Google AI (Gemini)

## Configuração

1. Clone o repositório
2. Instale as dependências:

```bash
pnpm install
```

3. Configure as variáveis de ambiente:

Copie o arquivo `.env.example` para `.env` e preencha com suas credenciais:

```bash
cp .env.example .env
```

4. Execute o projeto localmente:

```bash
pnpm dev
```

5. Para expor seu servidor local à internet (para testes do webhook), use ngrok:

```bash
npx ngrok http 3000
```

6. Configure o webhook no painel da UazapiGO com a URL gerada pelo ngrok:
   - URL: `https://seu-id-ngrok.ngrok.io/api/whatsapp/webhook`
   - Token de verificação: Mesmo valor configurado em `WHATSAPP_VERIFY_TOKEN`

## Estrutura do Projeto

- `/app` - Rotas e componentes Next.js
- `/app/api` - Route Handlers da API
- `/lib` - Módulos compartilhados
- `/types` - Definições de tipos TypeScript

## Deploy na Vercel

1. Conecte seu repositório à Vercel
2. Configure as variáveis de ambiente no painel da Vercel
3. Deploy!

## Configuração do Supabase

Execute os seguintes comandos SQL no Supabase para configurar o banco de dados:

```sql
-- Habilitar extensão vector para busca semântica
CREATE EXTENSION IF NOT EXISTS vector;

-- Tabela de clientes
CREATE TABLE clients (
  client_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  waba_number TEXT UNIQUE,
  config JSONB DEFAULT '{}'::JSONB
);

-- Tabela de base de conhecimento
CREATE TABLE knowledge_base_chunks (
  chunk_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(client_id),
  content TEXT NOT NULL,
  embedding VECTOR(384)
);

-- Tabela de agendamentos
CREATE TABLE appointments (
  appointment_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES clients(client_id),
  customer_phone TEXT NOT NULL,
  service TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
);

-- Índices
CREATE INDEX idx_appointments_client_id ON appointments(client_id);
CREATE INDEX idx_appointments_customer_phone ON appointments(customer_phone);
CREATE INDEX idx_appointments_start_time ON appointments(start_time);

-- Função para busca semântica
CREATE OR REPLACE FUNCTION match_knowledge_base (
  query_embedding VECTOR(384),
  match_threshold FLOAT,
  match_count INT,
  client_filter UUID
)
RETURNS TABLE (
  chunk_id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.chunk_id,
    kb.content,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base_chunks AS kb
  WHERE kb.client_id = client_filter AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY similarity DESC
  LIMIT match_count;
END;
$$;

-- Função para criar agendamento (transação)
CREATE OR REPLACE FUNCTION create_appointment_transaction(
  p_client_id UUID,
  p_customer_phone TEXT,
  p_service TEXT,
  p_start_time TIMESTAMPTZ,
  p_end_time TIMESTAMPTZ,
  p_status TEXT
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_appointment_id UUID;
  v_conflict_count INT;
BEGIN
  -- Verificar conflitos
  SELECT COUNT(*)
  INTO v_conflict_count
  FROM appointments
  WHERE client_id = p_client_id
    AND status = 'confirmed'
    AND (
      (start_time <= p_start_time AND end_time > p_start_time) OR
      (start_time < p_end_time AND end_time >= p_end_time) OR
      (start_time >= p_start_time AND end_time <= p_end_time)
    );
  
  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION 'Conflito de horário detectado';
  END IF;
  
  -- Inserir o agendamento
  INSERT INTO appointments (
    client_id,
    customer_phone,
    service,
    start_time,
    end_time,
    status
  )
  VALUES (
    p_client_id,
    p_customer_phone,
    p_service,
    p_start_time,
    p_end_time,
    p_status
  )
  RETURNING appointment_id INTO v_appointment_id;
  
  RETURN v_appointment_id;
END;
$$;

-- Dados iniciais para o cliente de teste (client0)
INSERT INTO clients (client_id, name, waba_number, config)
VALUES (
  'client0',
  'Cliente Teste',
  'sua_instancia_uazapigo',
  '{"ragEnabled": true, "maxHistoryMessages": 10, "sessionTtlHours": 2}'
);
```

## Licença

MIT