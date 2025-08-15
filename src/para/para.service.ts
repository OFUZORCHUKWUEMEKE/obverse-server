import { Injectable, Logger } from '@nestjs/common';
import { Para as ParaServer, Environment } from '@getpara/server-sdk';
import { ConfigService } from '@nestjs/config';
import { ParaEthersSigner } from '@getpara/ethers-v6-integration';
import { ethers, JsonRpcProvider } from 'ethers';
import {
  createPublicClient,
  http,
  formatEther,
  defineChain,
  erc20Abi,
  getContract,
} from 'viem';

// Initialize Para SDK with your API key and environment
// const para = new ParaServer(Environment.PRODUCTION, API_KEY);

const mantle = defineChain({
  id: 5000,
  name: 'Mantle',
  network: 'mantle',
  nativeCurrency: {
    decimals: 18,
    name: 'Mantle',
    symbol: 'MNT',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mantle.xyz'],
    },
    public: {
      http: ['https://rpc.mantle.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'MantleExplorer', url: 'https://explorer.mantle.xyz' },
  },
});

const mantleClient = createPublicClient({
  chain: mantle,
  transport: http(),
});

// Token contract addresses on Mantle network
const TOKEN_ADDRESSES = {
  USDC: '0x09Bc4E0D864854c6aFB6eB9A9cdF58ac190D0dF9' as `0x${string}`,
  USDT: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956Ae' as `0x${string}`,
  DAI: '0xdA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as `0x${string}`,
} as const;

// Token decimals mapping (fallback for contracts that don't implement decimals properly)
const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
} as const;

type TokenSymbol = keyof typeof TOKEN_ADDRESSES;

interface TokenBalance {
  symbol: string;
  balance: string;
  decimals: number;
  contractAddress: string;
}

interface Transaction {
  hash: string;
  blockNumber: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  txreceipt_status: string;
  input: string;
  contractAddress?: string;
  cumulativeGasUsed: string;
  confirmations: string;
}

interface TokenTransfer {
  blockNumber: string;
  timeStamp: string;
  hash: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimal: string;
  transactionIndex: string;
  gas: string;
  gasPrice: string;
  gasUsed: string;
  cumulativeGasUsed: string;
  input: string;
  confirmations: string;
}

interface WalletTransactions {
  nativeTransactions: Transaction[];
  tokenTransfers: TokenTransfer[];
}

@Injectable()
export class ParaService {
  private readonly logger = new Logger(ParaService.name);
  private readonly para: ParaServer;
  private readonly signer: ParaEthersSigner;
  private readonly ethersProvider: JsonRpcProvider;
  private readonly client = mantleClient;

  constructor(private config: ConfigService) {
    const apiKey = 'beta_db1c28fdfd30d5074d221a26559caf95';
    const environment = this.config.get<string>('PARA_ENVIRONMENT', 'sandbox');

    if (!apiKey) {
      throw new Error('PARA_API_KEY is required');
    }

    this.logger.log(
      `Initializing Para SDK with key: ${apiKey.substring(0, 10)}... for ${environment} environment`,
    );

    this.para = new ParaServer(Environment.BETA, apiKey);

    this.logger.log(`Para SDK initialized successfully`);
    // this.signer = new ParaEthersSigner(this.para);
    // this.ethersProvider = new JsonRpcProvider("https://rpc.mantle.xyz");
  }

  // Expose Para SDK instance
  getInstance(): ParaServer {
    return this.para;
  }

  async createWallet(telegramId: string) {
    try {
      this.logger.log(`Creating wallet for user ${telegramId}`);
      const hasWallet = await this.para.hasPregenWallet({
        pregenId: { telegramUserId: telegramId },
      });

      if (hasWallet) {
        this.logger.log(`User ${telegramId} already has a wallet.`);
        return;
      }
      const wallet = await this.para.createPregenWallet({
        pregenId: { telegramUserId: telegramId },
        type: 'EVM',
      });
      const keyShare = this.para.getUserShare();
      //  const keyShare = "<key_share>";
      this.logger.log(`Wallet created successfully: ${wallet.address}`);
      return { wallet, keyShare };
    } catch (error) {
      this.logger.error(
        `Failed to create wallet for user ${telegramId}:`,
        error,
      );
      throw error;
    }
  }

  async getWallet(telegramId: string) {
    try {
      return await this.para.getPregenWallets({
        pregenId: { telegramUserId: telegramId },
      });
    } catch (error) {
      this.logger.error(`Failed to get wallet ${telegramId}:`, error);
      throw error;
    }
  }

  async getBalance(address: string, tokens?: string[]) {
    try {
      const provider = new ethers.JsonRpcProvider('https://1rpc.io/mantle');
      // const signer = new ParaEthersSigner(this.para, provider);
      const balance = await provider.getBalance(address);
      console.log(`Balance: ${ethers.formatEther(balance)} ETH`);
      return { balance };
    } catch (error) {
      this.logger.error(`Failed to get balance for address ${address}:`, error);
      throw error;
    }
  }

  async getMantleBalance(address: string) {
    try {
      const balance = await this.client.getBalance({
        address: address as `0x${string}`,
      });

      console.log(`Balance: ${balance} wei`);

      // Convert to MNT
      const balanceInMNT = formatEther(balance);
      console.log(`Balance: ${balanceInMNT} MNT`);

      return {
        raw: balance,
        formatted: balanceInMNT,
        symbol: 'MNT',
      };
    } catch (error) {
      this.logger.error('Error fetching Mantle balance:', error);
      throw error;
    }
  }

  async getTokenBalance(
    address: string,
    tokenSymbol: TokenSymbol,
  ): Promise<TokenBalance> {
    try {
      const contractAddress = TOKEN_ADDRESSES[tokenSymbol];
      const fallbackDecimals = TOKEN_DECIMALS[tokenSymbol];

      const contract = getContract({
        address: contractAddress,
        abi: erc20Abi,
        client: this.client,
      });

      // Get balance first
      const balance = await contract.read.balanceOf([address as `0x${string}`]);

      // Try to get decimals, fallback to predefined value if contract doesn't support it
      let decimals: number;
      try {
        decimals = await contract.read.decimals();
      } catch (decimalsError) {
        this.logger.warn(
          `Contract ${contractAddress} doesn't support decimals(), using fallback: ${fallbackDecimals}`,
        );
        decimals = fallbackDecimals;
      }

      // Format balance correctly based on actual decimals
      const divisor = BigInt(10 ** decimals);
      const formattedBalance = (Number(balance) / Number(divisor)).toString();

      return {
        symbol: tokenSymbol,
        balance: formattedBalance,
        decimals,
        contractAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching ${tokenSymbol} balance for ${address}:`,
        error,
      );
      throw error;
    }
  }

  async getAllTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
      const tokenSymbols: TokenSymbol[] = ['USDC', 'USDT', 'DAI'];

      const balancePromises = tokenSymbols.map((symbol) =>
        this.getTokenBalance(address, symbol).catch((error) => {
          this.logger.warn(
            `Failed to fetch ${symbol} balance: ${error.message}`,
          );
          return {
            symbol,
            balance: '0',
            decimals: 18,
            contractAddress: TOKEN_ADDRESSES[symbol],
          };
        }),
      );

      return await Promise.all(balancePromises);
    } catch (error) {
      this.logger.error(`Error fetching token balances for ${address}:`, error);
      throw error;
    }
  }

  async getWalletTransactions(
    address: string,
    limit: number = 10,
  ): Promise<WalletTransactions> {
    try {
      this.logger.log(`Fetching transactions for address ${address}`);

      const [nativeTransactions, tokenTransfers] = await Promise.all([
        this.getNativeTransactions(address, limit),
        this.getTokenTransfers(address, limit),
      ]);

      return {
        nativeTransactions,
        tokenTransfers,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching wallet transactions for ${address}:`,
        error,
      );
      throw error;
    }
  }

  private async getNativeTransactions(
    address: string,
    limit: number,
  ): Promise<Transaction[]> {
    try {
      // Use Mantle Explorer API to get native transactions
      const response = await fetch(
        `https://explorer.mantle.xyz/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== '1') {
        this.logger.warn(
          `API returned status: ${data.status}, message: ${data.message}`,
        );
        return [];
      }

      return data.result || [];
    } catch (error) {
      this.logger.error(`Error fetching native transactions:`, error);
      // Fallback: return empty array instead of throwing
      return [];
    }
  }

  private async getTokenTransfers(
    address: string,
    limit: number,
  ): Promise<TokenTransfer[]> {
    try {
      // Use Mantle Explorer API to get token transfers
      const response = await fetch(
        `https://explorer.mantle.xyz/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc`,
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.status !== '1') {
        this.logger.warn(
          `Token transfers API returned status: ${data.status}, message: ${data.message}`,
        );
        return [];
      }

      return data.result || [];
    } catch (error) {
      this.logger.error(`Error fetching token transfers:`, error);
      // Fallback: return empty array instead of throwing
      return [];
    }
  }

  formatTransactionForDisplay(tx: Transaction): string {
    const timestamp = new Date(parseInt(tx.timeStamp) * 1000);
    const value = ethers.formatEther(tx.value);
    const isIncoming =
      tx.to.toLowerCase() === tx.from.toLowerCase() ? false : true;
    const direction = isIncoming ? '📥' : '📤';

    return (
      `${direction} <b>${parseFloat(value).toFixed(6)} MNT</b>\n` +
      `<b>Hash:</b> <code>${tx.hash.substring(0, 10)}...${tx.hash.substring(tx.hash.length - 8)}</code>\n` +
      `<b>Time:</b> ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}\n` +
      `<b>Status:</b> ${tx.txreceipt_status === '1' ? '✅ Success' : '❌ Failed'}`
    );
  }

  formatTokenTransferForDisplay(transfer: TokenTransfer): string {
    const timestamp = new Date(parseInt(transfer.timeStamp) * 1000);
    const decimals = parseInt(transfer.tokenDecimal);
    const value = (
      parseInt(transfer.value) / Math.pow(10, decimals)
    ).toString();
    const direction = '🪙';

    return (
      `${direction} <b>${parseFloat(value).toFixed(6)} ${transfer.tokenSymbol}</b>\n` +
      `<b>Hash:</b> <code>${transfer.hash.substring(0, 10)}...${transfer.hash.substring(transfer.hash.length - 8)}</code>\n` +
      `<b>Time:</b> ${timestamp.toLocaleDateString()} ${timestamp.toLocaleTimeString()}\n` +
      `<b>Token:</b> ${transfer.tokenName}`
    );
  }
}
