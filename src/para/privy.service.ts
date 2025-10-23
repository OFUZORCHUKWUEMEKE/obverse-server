import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrivyClient } from '@privy-io/node';
import {
  Connection,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { ethers } from 'ethers';
import {
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from '@solana/spl-token';

export enum BlockchainNetwork {
  SOLANA = 'solana',
  ARBITRUM = 'arbitrum',
}

export interface TransactionResult {
  signature: string;
  status: 'success' | 'failed';
  amount: string;
  fee: string;
  timestamp: Date;
  tokenAddress?: string;
}

export interface TokenBalance {
  symbol: string;
  balance: string;
  decimals: number;
  contractAddress: string;
  name?: string;
}

export interface PrivyWalletInfo {
  privyId: string;
  solanaAddress: string;
  arbitrumAddress: string;
  solanaWalletId: string;
  arbitrumWalletId: string;
}

@Injectable()
export class PrivyService {
  private readonly logger = new Logger(PrivyService.name);
  private readonly privyClient: PrivyClient;
  private readonly solanaConnection: Connection;
  private readonly arbitrumProvider: ethers.JsonRpcProvider;

  // Token addresses for Solana Devnet
  private readonly SOLANA_TOKENS = {
    USDC: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // Devnet USDC
    USDT: '9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT7sCCGCV', // Devnet USDT
  };

  // Token addresses for Arbitrum Sepolia
  private readonly ARBITRUM_TOKENS = {
    USDC: '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d',
    USDT: '0xfd064A18f3BF249cf1f87FC203E90D8f650f2d63',
  };

  constructor(private configService: ConfigService) {
    this.privyClient = new PrivyClient({
      appId: this.configService.get<string>('PRIVY_APP_ID') || '',
      appSecret: this.configService.get<string>('PRIVY_APP_SECRET') || '',
    });

    // Initialize Solana connection
    const solanaRpcUrl =
      this.configService.get<string>('HELIUS_RPC_URL_DEVNET') ||
      this.configService.get<string>('SOLANA_RPC_URL') ||
      'https://api.devnet.solana.com';
    this.solanaConnection = new Connection(solanaRpcUrl, 'confirmed');

    // Initialize Arbitrum provider
    const arbitrumRpcUrl =
      this.configService.get<string>('ARBITRUM_RPC_URL') ||
      'https://sepolia-rollup.arbitrum.io/rpc';
    this.arbitrumProvider = new ethers.JsonRpcProvider(arbitrumRpcUrl);

    this.logger.log('Privy Service initialized successfully');
  }

  /**
   * Get Privy client instance
   */
  getClient(): PrivyClient {
    return this.privyClient;
  }

  // ============================================
  // WALLET CREATION & MANAGEMENT
  // ============================================

  /**
   * Create wallets for a user using Privy
   * Creates both Solana and Arbitrum wallets linked to Telegram user ID
   */
  async createWallet(telegramId: string): Promise<PrivyWalletInfo> {
    try {
      this.logger.log(`Creating Privy wallet for Telegram user ${telegramId}`);

      // Check if user already exists
      let privyUser;
      try {
        privyUser = await this.privyClient.users().getByTelegramUserID({
          telegram_user_id: telegramId,
        });

        if (privyUser) {
          this.logger.log(`User ${telegramId} already has a Privy account`);
          return this.extractWalletInfo(privyUser);
        }
      } catch (error) {
        this.logger.log(
          `No existing Privy user found for ${telegramId}, creating new one`,
        );
      }

      // Create new Privy user with both Solana and Arbitrum wallets
      privyUser = await this.privyClient.users().create({
        linked_accounts: [
          {
            type: 'telegram',
            telegram_user_id: telegramId,
          },
        ],
        wallets: [{ chain_type: 'solana' }, { chain_type: 'ethereum' }],
      });

      this.logger.log(`Privy user created successfully: ${privyUser.id}`);
      return this.extractWalletInfo(privyUser);
    } catch (error) {
      this.logger.error(`Failed to create wallet for ${telegramId}:`, error);
      throw new BadRequestException(
        `Failed to create wallet: ${error.message}`,
      );
    }
  }

  /**
   * Get existing wallet info for a user (legacy method compatibility)
   */
  async getWallet(telegramId: string): Promise<PrivyWalletInfo> {
    try {
      const privyUser = await this.privyClient.users().getByTelegramUserID({
        telegram_user_id: telegramId,
      });

      if (!privyUser) {
        throw new NotFoundException(`No wallet found for user ${telegramId}`);
      }

      return this.extractWalletInfo(privyUser);
    } catch (error) {
      this.logger.error(`Failed to get wallet for ${telegramId}:`, error);
      throw error;
    }
  }

  /**
   * Extract wallet information from Privy user object
   */
  private extractWalletInfo(privyUser: any): PrivyWalletInfo {
    const walletAccounts = (privyUser.linked_accounts as any[]).filter(
      (account) => account.type === 'wallet',
    );

    const solanaWallet = walletAccounts.find(
      (account) => account.chain_type === 'solana',
    );
    const ethWallet = walletAccounts.find(
      (account) => account.chain_type === 'ethereum',
    );

    if (!solanaWallet || !ethWallet) {
      throw new Error('Missing wallet accounts in Privy user');
    }

    return {
      privyId: privyUser.id,
      solanaAddress: solanaWallet.address,
      arbitrumAddress: ethWallet.address,
      solanaWalletId: solanaWallet.id,
      arbitrumWalletId: ethWallet.id,
    };
  }

  // ============================================
  // BALANCE QUERIES
  // ============================================

  /**
   * Get Solana native balance (SOL)
   */
  async getSolanaBalance(address: string): Promise<{ balance: string }> {
    try {
      this.logger.log(`Fetching SOL balance for address: ${address}`);
      const publicKey = new PublicKey(address);
      const balance = await this.solanaConnection.getBalance(publicKey);
      const formattedBalance = (balance / LAMPORTS_PER_SOL).toFixed(6);
      this.logger.log(`SOL Balance: ${formattedBalance}`);
      return { balance: formattedBalance };
    } catch (error) {
      this.logger.error(`Failed to get SOL balance for ${address}:`, error);
      throw new BadRequestException(
        `Failed to fetch SOL balance: ${error.message}`,
      );
    }
  }

  /**
   * Get Arbitrum native balance (ETH)
   */
  async getArbitrumBalance(
    address: string,
  ): Promise<{ balance: string; formatted: string; symbol: string }> {
    try {
      this.logger.log(`Fetching ETH balance for address: ${address}`);
      const balance = await this.arbitrumProvider.getBalance(address);
      const formattedBalance = ethers.formatEther(balance);
      this.logger.log(`ETH Balance: ${formattedBalance}`);
      return {
        balance: formattedBalance,
        formatted: formattedBalance,
        symbol: 'ETH',
      };
    } catch (error) {
      this.logger.error(`Failed to get ETH balance for ${address}:`, error);
      throw new BadRequestException(
        `Failed to fetch ETH balance: ${error.message}`,
      );
    }
  }

  /**
   * Get Solana SPL token balance
   */
  async getSolanaTokenBalance(
    address: string,
    tokenMint: string,
  ): Promise<TokenBalance> {
    try {
      const walletPublicKey = new PublicKey(address);
      const mintPublicKey = new PublicKey(tokenMint);

      const tokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        walletPublicKey,
      );

      const balance =
        await this.solanaConnection.getTokenAccountBalance(tokenAccount);

      const symbol =
        Object.keys(this.SOLANA_TOKENS).find(
          (key) =>
            this.SOLANA_TOKENS[key as keyof typeof this.SOLANA_TOKENS] ===
            tokenMint,
        ) || 'UNKNOWN';

      return {
        symbol,
        balance: balance.value.uiAmountString || '0',
        decimals: balance.value.decimals,
        contractAddress: tokenMint,
      };
    } catch (error) {
      this.logger.debug(
        `Token account not found for ${tokenMint}: ${error.message}`,
      );
      return {
        symbol: 'UNKNOWN',
        balance: '0',
        decimals: 9,
        contractAddress: tokenMint,
      };
    }
  }

  /**
   * Get Arbitrum ERC-20 token balance
   */
  async getArbitrumTokenBalance(
    address: string,
    tokenAddress: string,
    decimals: number = 6,
  ): Promise<TokenBalance> {
    try {
      const code = await this.arbitrumProvider.getCode(tokenAddress);
      if (code === '0x') {
        this.logger.debug(`Token contract not deployed at ${tokenAddress}`);
        return {
          symbol: 'UNKNOWN',
          balance: '0',
          decimals,
          contractAddress: tokenAddress,
        };
      }

      const tokenContract = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)'],
        this.arbitrumProvider,
      );

      const balance = await tokenContract.balanceOf(address);
      const formattedBalance = ethers.formatUnits(balance, decimals);

      const symbol =
        Object.keys(this.ARBITRUM_TOKENS).find(
          (key) =>
            this.ARBITRUM_TOKENS[key as keyof typeof this.ARBITRUM_TOKENS] ===
            tokenAddress,
        ) || 'UNKNOWN';

      return {
        symbol,
        balance: formattedBalance,
        decimals,
        contractAddress: tokenAddress,
      };
    } catch (error) {
      this.logger.debug(
        `Error fetching token balance for ${tokenAddress}: ${error.message}`,
      );
      return {
        symbol: 'UNKNOWN',
        balance: '0',
        decimals,
        contractAddress: tokenAddress,
      };
    }
  }

  /**
   * Get all token balances for Solana
   */
  async getAllSolanaTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
      this.logger.log(`Fetching all Solana token balances for: ${address}`);
      const tokenBalances = await Promise.all(
        Object.entries(this.SOLANA_TOKENS).map(async ([symbol, mint]) => {
          const balance = await this.getSolanaTokenBalance(address, mint);
          return { ...balance, symbol };
        }),
      );
      return tokenBalances;
    } catch (error) {
      this.logger.error(`Error fetching Solana token balances:`, error);
      return [];
    }
  }

  /**
   * Get all token balances for Arbitrum
   */
  async getAllArbitrumTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
      this.logger.log(`Fetching all Arbitrum token balances for: ${address}`);
      const tokenBalances = await Promise.all(
        Object.entries(this.ARBITRUM_TOKENS).map(
          async ([symbol, tokenAddress]) => {
            const balance = await this.getArbitrumTokenBalance(
              address,
              tokenAddress,
              6,
            );
            return { ...balance, symbol };
          },
        ),
      );
      return tokenBalances;
    } catch (error) {
      this.logger.error(`Error fetching Arbitrum token balances:`, error);
      return [];
    }
  }

  /**
   * Fetch Privy user by platform user ID (compatibility method)
   */
  async getUserByTelegramId(platformUserId: string): Promise<any> {
    try {
      const privyUser = await this.privyClient.users().getByTelegramUserID({
        telegram_user_id: platformUserId,
      });

      if (!privyUser) {
        throw new NotFoundException(
          `Privy user with Telegram ID ${platformUserId} not found`,
        );
      }

      this.logger.log(
        `Successfully fetched Privy user for Telegram ID: ${platformUserId}`,
      );
      return privyUser;
    } catch (error) {
      this.logger.error(
        `Error fetching Privy user: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to fetch Privy user: ${error.message}`,
      );
    }
  }

  /**
   * Fetch Privy user by Privy user ID
   */
  // async getUserById(privyUserId: string): Promise<any> {
  //     try {
  //         const privyUser = await this.privyClient.users().getById(privyUserId);

  //         if (!privyUser) {
  //             throw new NotFoundException(`Privy user with ID ${privyUserId} not found`);
  //         }

  //         this.logger.log(`Successfully fetched Privy user: ${privyUserId}`);
  //         return privyUser;
  //     } catch (error) {
  //         this.logger.error(`Error fetching Privy user: ${error.message}`, error.stack);
  //         throw new BadRequestException(`Failed to fetch Privy user: ${error.message}`);
  //     }
  // }

  /**
   * Delete Privy user by Privy user ID
   */
  async deleteUser(privyUserId: string): Promise<void> {
    try {
      await this.privyClient.users().delete(privyUserId);
      this.logger.log(`Successfully deleted Privy user: ${privyUserId}`);
    } catch (error) {
      this.logger.error(
        `Error deleting Privy user: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to delete Privy user: ${error.message}`,
      );
    }
  }

  // ============================================
  // TRANSACTION SENDING
  // ============================================

  /**
   * Send Solana native transaction (SOL)
   */
  async sendSolanaTransaction(
    telegramId: string,
    toAddress: string,
    amount: string,
  ): Promise<TransactionResult> {
    try {
      this.logger.log(`Sending ${amount} SOL to ${toAddress}`);

      const walletInfo = await this.getWallet(telegramId);
      const walletPublicKey = new PublicKey(walletInfo.solanaAddress);
      const recipientPublicKey = new PublicKey(toAddress);
      const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

      const instruction = SystemProgram.transfer({
        fromPubkey: walletPublicKey,
        toPubkey: recipientPublicKey,
        lamports,
      });

      const { blockhash: recentBlockhash } =
        await this.solanaConnection.getLatestBlockhash();

      const message = new TransactionMessage({
        payerKey: walletPublicKey,
        instructions: [instruction],
        recentBlockhash,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(message);

      const { hash } = await this.privyClient
        .wallets()
        .solana()
        .signAndSendTransaction(walletInfo.solanaWalletId, {
          caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
          transaction: Buffer.from(transaction.serialize()).toString('base64'),
        });

      this.logger.log(`Transaction sent successfully: ${hash}`);

      await this.solanaConnection.confirmTransaction(hash);

      const txDetails = await this.solanaConnection.getTransaction(hash, {
        maxSupportedTransactionVersion: 0,
      });

      return {
        signature: hash,
        status: 'success',
        amount,
        fee: txDetails?.meta?.fee
          ? (txDetails.meta.fee / LAMPORTS_PER_SOL).toString()
          : '0',
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Solana transaction failed:`, error);
      throw new BadRequestException(`Failed to send SOL: ${error.message}`);
    }
  }

  /**
   * Send Solana SPL token transaction
   */
  async sendSolanaTokenTransaction(
    telegramId: string,
    tokenMint: string,
    toAddress: string,
    amount: string,
    decimals: number,
  ): Promise<TransactionResult> {
    try {
      this.logger.log(
        `Sending ${amount} tokens (${tokenMint}) to ${toAddress}`,
      );

      const walletInfo = await this.getWallet(telegramId);
      const walletPublicKey = new PublicKey(walletInfo.solanaAddress);
      const recipientPublicKey = new PublicKey(toAddress);
      const mintPublicKey = new PublicKey(tokenMint);

      const fromTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        walletPublicKey,
      );

      const toTokenAccount = await getAssociatedTokenAddress(
        mintPublicKey,
        recipientPublicKey,
      );

      const instructions: any[] = [];

      const toAccountInfo =
        await this.solanaConnection.getAccountInfo(toTokenAccount);
      if (!toAccountInfo) {
        instructions.push(
          createAssociatedTokenAccountInstruction(
            walletPublicKey,
            toTokenAccount,
            recipientPublicKey,
            mintPublicKey,
          ),
        );
      }

      const transferAmount = BigInt(
        Math.floor(parseFloat(amount) * Math.pow(10, decimals)),
      );
      instructions.push(
        createTransferInstruction(
          fromTokenAccount,
          toTokenAccount,
          walletPublicKey,
          transferAmount,
        ),
      );

      const { blockhash: recentBlockhash } =
        await this.solanaConnection.getLatestBlockhash();

      const message = new TransactionMessage({
        payerKey: walletPublicKey,
        instructions,
        recentBlockhash,
      }).compileToV0Message();

      const transaction = new VersionedTransaction(message);

      const { hash } = await this.privyClient
        .wallets()
        .solana()
        .signAndSendTransaction(walletInfo.solanaWalletId, {
          caip2: 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
          transaction: Buffer.from(transaction.serialize()).toString('base64'),
        });

      this.logger.log(`Token transaction sent successfully: ${hash}`);

      await this.solanaConnection.confirmTransaction(hash);

      const txDetails = await this.solanaConnection.getTransaction(hash, {
        maxSupportedTransactionVersion: 0,
      });

      return {
        signature: hash,
        status: 'success',
        amount,
        fee: txDetails?.meta?.fee
          ? (txDetails.meta.fee / LAMPORTS_PER_SOL).toString()
          : '0',
        timestamp: new Date(),
        tokenAddress: tokenMint,
      };
    } catch (error) {
      this.logger.error(`Solana token transaction failed:`, error);
      throw new BadRequestException(`Failed to send token: ${error.message}`);
    }
  }

  /**
   * Send Arbitrum native transaction (ETH)
   */
  async sendArbitrumTransaction(
    telegramId: string,
    toAddress: string,
    amount: string,
  ): Promise<TransactionResult> {
    try {
      this.logger.log(`Sending ${amount} ETH to ${toAddress}`);

      const walletInfo = await this.getWallet(telegramId);

      const { hash } = await this.privyClient
        .wallets()
        .ethereum()
        .sendTransaction(walletInfo.arbitrumWalletId, {
          caip2: 'eip155:421614',
          params: {
            transaction: {
              to: toAddress,
              value: '0x' + ethers.parseEther(amount).toString(16),
              from: walletInfo.arbitrumAddress,
            },
          },
        });

      this.logger.log(`Transaction sent successfully: ${hash}`);

      const receipt = await this.arbitrumProvider.waitForTransaction(hash);

      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      return {
        signature: receipt.hash,
        status: receipt.status === 1 ? 'success' : 'failed',
        amount,
        fee: ethers.formatEther(
          (receipt.gasUsed ?? BigInt(0)) * (receipt.gasPrice ?? BigInt(0)),
        ),
        timestamp: new Date(),
      };
    } catch (error) {
      this.logger.error(`Arbitrum transaction failed:`, error);
      throw new BadRequestException(`Failed to send ETH: ${error.message}`);
    }
  }

  /**
   * Send Arbitrum ERC-20 token transaction
   */
  async sendArbitrumTokenTransaction(
    telegramId: string,
    tokenAddress: string,
    toAddress: string,
    amount: string,
    decimals: number,
  ): Promise<TransactionResult> {
    try {
      this.logger.log(
        `Sending ${amount} tokens (${tokenAddress}) to ${toAddress}`,
      );

      const walletInfo = await this.getWallet(telegramId);

      const transferInterface = new ethers.Interface([
        'function transfer(address to, uint256 amount) returns (bool)',
      ]);

      const transferData = transferInterface.encodeFunctionData('transfer', [
        toAddress,
        ethers.parseUnits(amount, decimals),
      ]);

      const { hash } = await this.privyClient
        .wallets()
        .ethereum()
        .sendTransaction(walletInfo.arbitrumWalletId, {
          caip2: 'eip155:421614',
          params: {
            transaction: {
              to: tokenAddress,
              data: transferData,
              from: walletInfo.arbitrumAddress,
            },
          },
        });

      this.logger.log(`Token transaction sent successfully: ${hash}`);

      const receipt = await this.arbitrumProvider.waitForTransaction(hash);

      if (!receipt) {
        throw new Error('Transaction receipt not found');
      }

      return {
        signature: receipt.hash,
        status: receipt.status === 1 ? 'success' : 'failed',
        amount,
        fee: ethers.formatEther(
          (receipt.gasUsed ?? BigInt(0)) * (receipt.gasPrice ?? BigInt(0)),
        ),
        timestamp: new Date(),
        tokenAddress,
      };
    } catch (error) {
      this.logger.error(`Arbitrum token transaction failed:`, error);
      throw new BadRequestException(`Failed to send token: ${error.message}`);
    }
  }

  // ============================================
  // TRANSACTION HISTORY
  // ============================================

  /**
   * Get Solana transaction history
   */
  async getSolanaTransactions(
    address: string,
    limit: number = 10,
  ): Promise<any[]> {
    try {
      const publicKey = new PublicKey(address);
      const signatures = await this.solanaConnection.getSignaturesForAddress(
        publicKey,
        { limit },
      );

      const transactions = await Promise.all(
        signatures.map(async (sig) => {
          const tx = await this.solanaConnection.getParsedTransaction(
            sig.signature,
            { maxSupportedTransactionVersion: 0 },
          );
          return {
            signature: sig.signature,
            timestamp: sig.blockTime,
            status: sig.err ? 'failed' : 'success',
            fee: tx?.meta?.fee ? tx.meta.fee / LAMPORTS_PER_SOL : 0,
          };
        }),
      );

      return transactions;
    } catch (error) {
      this.logger.error(`Error fetching Solana transactions:`, error);
      return [];
    }
  }

  // ============================================
  // LOW-LEVEL TRANSACTION METHODS (Compatibility)
  // ============================================

  /**
   * Sign and send Solana transaction using Privy (raw)
   */
  async signAndSendSolanaTransaction(
    walletId: string,
    transaction: string,
    caip2: string = 'solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1',
  ): Promise<{ hash: string }> {
    try {
      const result = await this.privyClient
        .wallets()
        .solana()
        .signAndSendTransaction(walletId, { caip2, transaction });

      this.logger.log(
        `Successfully signed and sent Solana transaction: ${result.hash}`,
      );
      return result;
    } catch (error) {
      this.logger.error(
        `Error signing Solana transaction: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to sign Solana transaction: ${error.message}`,
      );
    }
  }

  /**
   * Send Ethereum transaction using Privy (raw)
   */
  async sendEthereumTransaction(
    walletId: string,
    transaction: any,
    caip2: string = 'eip155:421614',
  ): Promise<{ hash: string }> {
    try {
      const result = await this.privyClient
        .wallets()
        .ethereum()
        .sendTransaction(walletId, { caip2, params: { transaction } });

      this.logger.log(`Successfully sent Ethereum transaction: ${result.hash}`);
      return result;
    } catch (error) {
      this.logger.error(
        `Error sending Ethereum transaction: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        `Failed to send Ethereum transaction: ${error.message}`,
      );
    }
  }
}
