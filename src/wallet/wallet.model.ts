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
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  MANTLE = 'mantle',
}

@Schema({
  timestamps: true,
  collection: 'wallets',
})
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, unique: true })
  paraWalletId: string; // Para wallet identifier

  @Prop({ required: true, unique: true })
  address: string; // Wallet address

  @Prop({ type: String, required: true })
  walletShareData: string;

  @Prop({ type: String, enum: WalletStatus, default: WalletStatus.ACTIVE })
  status: WalletStatus;

  @Prop([
    {
      type: String,
      enum: BlockchainNetwork,
    },
  ])
  supportedNetworks: BlockchainNetwork[];

  @Prop({ default: BlockchainNetwork.ETHEREUM })
  defaultNetwork: BlockchainNetwork;

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
WalletSchema.index({ address: 1 }, { unique: true });
WalletSchema.index({ paraWalletId: 1 }, { unique: true });
WalletSchema.index({ status: 1 });
