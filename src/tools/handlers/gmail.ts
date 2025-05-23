import { google } from 'googleapis';
import { ToolContext } from './index';

export async function handleGmailTool(
  toolName: string,
  params: any,
  context: ToolContext
): Promise<any> {
  const auth = await context.tokenManager.getAuthClient(context.userId);
  const gmail = google.gmail({ version: 'v1', auth });

  switch (toolName) {
    case 'gmail_search_messages':
      return searchMessages(gmail, params);
    
    case 'gmail_get_message':
      return getMessage(gmail, params);
    
    case 'gmail_send_message':
      return sendMessage(gmail, params);
    
    case 'gmail_modify_labels':
      return modifyLabels(gmail, params);
    
    case 'gmail_trash_message':
      return trashMessage(gmail, params);
    
    case 'gmail_untrash_message':
      return untrashMessage(gmail, params);
    
    case 'gmail_create_draft':
      return createDraft(gmail, params);
    
    case 'gmail_list_labels':
      return listLabels(gmail);
    
    default:
      throw new Error(`Unknown Gmail tool: ${toolName}`);
  }
}

async function searchMessages(gmail: any, params: any) {
  const response = await gmail.users.messages.list({
    userId: 'me',
    q: params.query,
    maxResults: params.maxResults || 10,
    includeSpamTrash: params.includeSpamTrash || false
  });

  if (!response.data.messages) {
    return { messages: [] };
  }

  // Get full message details for each result
  const messages = await Promise.all(
    response.data.messages.map(async (msg: any) => {
      const fullMessage = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Date']
      });
      
      return {
        id: fullMessage.data.id,
        threadId: fullMessage.data.threadId,
        snippet: fullMessage.data.snippet,
        headers: fullMessage.data.payload.headers
      };
    })
  );

  return { messages };
}

async function getMessage(gmail: any, params: any) {
  const response = await gmail.users.messages.get({
    userId: 'me',
    id: params.messageId,
    format: params.format || 'full'
  });

  return response.data;
}

async function sendMessage(gmail: any, params: any) {
  // Create the email message
  const messageParts = [
    `To: ${params.to.join(', ')}`,
    `Subject: ${params.subject}`,
  ];

  if (params.cc) {
    messageParts.push(`Cc: ${params.cc.join(', ')}`);
  }
  if (params.bcc) {
    messageParts.push(`Bcc: ${params.bcc.join(', ')}`);
  }

  messageParts.push('Content-Type: text/html; charset=utf-8');
  messageParts.push('');
  messageParts.push(params.body);

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage
    }
  });

  return response.data;
}

async function modifyLabels(gmail: any, params: any) {
  const response = await gmail.users.messages.modify({
    userId: 'me',
    id: params.messageId,
    requestBody: {
      addLabelIds: params.addLabels || [],
      removeLabelIds: params.removeLabels || []
    }
  });

  return response.data;
}

async function trashMessage(gmail: any, params: any) {
  const response = await gmail.users.messages.trash({
    userId: 'me',
    id: params.messageId
  });

  return response.data;
}

async function untrashMessage(gmail: any, params: any) {
  const response = await gmail.users.messages.untrash({
    userId: 'me',
    id: params.messageId
  });

  return response.data;
}

async function createDraft(gmail: any, params: any) {
  const messageParts = [
    `To: ${params.to.join(', ')}`,
    `Subject: ${params.subject}`,
  ];

  if (params.cc) {
    messageParts.push(`Cc: ${params.cc.join(', ')}`);
  }
  if (params.bcc) {
    messageParts.push(`Bcc: ${params.bcc.join(', ')}`);
  }

  messageParts.push('Content-Type: text/html; charset=utf-8');
  messageParts.push('');
  messageParts.push(params.body);

  const message = messageParts.join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw: encodedMessage
      }
    }
  });

  return response.data;
}

async function listLabels(gmail: any) {
  const response = await gmail.users.labels.list({
    userId: 'me'
  });

  return { labels: response.data.labels || [] };
}