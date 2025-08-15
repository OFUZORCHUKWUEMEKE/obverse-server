import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BlockchainNetwork } from 'src/wallet/wallet.model';

export type PaymentLinkDocument = PaymentLink & Document;

export enum PaymentLinkStatus {
  ACTIVE = 'active',
  EXPIRED = 'expired',
  DISABLED = 'disabled',
  COMPLETED = 'completed',
}

export enum PaymentLinkType {
  ONE_TIME = 'one_time',
  MULTIPLE_USE = 'multiple_use',
  SUBSCRIPTION = 'subscription',
}

@Schema({
  timestamps: true,
  collection: 'payment_links',
})
export class PaymentLink {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  creatorUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Wallet', required: true })
  creatorWalletId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  linkId: string; // Short unique identifier for the link

  @Prop({ required: true })
  amount: string; // Amount in equivalenT USD value

  @Prop({ required: true })
  token: string; // Token symbol (USDC, USDT, etc.)

  @Prop({ required: true })
  tokenAddress: string; // Token contract address

  @Prop({ type: String, enum: BlockchainNetwork, required: true })
  network: BlockchainNetwork;

  @Prop({
    type: String,
    enum: PaymentLinkType,
    default: PaymentLinkType.ONE_TIME,
  })
  type: PaymentLinkType;

  @Prop({
    type: String,
    enum: PaymentLinkStatus,
    default: PaymentLinkStatus.ACTIVE,
  })
  status: PaymentLinkStatus;

  @Prop({ required: true })
  title: string;

  @Prop()
  description?: string;

  @Prop()
  recipientName?: string;

  @Prop({ required: true })
  linkUrl: string; // Full payment URL

  @Prop()
  qrCodeUrl?: string; // QR code image URL

  @Prop({ type: Date })
  expiresAt?: Date;

  @Prop({ default: 1 })
  maxUses: number; // -1 for unlimited

  @Prop({ default: 0 })
  currentUses: number;

  @Prop({ default: 0 })
  totalAmountReceived: string; // Total amount received in wei

  @Prop([
    {
      type: Types.ObjectId,
      ref: 'Transaction',
    },
  ])
  transactions: Types.ObjectId[]; // Associated transactions

  @Prop([
    {
      payerAddress: String,
      amount: String,
      transactionHash: String,
      paidAt: Date,
      metadata: Object,
    },
  ])
  payments: {
    payerAddress: string;
    amount: string;
    transactionHash: string;
    paidAt: Date;
    metadata?: any;
  }[];

  // Telegram context
  @Prop()
  telegramMessageId?: string;

  @Prop()
  telegramChatId?: string;

  // Security and privacy
  @Prop({ default: false })
  requiresAuth: boolean;

  @Prop([String])
  allowedPayers?: string[]; // Specific addresses that can pay

  @Prop({ default: false })
  isPrivate: boolean; // Private links don't show in public lists

  // Notifications
  @Prop({ default: true })
  notifyOnPayment: boolean;

  @Prop({ default: false })
  notifyOnExpiry: boolean;

  // Analytics
  @Prop({ default: 0 })
  viewCount: number;

  // Customer details for the payment (flexible object based on user input)
  @Prop({
    type: Object,
    default: {},
  })
  details?: { [key: string]: string };

  // Dynamic payer details - can contain any fields the user wants
  @Prop({ type: Object })
  payerDetails?: { [key: string]: any };

  @Prop({ type: Date })
  lastViewedAt?: Date;

  @Prop({ type: Object })
  analytics?: {
    totalViews: number;
    uniqueViewers: string[];
    paymentAttempts: number;
    conversionRate: number;
    averagePaymentTime?: number;
  };

  // Metadata
  @Prop({ type: Object })
  metadata?: {
    source?: string; // 'telegram', 'web', 'api'
    campaign?: string;
    reference?: string;
    customFields?: { [key: string]: any };
  };

  @Prop({ type: Date })
  completedAt?: Date;

  @Prop({ type: Date })
  disabledAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PaymentLinkSchema = SchemaFactory.createForClass(PaymentLink);

// Add indexes
PaymentLinkSchema.index({ creatorUserId: 1 });
PaymentLinkSchema.index({ creatorWalletId: 1 });
PaymentLinkSchema.index({ linkId: 1 }, { unique: true });
PaymentLinkSchema.index({ status: 1 });
PaymentLinkSchema.index({ type: 1 });
PaymentLinkSchema.index({ network: 1 });
PaymentLinkSchema.index({ expiresAt: 1 });
PaymentLinkSchema.index({ createdAt: -1 });

// Compound indexes
PaymentLinkSchema.index({ creatorUserId: 1, status: 1 });
PaymentLinkSchema.index({ creatorUserId: 1, createdAt: -1 });
PaymentLinkSchema.index({ status: 1, expiresAt: 1 });

// TTL index for automatic cleanup of expired links
PaymentLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
