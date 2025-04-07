// lib/uazapigoClient.ts

import { UazapiClient } from "@/sdk/sdk";

// Configuração do cliente
const UAZAPIGO_API_KEY = process.env.UAZAPIGO_API_KEY;
const INSTANCE_NAME_CLIENT0 = process.env.UAZAPIGO_INSTANCE_NAME_CLIENT0;

// Mapeamento de clientId para token de instância
const clientInstanceMap: Record<string, { baseUrl: string; token: string }> = {
  business0: {
    baseUrl: "https://recepcionistai.uazapi.com",
    token: "dbdf648a-5320-4c4a-993d-275910a11286",
  },
};

if (!UAZAPIGO_API_KEY) {
  throw new Error("Missing UAZAPIGO_API_KEY environment variable");
}

/**
 * Obtém o token de instância para um clientId
 */
export function getInstanceForClient(clientId: string) {
  console.log({ clientId });
  const instanceToken = clientInstanceMap[clientId];
  if (!instanceToken) {
    throw new Error(`No instance found for client: ${clientId}`);
  }
  return instanceToken;
}

// Criando uma instância da SDK
const getUazapiClientByClientId = (clientId: string) => {
  const instance = clientInstanceMap[clientId];
  return new UazapiClient({
    baseUrl: instance.baseUrl,
    token: instance.token,
    retry: true,
    maxRetries: 3,
  });
};

/**
 * Envia uma mensagem de texto via UazapiGO
 */
export async function sendTextMessage(
  clientId: string,
  phoneNumber: string,
  text: string,
): Promise<string> {
  try {
    const uazapiClient = getUazapiClientByClientId(clientId);

    const result = await uazapiClient.message.sendText({
      number: phoneNumber,
      text: text,
      linkPreview: true,
    });

    return result.id;
  } catch (error) {
    console.error(`Error sending message to ${phoneNumber}:`, error);
    throw new Error(`Failed to send message: ${error}`);
  }
}

/**
 * Envia uma imagem via UazapiGO
 */
export async function sendImageMessage(
  clientId: string,
  phoneNumber: string,
  imageUrl: string,
  caption?: string,
): Promise<string> {
  try {
    const uazapiClient = getUazapiClientByClientId(clientId);

    const result = await uazapiClient.message.sendMedia({
      number: phoneNumber,
      type: "image",
      file: imageUrl,
      text: caption,
    });

    return result.id;
  } catch (error) {
    console.error(`Error sending image to ${phoneNumber}:`, error);
    throw new Error(`Failed to send image: ${error}`);
  }
}

/**
 * Envia um documento via UazapiGO
 */
export async function sendDocumentMessage(
  clientId: string,
  phoneNumber: string,
  documentUrl: string,
  filename: string,
  caption?: string,
): Promise<string> {
  try {
    const uazapiClient = getUazapiClientByClientId(clientId);

    const result = await uazapiClient.message.sendMedia({
      number: phoneNumber,
      type: "document",
      file: documentUrl,
      docName: filename,
      text: caption,
    });

    return result.id;
  } catch (error) {
    console.error(`Error sending document to ${phoneNumber}:`, error);
    throw new Error(`Failed to send document: ${error}`);
  }
}

/**
 * Verifica o status da instância
 */
export async function checkInstanceStatus(clientId: string): Promise<boolean> {
  try {
    const uazapiClient = getUazapiClientByClientId(clientId);

    const status = await uazapiClient.instance.getStatus();
    return status.status.connected && status.status.loggedIn;
  } catch (error) {
    console.error(`Error checking instance status for ${clientId}:`, error);
    return false;
  }
}
