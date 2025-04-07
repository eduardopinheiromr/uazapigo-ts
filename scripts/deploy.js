#!/usr/bin/env node

/**
 * Script de deploy para o WhatsApp Bot
 * 
 * Este script automatiza o processo de deploy da aplicação, realizando as seguintes tarefas:
 * 1. Verificação do ambiente
 * 2. Build da aplicação
 * 3. Migrações de banco de dados (se necessário)
 * 4. Deploy para o ambiente especificado (staging ou production)
 * 5. Configuração do webhook nas instâncias UAZAPI
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configurações
const CONFIG = {
  environments: {
    staging: {
      url: 'https://staging-whatsapp-bot.vercel.app',
      webhook: '/api/webhook'
    },
    production: {
      url: 'https://whatsapp-bot.vercel.app',
      webhook: '/api/webhook'
    }
  },
  vercelProject: 'whatsapp-bot',
  vercelTeam: 'your-team-name', // Se aplicável
};

// Criar interface para input/output
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Executa um comando e retorna a saída
 */
function runCommand(command, silent = false) {
  try {
    if (!silent) {
      console.log(`Executando: ${command}`);
    }
    const output = execSync(command, { encoding: 'utf8' });
    if (!silent) {
      console.log('Comando executado com sucesso');
    }
    return output.trim();
  } catch (error) {
    console.error(`Erro ao executar comando: ${command}`);
    console.error(error.message);
    process.exit(1);
  }
}

/**
 * Pergunta ao usuário
 */
function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Verifica se o ambiente está configurado corretamente
 */
async function checkEnvironment() {
  console.log('\n🔍 Verificando ambiente...');
  
  // Verificar se temos o Node.js instalado
  const nodeVersion = runCommand('node --version', true);
  console.log(`Node.js: ${nodeVersion}`);
  
  // Verificar se Vercel CLI está instalado
  try {
    const vercelVersion = runCommand('vercel --version', true);
    console.log(`Vercel CLI: ${vercelVersion}`);
  } catch (error) {
    console.error('❌ Vercel CLI não encontrado. Instale com: npm i -g vercel');
    process.exit(1);
  }
  
  // Verificar se estamos logados na Vercel
  try {
    const vercelUser = runCommand('vercel whoami', true);
    console.log(`Vercel User: ${vercelUser}`);
  } catch (error) {
    console.error('❌ Não está logado na Vercel. Faça login com: vercel login');
    process.exit(1);
  }
  
  // Verificar se o arquivo .env.local existe
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️ Arquivo .env.local não encontrado');
    const createEnv = await prompt('Deseja criar um arquivo .env.local básico? (s/n) ');
    if (createEnv.toLowerCase() === 's') {
      const envContent = `# Configurações do WhatsApp Bot
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
SUPABASE_URL=
SUPABASE_ANON_KEY=
GOOGLE_API_KEY=
UAZAPIGO_API_KEY=
WHATSAPP_VERIFY_TOKEN=
WEBHOOK_URL=
`;
      fs.writeFileSync(envPath, envContent);
      console.log('✅ Arquivo .env.local criado! Preencha as variáveis antes de continuar.');
      process.exit(0);
    }
  } else {
    console.log('✅ Arquivo .env.local encontrado');
  }
  
  console.log('✅ Ambiente verificado com sucesso!');
}

/**
 * Realiza o build da aplicação
 */
async function buildApp() {
  console.log('\n🔨 Realizando build da aplicação...');
  
  // Instalar dependências
  console.log('Instalando dependências...');
  runCommand('npm install');
  
  // Verificar tipos TypeScript
  console.log('Verificando tipos TypeScript...');
  runCommand('npm run typecheck');
  
  // Executar testes
  const runTests = await prompt('Deseja executar os testes? (s/n) ');
  if (runTests.toLowerCase() === 's') {
    console.log('Executando testes...');
    runCommand('npm test');
  }
  
  // Realizar build
  console.log('Realizando build...');
  runCommand('npm run build');
  
  console.log('✅ Build realizado com sucesso!');
}

/**
 * Realiza as migrações de banco de dados (se necessário)
 */
async function runMigrations() {
  console.log('\n🗄️ Verificando migrações de banco de dados...');
  
  const runMigration = await prompt('Deseja executar migrações de banco de dados? (s/n) ');
  if (runMigration.toLowerCase() !== 's') {
    console.log('Pulando migrações...');
    return;
  }
  
  // Verificar se existe um diretório de migrações
  const migrationsDir = path.join(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    console.warn('⚠️ Diretório de migrações não encontrado');
    return;
  }
  
  // Listar migrações disponíveis
  const migrations = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql'));
  if (migrations.length === 0) {
    console.log('Nenhuma migração encontrada');
    return;
  }
  
  console.log('Migrações disponíveis:');
  migrations.forEach((migration, index) => {
    console.log(`${index + 1}. ${migration}`);
  });
  
  const migrationIndex = await prompt('Digite o número da migração a ser executada (ou 0 para todas): ');
  const index = parseInt(migrationIndex, 10);
  
  if (isNaN(index) || index < 0 || index > migrations.length) {
    console.error('Índice inválido. Operação cancelada.');
    return;
  }
  
  // Executar migrações selecionadas
  console.log('Executando migrações...');
  // Aqui você implementaria a lógica para conectar ao Supabase e executar as migrações
  console.log('⚠️ Implementação das migrações será necessária com base na sua estrutura');
  console.log('✅ Migrações concluídas (simulação)!');
}

/**
 * Deploy para o ambiente especificado
 */
async function deployToEnvironment() {
  console.log('\n🚀 Preparando deploy...');
  
  // Escolher ambiente
  console.log('Ambientes disponíveis:');
  console.log('1. Staging');
  console.log('2. Production');
  
  const envChoice = await prompt('Escolha o ambiente (1 ou 2): ');
  const environment = envChoice === '1' ? 'staging' : 'production';
  
  // Confirmar deploy
  const envConfig = CONFIG.environments[environment];
  console.log(`\nDeploy para ${environment.toUpperCase()}:`);
  console.log(`URL: ${envConfig.url}`);
  console.log(`Webhook: ${envConfig.url}${envConfig.webhook}`);
  
  const confirm = await prompt('\nConfirma o deploy? (s/n) ');
  if (confirm.toLowerCase() !== 's') {
    console.log('Deploy cancelado.');
    process.exit(0);
  }
  
  // Realizar deploy com Vercel
  console.log(`\nRealizando deploy para ${environment}...`);
  
  let deployCommand = `vercel deploy --prod`;
  if (environment === 'staging') {
    deployCommand = `vercel deploy`;
  }
  
  if (CONFIG.vercelTeam) {
    deployCommand += ` --scope ${CONFIG.vercelTeam}`;
  }
  
  runCommand(deployCommand);
  
  console.log(`✅ Deploy para ${environment} realizado com sucesso!`);
}

/**
 * Configurar webhook nas instâncias UAZAPI
 */
async function configureWebhook() {
  console.log('\n🔄 Configurando webhook nas instâncias UAZAPI...');
  
  const configWebhook = await prompt('Deseja configurar o webhook nas instâncias UAZAPI? (s/n) ');
  if (configWebhook.toLowerCase() !== 's') {
    console.log('Pulando configuração de webhook...');
    return;
  }
  
  // Escolher ambiente
  console.log('Ambientes disponíveis:');
  console.log('1. Staging');
  console.log('2. Production');
  
  const envChoice = await prompt('Escolha o ambiente (1 ou 2): ');
  const environment = envChoice === '1' ? 'staging' : 'production';
  const envConfig = CONFIG.environments[environment];
  
  const webhookUrl = `${envConfig.url}${envConfig.webhook}`;
  console.log(`\nURL do webhook: ${webhookUrl}`);
  
  // Na implementação real, você usaria a API do UAZAPI para configurar o webhook
  console.log('⚠️ Implementação da configuração automática do webhook será necessária');
  console.log('Por enquanto, configure manualmente o webhook no dashboard do UAZAPI:');
  console.log(`1. Acesse o dashboard do UAZAPI`);
  console.log(`2. Vá para Configurações > Webhook`);
  console.log(`3. Configure a URL: ${webhookUrl}`);
  console.log(`4. Habilite os eventos de mensagens`);
  
  console.log('\n✅ Instruções para configuração de webhook fornecidas!');
}

/**
 * Função principal
 */
async function main() {
  console.log('🤖 Deploy do WhatsApp Bot 🤖');
  console.log('============================');
  
  // Verificar ambiente
  await checkEnvironment();
  
  // Realizar build
  await buildApp();
  
  // Executar migrações
  await runMigrations();
  
  // Deploy para ambiente
  await deployToEnvironment();
  
  // Configurar webhook
  await configureWebhook();
  
  console.log('\n🎉 Processo de deploy concluído com sucesso! 🎉');
  rl.close();
}

// Executar função principal
main().catch(error => {
  console.error('Erro durante o deploy:', error);
  process.exit(1);
});