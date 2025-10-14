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
import {
  Account,
  RpcProvider,
  Contract,
  cairo,
  uint256,
  constants,
  CallData,
  stark,
  ec,
  hash
} from 'starknet';

// Initialize Para SDK with your API key and environment
// const para = new ParaServer(Environment.PRODUCTION, API_KEY);

const sepolia = defineChain({
  id: 11155111,
  name: 'Sepolia',
  network: 'sepolia',
  nativeCurrency: {
    decimals: 18,
    name: 'Sepolia Ether',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['https://ethereum-sepolia-rpc.publicnode.com'],
    },
    public: {
      http: ['https://ethereum-sepolia-rpc.publicnode.com'],
    },
  },
  blockExplorers: {
    default: { name: 'Etherscan', url: 'https://sepolia.etherscan.io' },
  },
});

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

const sepoliaClient = createPublicClient({
  chain: sepolia,
  transport: http(),
});

// Starknet token addresses (Sepolia testnet)
const STARKNET_TOKEN_ADDRESSES = {
  ETH: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  STRK: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  USDC: '0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080',
  USDT: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
} as const;

// Token decimals mapping
const TOKEN_DECIMALS = {
  ETH: 18,
  STRK: 18,
  USDC: 6,
  USDT: 6,
} as const;

type TokenSymbol = keyof typeof STARKNET_TOKEN_ADDRESSES;

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
  private readonly client = sepoliaClient;
  private readonly starknetProvider: RpcProvider;
  private readonly starknetAccounts: Map<string, Account> = new Map();

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

    // Initialize Starknet provider (Sepolia testnet)
    const starknetRpcUrl = this.config.get<string>(
      'STARKNET_RPC_URL',
      'https://starknet-sepolia.public.blastapi.io',
    );
    this.starknetProvider = new RpcProvider({ nodeUrl: starknetRpcUrl });

    this.logger.log(`Para SDK and Starknet provider initialized successfully`);
  }

  // Expose Para SDK instance
  getInstance(): ParaServer {
    return this.para;
  }

  async createWallet(telegramId: string) {
    try {
      this.logger.log(`Creating Starknet wallet for user ${telegramId}`);

      // Check if wallet already exists in cache
      const existingWallet = this.starknetAccounts.get(telegramId);
      if (existingWallet) {
        this.logger.log(`User ${telegramId} already has a Starknet wallet.`);
        return;
      }

      // Generate public and private key pair
      const privateKey = stark.randomAddress();
      this.logger.log(`New OZ account created for ${telegramId}:\nprivateKey=${privateKey.substring(0, 10)}...`);

      const starkKeyPub = ec.starkCurve.getStarkKey(privateKey);
      this.logger.log(`publicKey=${starkKeyPub.substring(0, 10)}...`);

      // OpenZeppelin account class hash (v0.8.0)
      const OZaccountClassHash = '0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f';

      // Calculate future address of the account
      const OZaccountConstructorCallData = CallData.compile({ publicKey: starkKeyPub });
      const OZcontractAddress = hash.calculateContractAddressFromHash(
        starkKeyPub,
        OZaccountClassHash,
        OZaccountConstructorCallData,
        0
      );
      this.logger.log(`Precalculated account address=${OZcontractAddress}`);

      // Create account instance
      const account = new Account(
        this.starknetProvider,
        OZcontractAddress,
        privateKey,
        '1' // cairoVersion
      );

      // Cache the account
      this.starknetAccounts.set(telegramId, account);

      this.logger.log(`Starknet wallet created successfully: ${OZcontractAddress}`);

      return {
        wallet: {
          address: OZcontractAddress,
          id: telegramId,
          publicKey: starkKeyPub,
        },
        keyShare: privateKey, // This should be encrypted before storing in database
        account
      };
    } catch (error) {
      this.logger.error(
        `Failed to create Starknet wallet for user ${telegramId}:`,
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

  async getBalance(address: string) {
    try {
      this.logger.log(`Fetching ETH balance for address: ${address}`);
      const provider = new ethers.JsonRpcProvider(
        'https://ethereum-sepolia-rpc.publicnode.com',
      );
      const balance = await provider.getBalance(address);
      const formattedBalance = ethers.formatEther(balance);
      this.logger.log(
        `ETH Balance fetched successfully: ${formattedBalance} ETH`,
      );
      return { balance: formattedBalance };
    } catch (error) {
      this.logger.error(
        `Failed to get ETH balance for address ${address}:`,
        error,
      );
      throw error;
    }
  }

  async getMantleBalance(address: string) {
    try {
      this.logger.log(
        `Fetching Sepolia ETH balance via viem for address: ${address}`,
      );
      const balance = await this.client.getBalance({
        address: address as `0x${string}`,
      });

      this.logger.log(`Raw balance: ${balance} wei`);

      // Convert to ETH
      const balanceInETH = formatEther(balance);
      this.logger.log(`Formatted balance: ${balanceInETH} ETH`);

      return {
        raw: balance,
        formatted: balanceInETH,
        symbol: 'ETH',
        balance: balanceInETH,
      };
    } catch (error) {
      this.logger.error('Error fetching Sepolia balance via viem:', error);
      throw error;
    }
  }

  async getTokenBalance(
    address: string,
    tokenSymbol: string,
  ): Promise<TokenBalance> {
    try {
      // Legacy EVM token addresses for backward compatibility
      const SEPOLIA_TOKEN_ADDRESSES = {
        USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`,
        USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06' as `0x${string}`,
        DAI: '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6' as `0x${string}`,
      };

      const contractAddress = SEPOLIA_TOKEN_ADDRESSES[tokenSymbol as keyof typeof SEPOLIA_TOKEN_ADDRESSES];
      const fallbackDecimals = tokenSymbol === 'DAI' ? 18 : 6;

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

  // async getTokenBalance(
  //   address: string,
  //   tokenSymbol: TokenSymbol,
  // ): Promise<TokenBalance> {
  //   try {
  //     const contractAddress = TOKEN_ADDRESSES[tokenSymbol];
  //     const fallbackDecimals = TOKEN_DECIMALS[tokenSymbol];

  //     const contract = getContract({
  //       address: contractAddress,
  //       abi: erc20Abi,
  //       client: this.client,
  //     });

  //     // Get balance first
  //     const balance = await contract.read.balanceOf([address as `0x${string}`]);

  //     // Try to get decimals, fallback to predefined value if contract doesn't support it
  //     let decimals: number;
  //     try {
  //       decimals = await contract.read.decimals();
  //     } catch (decimalsError) {
  //       this.logger.warn(
  //         `Contract ${contractAddress} doesn't support decimals(), using fallback: ${fallbackDecimals}`,
  //       );
  //       decimals = fallbackDecimals;
  //     }

  //     // Format balance correctly based on actual decimals
  //     const divisor = BigInt(10 ** decimals);
  //     const formattedBalance = (Number(balance) / Number(divisor)).toString();

  //     return {
  //       symbol: tokenSymbol,
  //       balance: formattedBalance,
  //       decimals,
  //       contractAddress,
  //     };
  //   } catch (error) {
  //     this.logger.error(
  //       `Error fetching ${tokenSymbol} balance for ${address}:`,
  //       error,
  //     );
  //     throw error;
  //   }
  // }

  async getAllTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
      this.logger.log(`Fetching all token balances for address: ${address}`);
      const tokenSymbols = ['USDC', 'USDT', 'DAI'];

      const SEPOLIA_TOKEN_ADDRESSES = {
        USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as `0x${string}`,
        USDT: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06' as `0x${string}`,
        DAI: '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6' as `0x${string}`,
      };

      const balancePromises = tokenSymbols.map((symbol) =>
        this.getTokenBalance(address, symbol).catch((error) => {
          this.logger.warn(
            `Failed to fetch ${symbol} balance: ${error.message}`,
          );
          return {
            symbol,
            balance: '0',
            decimals: symbol === 'DAI' ? 18 : 6,
            contractAddress: SEPOLIA_TOKEN_ADDRESSES[symbol as keyof typeof SEPOLIA_TOKEN_ADDRESSES],
          };
        }),
      );

      const results = await Promise.all(balancePromises);
      this.logger.log(`Successfully fetched ${results.length} token balances`);
      return results;
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
      // Use Sepolia Etherscan API to get native transactions
      const response = await fetch(
        `https://api-sepolia.etherscan.io/api?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=YourApiKeyToken`,
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
      // Use Sepolia Etherscan API to get token transfers
      const response = await fetch(
        `https://api-sepolia.etherscan.io/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=99999999&page=1&offset=${limit}&sort=desc&apikey=YourApiKeyToken`,
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
      `${direction} <b>${parseFloat(value).toFixed(6)} ETH</b>\n` +
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

  // ===== Starknet Methods =====

  getStarknetProvider(): RpcProvider {
    return this.starknetProvider;
  }

  async createStarknetWallet(telegramId: string, privateKey: string) {
    try {
      this.logger.log(`Creating Starknet wallet for user ${telegramId}`);

      // Create Starknet account from private key
      const account = new Account(this.starknetProvider, '0x0', privateKey);
      const address = account.address;

      // Cache the account
      this.starknetAccounts.set(telegramId, account);

      this.logger.log(`Starknet wallet created successfully: ${address}`);
      return { address, account };
    } catch (error) {
      this.logger.error(
        `Failed to create Starknet wallet for user ${telegramId}:`,
        error,
      );
      throw error;
    }
  }

  async getStarknetAccount(telegramId: string, walletRepository?: any): Promise<Account> {
    try {
      // Check cache first
      if (this.starknetAccounts.has(telegramId)) {
        return this.starknetAccounts.get(telegramId)!;
      }

      // If not in cache, retrieve the private key from the database
      if (!walletRepository) {
        throw new Error('WalletRepository is required to retrieve account from database');
      }

      const wallet = await walletRepository.findOne({ userId: telegramId });
      if (!wallet || !wallet.walletShareData) {
        throw new Error(`No wallet found for user ${telegramId}`);
      }

      // Reconstruct the account from stored private key
      const privateKey = wallet.walletShareData; // This should be decrypted if encrypted
      const account = new Account(
        this.starknetProvider,
        wallet.address,
        privateKey,
        '1' // cairoVersion
      );

      // Cache the account for future use
      this.starknetAccounts.set(telegramId, account);

      this.logger.log(`Starknet account reconstructed from database for ${telegramId}`);
      return account;
    } catch (error) {
      this.logger.error(`Failed to get Starknet account for ${telegramId}:`, error);
      throw error;
    }
  }

  async getStarknetTokenBalance(
    address: string,
    tokenSymbol: TokenSymbol,
  ): Promise<TokenBalance> {
    try {
      const contractAddress = STARKNET_TOKEN_ADDRESSES[tokenSymbol];
      const decimals = TOKEN_DECIMALS[tokenSymbol];

      // ERC20 ABI for balanceOf
      const erc20Abi = [
        {
          name: 'balanceOf',
          type: 'function',
          inputs: [{ name: 'account', type: 'felt' }],
          outputs: [{ name: 'balance', type: 'Uint256' }],
          stateMutability: 'view',
        },
      ];

      const contract = new Contract(erc20Abi, contractAddress, this.starknetProvider);

      // Call balanceOf
      const result = await contract.balanceOf(address);

      // Convert uint256 to BigInt
      const balanceBigInt = uint256.uint256ToBN(result.balance);

      // Format balance
      const divisor = BigInt(10 ** decimals);
      const formattedBalance = (Number(balanceBigInt) / Number(divisor)).toString();

      return {
        symbol: tokenSymbol,
        balance: formattedBalance,
        decimals,
        contractAddress,
      };
    } catch (error) {
      this.logger.error(
        `Error fetching ${tokenSymbol} balance for ${address} on Starknet:`,
        error,
      );
      throw error;
    }
  }

  async getAllStarknetTokenBalances(address: string): Promise<TokenBalance[]> {
    try {
      this.logger.log(`Fetching all Starknet token balances for address: ${address}`);
      const tokenSymbols: TokenSymbol[] = ['ETH', 'STRK', 'USDC', 'USDT'];

      const balancePromises = tokenSymbols.map((symbol) =>
        this.getStarknetTokenBalance(address, symbol).catch((error) => {
          this.logger.warn(
            `Failed to fetch ${symbol} balance: ${error.message}`,
          );
          return {
            symbol,
            balance: '0',
            decimals: TOKEN_DECIMALS[symbol] || 18,
            contractAddress: STARKNET_TOKEN_ADDRESSES[symbol],
          };
        }),
      );

      const results = await Promise.all(balancePromises);
      this.logger.log(`Successfully fetched ${results.length} Starknet token balances`);
      return results;
    } catch (error) {
      this.logger.error(`Error fetching Starknet token balances for ${address}:`, error);
      throw error;
    }
  }
}
