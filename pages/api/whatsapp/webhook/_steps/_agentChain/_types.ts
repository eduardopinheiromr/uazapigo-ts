// pages/api/whatsapp/webhook/_steps/_agentChain/_types.ts

export interface NodeInput {
  businessId: string;
  userPhone: string;
  session: any;
  isAdmin: boolean;
  payload?: any;
  [key: string]: any;
}

export interface NodeOutput extends NodeInput {
  prompt?: string;
  modelResponse?: any;
  toolResponses?: Array<{
    name: string;
    args: any;
    result: any;
  }>;
  finalResponse?: string;
  responseText?: string;
  meta?: any;
  [key: string]: any;
}

export type NodeFunction = (input: NodeInput) => Promise<NodeOutput>;

export interface ToolResult {
  [key: string]: any;
  error?: string;
}
