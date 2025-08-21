import { Injectable, Logger } from '@nestjs/common';
import { TelegramCryptoAgent } from './agents/payment';
import { WalletService } from '../wallet/wallet.service';
import { ParaService } from '../para/para.service';
import { PaymentLinkRepository } from '../payment-link/payment-repository';
import { WalletRepository } from '../wallet/wallet.repository';
import { UserRepository } from '../users/user-repository';
import { TransactionRepository } from '../transaction/transacton.repository';

@Injectable()
export class MastraService {
  private readonly logger = new Logger(MastraService.name);
  private telegramAgent: TelegramCryptoAgent;

  constructor(
    private walletService: WalletService,
    private paraService: ParaService,
    private paymentLinkRepository: PaymentLinkRepository,
    private walletRepository: WalletRepository,
    private userRepository: UserRepository,
    private transactionRepository: TransactionRepository,
  ) {
    this.initializeAgent();
  }

  private initializeAgent() {
    try {
      this.telegramAgent = new TelegramCryptoAgent(
        { walletRepository: this.walletRepository },
        this.paraService,
        this.paymentLinkRepository,
        this.walletRepository,
        this.userRepository,
        this.transactionRepository,
      );
      this.logger.log('Telegram Crypto Agent initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Telegram Crypto Agent:', error);
    }
  }

  async processNaturalLanguage(
    message: string,
    telegramUserId: string,
    telegramChatId?: string,
    context?: any,
  ): Promise<string> {
    try {
      if (!this.telegramAgent) {
        throw new Error('Telegram agent not initialized');
      }

      this.logger.log(
        `Processing natural language request from user ${telegramUserId}: "${message}"`,
      );

      const response = await this.telegramAgent.processMessage(
        message,
        telegramUserId,
        telegramChatId || telegramUserId,
        context,
      );

      this.logger.log(`Agent response generated for user ${telegramUserId}`);
      return response;
    } catch (error) {
      this.logger.error('Error processing natural language request:', error);
      // Return a fallback response instead of throwing
      return "❌ I'm having trouble processing your request right now. Please try using specific commands like /balance or /payment.";
    }
  }

  async checkUserBalance(
    telegramUserId: string,
    tokens?: string[],
  ): Promise<string> {
    try {
      if (!this.telegramAgent) {
        throw new Error('Telegram agent not initialized');
      }

      this.logger.log(`Checking balance for user ${telegramUserId}`);

      const response = await this.telegramAgent.checkBalance(
        telegramUserId,
        tokens,
      );

      this.logger.log(`Balance check completed for user ${telegramUserId}`);
      return response;
    } catch (error) {
      this.logger.error('Error checking balance:', error);
      throw new Error(`Balance check error: ${error.message}`);
    }
  }

  async createPaymentLink(
    telegramUserId: string,
    telegramChatId: string,
    params: {
      name: string;
      token: 'USDC' | 'USDT' | 'DAI';
      amount: string;
      details?: { [key: string]: string };
    },
  ): Promise<string> {
    try {
      if (!this.telegramAgent) {
        throw new Error('Telegram agent not initialized');
      }

      this.logger.log(`Creating payment link for user ${telegramUserId}`);

      const response = await this.telegramAgent.createPaymentLink(
        telegramUserId,
        telegramChatId,
        params,
      );

      this.logger.log(`Payment link created for user ${telegramUserId}`);
      return response;
    } catch (error) {
      this.logger.error('Error creating payment link:', error);
      throw new Error(`Payment link creation error: ${error.message}`);
    }
  }

  async sendTokens(
    telegramUserId: string,
    toAddress: string,
    amount: string,
    token: 'MNT' | 'USDC' | 'USDT' | 'DAI',
    memo?: string,
  ): Promise<string> {
    try {
      if (!this.telegramAgent) {
        throw new Error('Telegram agent not initialized');
      }

      this.logger.log(
        `Processing transfer for user ${telegramUserId}: ${amount} ${token} to ${toAddress}`,
      );

      const response = await this.telegramAgent.sendTokens(
        telegramUserId,
        toAddress,
        amount,
        token,
        memo,
      );

      this.logger.log(`Transfer processed for user ${telegramUserId}`);
      return response;
    } catch (error) {
      this.logger.error('Error processing transfer:', error);
      throw new Error(`Transfer error: ${error.message}`);
    }
  }

  getAgent(): TelegramCryptoAgent | undefined {
    return this.telegramAgent;
  }
}
