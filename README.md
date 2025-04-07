# WhatsApp Bot com UAZAPI e Next.js

Um sistema completo de chatbot para WhatsApp construído com Next.js, utilizando a API UAZAPI para comunicação com o WhatsApp e Google Gemini para inteligência artificial.

## 🌟 Características

- **IA Generativa**: Utiliza o Google Gemini para compreender e responder mensagens naturalmente
- **Agendamento de Serviços**: Sistema completo para agendamento, consulta e cancelamento de serviços
- **Administração via WhatsApp**: Comandos administrativos via chat para gerenciar o bot
- **Suporte a Múltiplos Negócios**: Arquitetura escalável para atender múltiplos clientes
- **RAG (Retrieval Augmented Generation)**: Enriquece respostas com conhecimento específico do negócio
- **Cache Redis**: Sistema eficiente de cache para melhorar performance
- **Armazenamento Supabase**: Banco de dados PostgreSQL via Supabase
- **Arquitetura Serverless**: Facilmente implantável em plataformas como Vercel

## 📋 Pré-requisitos

- Node.js 18+ e npm
- Conta no [UAZAPI](https://uazapi.com) para API do WhatsApp
- Conta no [Supabase](https://supabase.com) para banco de dados
- Conta no [Upstash](https://upstash.com) para Redis serverless
- Chave API do [Google AI](https://ai.google.dev/) para acesso ao Gemini

## 🚀 Instalação

1. Clone o repositório
```bash
git clone https://github.com/seu-usuario/whatsapp-bot.git
cd whatsapp-bot
```

2. Instale as dependências
```bash
npm install
```

3. Configure as variáveis de ambiente
Crie um arquivo `.env.local` com as seguintes variáveis:
```env
# UAZAPI
UAZAPIGO_API_KEY=sua_chave_api_uazapi

# Supabase
SUPABASE_URL=sua_url_supabase
SUPABASE_ANON_KEY=sua_chave_anonima_supabase

# Redis
UPSTASH_REDIS_REST_URL=sua_url_redis_upstash
UPSTASH_REDIS_REST_TOKEN=seu_token_redis_upstash

# Google API
GOOGLE_API_KEY=sua_chave_api_google

# Segurança
WHATSAPP_VERIFY_TOKEN=token_seguro_aleatorio_para_webhook

# Webhook (apenas para produção)
WEBHOOK_URL=https://sua-aplicacao.com
```

4. Execute o projeto em desenvolvimento
```bash
npm run dev
```

## 🏗️ Estrutura do Projeto

```
├── lib/                    # Bibliotecas e lógica principal
│   ├── adminHandler.ts     # Manipulador de comandos administrativos
│   ├── coreLogic.ts        # Lógica principal de processamento de mensagens
│   ├── googleAiClient.ts   # Cliente para API do Google Gemini
│   ├── intentDetector.ts   # Sistema de detecção de intenções
│   ├── logger.ts           # Sistema de logs
│   ├── rag.ts              # Sistema de Retrieval Augmented Generation
│   ├── redisClient.ts      # Cliente para cache Redis
│   ├── scheduling.ts       # Lógica de agendamento de serviços
│   ├── supabaseClient.ts   # Cliente para banco de dados Supabase
│   ├── uazapiAdapter.ts    # Adaptador para webhook do UAZAPI
│   ├── uazapiGoClient.ts   # Cliente para API UAZAPI
│   └── utils.ts            # Funções utilitárias
├── pages/                  # Páginas Next.js
│   ├── api/                # Endpoints da API
│   │   └── webhook/        # Webhook para UAZAPI
│   │       └── [...events].ts # Handler de webhook
├── sdk/                    # SDK UAZAPI (fornecido pelo projeto)
├── scripts/                # Scripts utilitários
│   └── deploy.js           # Script de deploy
├── tests/                  # Testes automatizados
├── types/                  # Definições de tipos TypeScript
│   └── index.ts            # Tipos globais do projeto
└── README.md               # Documentação
```

## 🔧 Configuração do Banco de Dados

O sistema utiliza [Supabase](https://supabase.com) como banco de dados PostgreSQL. A estrutura inclui as seguintes tabelas:

### Tabela `businesses`
- `business_id` - Identificador único do negócio
- `name` - Nome do negócio
- `waba_number` - Número do WhatsApp Business API
- `admin_phone` - Número do administrador do negócio
- `config` - Configurações em JSONB

### Outras tabelas incluem:
- `customers` - Clientes do negócio
- `services` - Serviços oferecidos
- `appointments` - Agendamentos realizados
- `schedule_blocks` - Bloqueios na agenda
- `knowledge_base_chunks` - Base de conhecimento para RAG
- `admins` - Administradores adicionais
- `conversation_history` - Histórico de mensagens

Execute o script SQL encontrado em `migrations/init.sql` para criar a estrutura inicial no seu banco de dados Supabase.

## 📱 Comandos Administrativos

Os seguintes comandos administrativos estão disponíveis através do WhatsApp para o número administrador:

### Gerais
- `ajuda` - Exibe comandos disponíveis

### Configuração
- `mostrar prompt` - Visualiza prompt atual
- `atualizar prompt: [texto]` - Altera o prompt base

### Serviços
- `mostrar serviços` - Lista serviços cadastrados
- `adicionar serviço` - Cadastra novo serviço
- `atualizar serviço` - Modifica serviço existente
- `ativar serviço: [nome]` - Ativa um serviço
- `desativar serviço: [nome]` - Desativa um serviço

### RAG
- `ativar rag` - Ativa RAG
- `desativar rag` - Desativa RAG

### Horários
- `mostrar horários` - Ver horários de funcionamento
- `atualizar horários` - Modificar horários de funcionamento

### Agenda
- `bloquear agenda` - Criar bloqueio na agenda
- `ver bloqueios` - Listar bloqueios de agenda

### Relatórios
- `estatísticas` - Ver estatísticas gerais

## 🧪 Testes

Execute os testes automatizados:

```bash
npm test
```

## 🚢 Deploy

Para realizar o deploy, você pode usar o script automatizado:

```bash
node scripts/deploy.js
```

Ou manualmente:
```bash
npm run build
vercel deploy --prod
```

## 🔄 Configurando o Webhook

1. Faça deploy da aplicação em um servidor acessível publicamente
2. Configure o webhook no dashboard do UAZAPI:
   - URL: `https://seu-dominio.com/api/webhook`
   - Eventos: Mensagens, Status, etc.
3. Certifique-se de que o token de segurança no webhook corresponde ao configurado em `WHATSAPP_VERIFY_TOKEN`

## 🛠️ Configuração do RAG (Retrieval Augmented Generation)

1. Adicione documentos à base de conhecimento usando o endpoint `/api/admin/knowledge`
2. Ative o RAG usando o comando administrativo `ativar rag`
3. O sistema automaticamente enriquecerá as respostas com informações relevantes

## 📚 Fluxo do Sistema

1. O webhook recebe eventos do UAZAPI
2. O adaptador processa e enriquece os dados
3. A lógica principal detecta intenções (comandos, agendamento, etc.)
4. Respostas são geradas via IA ou fluxos estruturados
5. A resposta é enviada ao usuário via API UAZAPI

## 🤝 Contribuição

Contribuições são bem-vindas! Por favor, siga estes passos:

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/NovaFeature`)
3. Faça commit de suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Faça push para a branch (`git push origin feature/NovaFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para detalhes.

## 📧 Contato

Para questões ou suporte, por favor entre em contato via [email@exemplo.com](mailto:email@exemplo.com).

---

Desenvolvido com 💙 usando Next.js, UAZAPI e Google Gemini.