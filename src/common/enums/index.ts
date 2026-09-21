export enum DeviceType {
  WEB = 'web',
  MOBILE = 'mobile',
  DESKTOP = 'desktop',
  OTHER = 'other',
}

export enum UserStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  PENDING = 'pending',
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
}

export enum MessageStatus {
  STREAMING = 'streaming',
  DONE = 'done',
  PARTIAL = 'partial',
  ERROR = 'error',
}

export enum AttachmentKind {
  IMAGE = 'image',
  DOCUMENT = 'document',
}
