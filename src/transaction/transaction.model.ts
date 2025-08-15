import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BlockchainNetwork } from 'src/wallet/wallet.model';

export type TransactionDocument = Transaction & Document;

export enum TransactionType {
  SEND = 'send',
  RECEIVE = 'receive',
  PAYMENT_LINK = 'payment_link',
  SWAP = 'swap',
  STAKE = 'stake',
  UNSTAKE = 'unstake',
}

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

@Schema({
  timestamps: true,
  collection: 'transactions',
})
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  walletId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: String, enum: TransactionType, required: true })
  type: TransactionType;

  @Prop({ unique: true, sparse: true })
  hash?: string; // Blockchain transaction hash

  @Prop({ required: true })
  amount: string; // Amount in wei/smallest unit

  @Prop({ required: true })
  token: string; // Token symbol (USDC, USDT, etc.)

  @Prop({ required: true })
  tokenAddress: string; // Token contract address

  @Prop({ type: String, enum: BlockchainNetwork, required: true })
  network: BlockchainNetwork;

  @Prop({ required: true })
  fromAddress: string;

  @Prop({ required: true })
  toAddress: string;

  @Prop({
    type: String,
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Prop()
  gasFee?: string; // Gas fee in wei

  @Prop()
  gasPrice?: string; // Gas price in wei

  @Prop()
  gasUsed?: string; // Gas used

  @Prop()
  blockNumber?: number;

  @Prop()
  blockHash?: string;

  @Prop()
  confirmations?: number;

  // Payment link reference if applicable
  @Prop({ type: Types.ObjectId, ref: 'PaymentLink' })
  paymentLinkId?: Types.ObjectId;

  // Telegram context
  @Prop()
  telegramMessageId?: string;

  @Prop()
  telegramChatId?: string;

  // Transaction metadata
  @Prop()
  description?: string;

  @Prop()
  memo?: string;

  @Prop({ default: false })
  isInternal: boolean; // Internal transfer between app users

  @Prop({ type: Object })
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    deviceInfo?: string;
    initiatedBy?: 'user' | 'agent' | 'system';
    [key: string]: any;
  };

  // Error information if failed
  @Prop()
  errorCode?: string;

  @Prop()
  errorMessage?: string;

  @Prop({ type: Date })
  confirmedAt?: Date;

  @Prop({ type: Date })
  failedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

// Add indexes
TransactionSchema.index({ walletId: 1 });
TransactionSchema.index({ userId: 1 });
TransactionSchema.index({ hash: 1 }, { unique: true, sparse: true });
TransactionSchema.index({ status: 1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ network: 1 });
TransactionSchema.index({ fromAddress: 1 });
TransactionSchema.index({ toAddress: 1 });
TransactionSchema.index({ createdAt: -1 });
TransactionSchema.index({ paymentLinkId: 1 });
TransactionSchema.index({ token: 1 });

// Compound indexes
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ walletId: 1, status: 1 });
