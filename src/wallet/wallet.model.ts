import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

export enum WalletStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CLOSED = 'closed',
}

export enum BlockchainNetwork {
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
  BSC = 'bsc',
  OPTIMISM = 'optimism',
  MANTLE = 'mantle',
  SOLANA = 'solana',
}

@Schema({
  timestamps: true,
  collection: 'wallets',
})
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  // Legacy Para fields (optional for backward compatibility)
  @Prop({ unique: true, sparse: true })
  paraWalletId?: string; // Para wallet identifier

  @Prop({ unique: true, sparse: true })
  address?: string; // Legacy wallet address (for EVM)

  @Prop({ type: String })
  walletShareData?: string; // Para keyshare

  // Privy fields
  @Prop({ unique: true, sparse: true })
  privyId?: string; // Privy user ID

  @Prop({ unique: true, sparse: true })
  solanaAddress?: string; // Solana public key

  @Prop()
  solanaWalletId?: string; // Privy Solana wallet ID

  @Prop({ type: String, enum: WalletStatus, default: WalletStatus.ACTIVE })
  status: WalletStatus;

  @Prop([
    {
      type: String,
      enum: BlockchainNetwork,
    },
  ])
  supportedNetworks?: BlockchainNetwork[];

  @Prop({ type: String, enum: BlockchainNetwork })
  defaultNetwork?: BlockchainNetwork;

  @Prop({ type: Object })
  balances?: {
    [network: string]: {
      [token: string]: {
        balance: string;
        usdValue?: string;
        lastUpdated: Date;
      };
    };
  };

  @Prop({ type: Date })
  lastBalanceUpdate?: Date;

  @Prop({ default: false })
  isBackedUp: boolean;

  @Prop({ type: Date })
  lastUsedAt?: Date;

  // Recovery and security
  @Prop()
  recoveryPhrase?: string; // Encrypted mnemonic

  @Prop([String])
  authorizedDevices?: string[]; // Device fingerprints

  createdAt?: Date;
  updatedAt?: Date;
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);

// Add indexes
WalletSchema.index({ userId: 1 });
WalletSchema.index({ address: 1 }, { unique: true, sparse: true });
WalletSchema.index({ paraWalletId: 1 }, { unique: true, sparse: true });
WalletSchema.index({ privyId: 1 }, { unique: true, sparse: true });
WalletSchema.index({ solanaAddress: 1 }, { unique: true, sparse: true });
WalletSchema.index({ status: 1 });
