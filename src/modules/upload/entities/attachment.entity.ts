import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { AttachmentKind } from '../../../common/enums/index.js';
import { User } from '../../user/entities/user.entity.js';
import type { Message } from '../../conversation/entities/message.entity.js';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid', nullable: false })
  uploaderId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'uploaderId' })
  uploader!: User;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  messageId!: string | null;

  @ManyToOne('Message', 'attachments', {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'messageId' })
  message!: Message | null;

  @Column({ type: 'varchar', length: 16, nullable: false })
  kind!: AttachmentKind;

  @Column({ type: 'varchar', length: 255, nullable: false })
  filename!: string;

  @Column({ type: 'varchar', length: 512, nullable: false })
  storagePath!: string;

  @Column({ type: 'varchar', length: 128, nullable: false })
  mimeType!: string;

  @Column({ type: 'integer', nullable: false })
  size!: number;

  @Column({ type: 'text', nullable: true })
  extractedText!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
