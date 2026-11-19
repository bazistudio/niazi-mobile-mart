export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface MessageImageContent {
  readonly type: 'image_url' | 'base64';
  readonly data: string;
  readonly mimeType?: string;
}

export interface AIRequestMessage {
  readonly role: MessageRole;
  readonly content: string;
  readonly name?: string;
  readonly toolCallId?: string;
  readonly images?: readonly MessageImageContent[];
}

