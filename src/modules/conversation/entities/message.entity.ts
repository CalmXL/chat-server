import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { MessageRole, MessageStatus } from '../../../common/enums/index.js';
import type { Conversation } from './conversation.entity.js';
import { Attachment } from '../../upload/entities/attachment.entity.js';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: false })
  conversationId!: string;

  @ManyToOne('Conversation', 'messages', {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'conversationId' })
  conversation!: Conversation;

  @Column({ type: 'varchar', length: 16, nullable: false })
  role!: MessageRole;

  @Column({ type: 'text', nullable: false })
  content!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  modelId!: string | null;

  @Column({
    type: 'varchar',
    length: 16,
    default: MessageStatus.DONE,
  })
  status!: MessageStatus;

  @Column({ type: 'jsonb', nullable: true })
  tokenUsage!: TokenUsage | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany(() => Attachment, (attachment) => attachment.message)
  attachments!: Attachment[];
}
