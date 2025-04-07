# UAZAPI SDK for TypeScript

A complete TypeScript SDK for interacting with the UAZAPI WhatsApp API.

## Installation

```bash
npm install uazapi-sdk
```

## Features

- Full TypeScript support with comprehensive type definitions
- Complete coverage of all UAZAPI endpoints
- Automatic request retry mechanism
- Easy-to-use promise-based API
- Detailed examples for all features

## Quick Start

```typescript
import { UazapiClient } from 'uazapi-sdk';

// Initialize the client
const client = new UazapiClient({
  baseUrl: 'https://free.uazapi.com', // Optional
  token: 'your-instance-token',
  adminToken: 'your-admin-token', // Optional - for admin operations
});

// Connect to WhatsApp
async function connectToWhatsApp() {
  try {
    const status = await client.instance.getStatus();
    console.log('Current status:', status.instance.status);

    if (status.instance.status !== 'connected') {
      const result = await client.instance.connect({
        phone: '5511999999999'
      });
      console.log('Connection initiated:', result.status);
    }
  } catch (error) {
    console.error('Error connecting to WhatsApp:', error);
  }
}

// Send a text message
async function sendMessage() {
  try {
    const result = await client.message.sendText({
      number: '5511999999999',
      text: 'Hello from UAZAPI SDK!',
      linkPreview: true
    });
    
    console.log('Message sent:', result.id);
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

// Run examples
connectToWhatsApp()
  .then(() => sendMessage())
  .catch(console.error);
```

## API Documentation

### Client Initialization

```typescript
const client = new UazapiClient({
  baseUrl: 'https://free.uazapi.com', // Optional, defaults to 'https://free.uazapi.com'
  token: 'your-instance-token', // Required
  adminToken: 'your-admin-token', // Optional, required for admin operations
  timeout: 30000, // Optional, request timeout in milliseconds
  retry: true, // Optional, whether to retry failed requests
  maxRetries: 3, // Optional, maximum number of retries
  retryDelay: 1000 // Optional, delay between retries in milliseconds
});
```

### Instance Management

```typescript
// Get instance status
const status = await client.instance.getStatus();

// Connect to WhatsApp
const connect = await client.instance.connect({ phone: '5511999999999' });

// Disconnect from WhatsApp
const disconnect = await client.instance.disconnect();

// Hibernate instance (pause connection but keep session)
const hibernate = await client.instance.hibernate();

// Update instance name
const updateName = await client.instance.updateName('New Instance Name');

// Delete instance
const deleteInstance = await client.instance.delete();
```

### Messaging

```typescript
// Send text message
const text = await client.message.sendText({
  number: '5511999999999',
  text: 'Hello!',
  linkPreview: true
});

// Send media message
const media = await client.message.sendMedia({
  number: '5511999999999',
  type: 'image',
  file: 'https://example.com/image.jpg',
  text: 'Check this out!'
});

// Send interactive menu
const menu = await client.message.sendMenu({
  number: '5511999999999',
  type: 'list',
  text: 'Choose an option:',
  buttonText: 'Options',
  choices: [
    '[Products]',
    'Product A',
    'Product B',
    '[Services]',
    'Service X',
    'Service Y'
  ]
});

// Send contact card
const contact = await client.message.sendContact({
  number: '5511999999999',
  fullName: 'John Doe',
  phoneNumber: '5511888888888'
});

// Send location
const location = await client.message.sendLocation({
  number: '5511999999999',
  latitude: -23.5505,
  longitude: -46.6333,
  name: 'São Paulo'
});
```

### Groups Management

```typescript
// Create a group
const group = await client.group.create({
  name: 'My Group',
  participants: ['5511999999991', '5511999999992']
});

// Get group info
const groupInfo = await client.group.getInfo({
  groupjid: '123456789@g.us',
  getInviteLink: true
});

// Update group participants
const updateParticipants = await client.group.updateParticipants({
  groupjid: '123456789@g.us',
  action: 'add',
  participants: ['5511999999993']
});

// Update group name
const updateName = await client.group.updateName({
  groupjid: '123456789@g.us',
  name: 'New Group Name'
});
```

### Chatbot & AI

```typescript
// List AI agents
const agents = await client.agent.list();

// Create an AI agent
const agent = await client.agent.edit({
  agent: {
    name: 'Customer Support',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    apikey: 'sk-your-openai-key'
  }
});

// List triggers
const triggers = await client.chatbot.listTriggers();

// Create a trigger
const trigger = await client.chatbot.editTrigger({
  trigger: {
    type: 'agent',
    agent_id: 'your-agent-id',
    wordsToStart: 'help|support'
  }
});

// Update chatbot settings
const settings = await client.instance.updateChatbotSettings({
  chatbot_enabled: true,
  chatbot_ignoreGroups: true
});
```

### Mass Messaging

```typescript
// Create a simple campaign
const campaign = await client.sender.simple({
  numbers: ['5511999999991', '5511999999992'],
  type: 'text',
  text: 'Hello from our campaign!',
  delayMin: 10,
  delayMax: 30,
  scheduled_for: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
});

// List campaign folders
const folders = await client.sender.listFolders();

// List messages in a campaign
const messages = await client.sender.listMessages({
  folder_id: 'your-folder-id'
});
```

## Complete Documentation

For complete documentation of all available methods and types, please see the [TypeScript declarations](./dist/index.d.ts) or check the source code.

## Error Handling

The SDK throws `UazapiError` for all errors, which includes:

- `status`: HTTP status code (if available)
- `message`: Error message
- `originalError`: Original error object (if available)

Example:

```typescript
try {
  await client.message.sendText({
    number: '5511999999999',
    text: 'Hello!'
  });
} catch (error) {
  if (error instanceof UazapiError) {
    console.error(`Error ${error.status}: ${error.message}`);
  } else {
    console.error('Unknown error:', error);
  }
}
```

## License

MIT