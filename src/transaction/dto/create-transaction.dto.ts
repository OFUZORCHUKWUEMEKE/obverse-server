import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsObject,
} from 'class-validator';
import { Types } from 'mongoose';
import { TransactionType } from '../transaction.model';
import { BlockchainNetwork } from 'src/wallet/wallet.model';

export class CreateTransactionDto {
  @IsString()
  walletId: string;

  @IsString()
  userId: string;

  @IsEnum(TransactionType)
  type: TransactionType;

  @IsString()
  amount: string;

  @IsString()
  token: string;

  @IsString()
  tokenAddress: string;

  @IsEnum(BlockchainNetwork)
  network: BlockchainNetwork;

  @IsString()
  fromAddress: string;

  @IsString()
  toAddress: string;

  @IsOptional()
  @IsString()
  hash?: string;

  @IsOptional()
  @IsString()
  gasFee?: string;

  @IsOptional()
  @IsString()
  gasPrice?: string;

  @IsOptional()
  @IsString()
  gasUsed?: string;

  @IsOptional()
  @IsString()
  paymentLinkId?: string;

  @IsOptional()
  @IsString()
  telegramMessageId?: string;

  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsOptional()
  @IsString()
  memo?: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;

  @IsOptional()
  @IsObject()
  metadata?: {
    userAgent?: string;
    ipAddress?: string;
    deviceInfo?: string;
    initiatedBy?: 'user' | 'agent' | 'system';
    [key: string]: any;
  };

  @IsOptional()
  @IsObject()
  payerDetails?: { [key: string]: any };
}
