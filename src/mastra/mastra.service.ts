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
    const startTime = Date.now();

    try {
      if (!this.telegramAgent) {
        this.logger.error(
          'Telegram agent not initialized - attempting to reinitialize',
        );
        this.initializeAgent();

        if (!this.telegramAgent) {
          throw new Error('Failed to initialize Telegram agent');
        }
      }

      this.logger.log(
        `Processing enhanced natural language request from user ${telegramUserId}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`,
      );

      // Add request context
      const enhancedContext = {
        ...context,
        requestId: `${telegramUserId}_${Date.now()}`,
        userAgent: 'telegram-bot',
        timestamp: new Date().toISOString(),
      };

      const response = await this.telegramAgent.processMessage(
        message,
        telegramUserId,
        telegramChatId || telegramUserId,
        enhancedContext,
      );

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Enhanced agent response generated for user ${telegramUserId} in ${processingTime}ms`,
      );

      return response;
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Error processing natural language request for user ${telegramUserId} after ${processingTime}ms:`,
        error,
      );

      // Provide more helpful error responses based on error type
      if (error.message?.includes('wallet')) {
        return "❌ I couldn't access your wallet information. Please make sure you've set up your wallet with /start command.";
      } else if (
        error.message?.includes('network') ||
        error.message?.includes('connection')
      ) {
        return "🌐 I'm having network connectivity issues. Please try again in a moment, or use specific commands like /balance or /payment.";
      } else if (error.message?.includes('timeout')) {
        return '⏱️ The request took too long to process. Please try again with a specific command like /balance or /payment.';
      } else {
        return "❌ I'm experiencing some technical difficulties. Please try using specific commands:\n\n💰 /balance - Check your wallet\n🔗 /payment - Create payment link\n💸 /send - Send tokens\n📊 /transactions - View history\n\n🔧 If issues persist, please contact support.";
      }
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

  // Payment Link Statistics with Full Data
  async getPaymentLinkFullStats(
    linkId: string,
    telegramUserId: string,
  ): Promise<{ response: string; linkData: any | null; success: boolean }> {
    try {
      if (!this.telegramAgent) {
        throw new Error('Telegram agent not initialized');
      }

      return await this.telegramAgent.getPaymentLinkFullStats(linkId, telegramUserId);
    } catch (error) {
      this.logger.error('Error getting payment link full stats:', error);
      return {
        response: '❌ Failed to retrieve payment link statistics.',
        linkData: null,
        success: false
      };
    }
  }

  async getAllPaymentLinksFullStats(
    telegramUserId: string,
  ): Promise<{ response: string; linksData: any[] | null; success: boolean }> {
    try {
      if (!this.telegramAgent) {
        throw new Error('Telegram agent not initialized');
      }

      return await this.telegramAgent.getAllPaymentLinksFullStats(telegramUserId);
    } catch (error) {
      this.logger.error('Error getting all payment links full stats:', error);
      return {
        response: '❌ Failed to retrieve payment link statistics.',
        linksData: null,
        success: false
      };
    }
  }

  // Raw Data Access
  async getPaymentLinksRawData(
    telegramUserId: string,
  ): Promise<any[] | null> {
    try {
      if (!this.telegramAgent) {
        throw new Error('Telegram agent not initialized');
      }

      return await this.telegramAgent.getPaymentLinksRawData(telegramUserId);
    } catch (error) {
      this.logger.error('Error getting payment links raw data:', error);
      return null;
    }
  }

  async getPaymentLinkRawData(
    linkId: string,
    telegramUserId: string,
  ): Promise<any | null> {
    try {
      if (!this.telegramAgent) {
        throw new Error('Telegram agent not initialized');
      }

      return await this.telegramAgent.getPaymentLinkRawData(linkId, telegramUserId);
    } catch (error) {
      this.logger.error('Error getting payment link raw data:', error);
      return null;
    }
  }
}
