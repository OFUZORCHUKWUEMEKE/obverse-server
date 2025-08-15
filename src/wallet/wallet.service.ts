import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Wallet, WalletDocument } from './wallet.model';
import { ParaService } from '../para/para.service';
import { WalletBalanceResponseDto } from './dto/balance.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    private paraService: ParaService,
  ) {}

  async getWalletBalance(address: string, tokens?: string[]) {
    try {
      this.logger.log(`Getting balance for wallet address: ${address}`);
    } catch (error) {
      this.logger.error(`Failed to get wallet balance for ${address}:`, error);
      throw error;
    }
  }

  async getWalletByAddress(address: string): Promise<WalletDocument | null> {
    try {
      return await this.walletModel.findOne({ address }).exec();
    } catch (error) {
      this.logger.error(
        `Failed to find wallet with address ${address}:`,
        error,
      );
      throw error;
    }
  }

  async getUserWalletBalance(userId: string, tokens?: string[]) {
    try {
      this.logger.log(`Getting balance for user: ${userId}`);

      const wallet = await this.walletModel.findOne({ userId }).exec();
      if (!wallet) {
        throw new NotFoundException(`Wallet not found for user ${userId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to get user wallet balance for ${userId}:`,
        error,
      );
      throw error;
    }
  }

  private async updateWalletBalance(
    address: string,
    balanceData: any,
  ): Promise<void> {
    try {
      const wallet = await this.walletModel.findOne({ address }).exec();
      if (!wallet) {
        this.logger.warn(
          `Wallet not found for address ${address}, skipping balance update`,
        );
        return;
      }

      // Convert balance data to the format stored in the wallet model
      const balances = {
        ethereum: {} as any,
      };

      balanceData.tokens.forEach((token: any) => {
        balances.ethereum[token.symbol] = {
          balance: token.balance,
          usdValue: token.usdValue,
          lastUpdated: new Date(),
        };
      });

      await this.walletModel
        .updateOne(
          { address },
          {
            balances,
            lastBalanceUpdate: new Date(),
          },
        )
        .exec();

      this.logger.log(`Updated balance for wallet ${address}`);
    } catch (error) {
      this.logger.error(
        `Failed to update wallet balance for ${address}:`,
        error,
      );
    }
  }

  async refreshWalletBalance(address: string, tokens?: string[]) {
    this.logger.log(`Refreshing balance for wallet: ${address}`);
  }
}
