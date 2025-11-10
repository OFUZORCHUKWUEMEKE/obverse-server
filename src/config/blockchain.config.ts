import { BlockchainNetwork } from '../wallet/wallet.model';

/**
 * Token addresses for different Solana networks
 */
export const SOLANA_TOKEN_ADDRESSES = {
  [BlockchainNetwork.SOLANA_MAINNET]: {
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // Mainnet USDC
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', // Mainnet USDT
  },
  [BlockchainNetwork.SOLANA_DEVNET]: {
    USDC: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // Devnet USDC
    USDT: '9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT7sCCGCV', // Devnet USDT
  },
  [BlockchainNetwork.SOLANA_TESTNET]: {
    USDC: 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr', // Using Devnet USDC for testnet
    USDT: '9NGDi2tZtNmCCp8SVLKNuGjuWAVwNF3Vap5tT7sCCGCV', // Using Devnet USDT for testnet
  },
} as const;

/**
 * Get token address for a specific token on a specific network
 */
export function getTokenAddress(
  network: BlockchainNetwork,
  token: 'USDC' | 'USDT',
): string {
  const networkTokens = SOLANA_TOKEN_ADDRESSES[network];
  if (!networkTokens) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return networkTokens[token];
}

/**
 * Get all token addresses for a specific network
 */
export function getNetworkTokenAddresses(
  network: BlockchainNetwork,
): Record<string, string> {
  const networkTokens = SOLANA_TOKEN_ADDRESSES[network];
  if (!networkTokens) {
    throw new Error(`Unsupported network: ${network}`);
  }
  return networkTokens;
}

/**
 * Get Solana RPC URL based on network
 */
export function getSolanaRpcUrl(network: BlockchainNetwork): string {
  switch (network) {
    case BlockchainNetwork.SOLANA_MAINNET:
      return (
        process.env.HELIUS_RPC_URL_MAINNET ||
        process.env.SOLANA_RPC_URL_MAINNET ||
        'https://api.mainnet-beta.solana.com'
      );
    case BlockchainNetwork.SOLANA_DEVNET:
      return (
        process.env.HELIUS_RPC_URL_DEVNET ||
        process.env.SOLANA_RPC_URL_DEVNET ||
        'https://api.devnet.solana.com'
      );
    case BlockchainNetwork.SOLANA_TESTNET:
      return (
        process.env.HELIUS_RPC_URL_TESTNET ||
        process.env.SOLANA_RPC_URL_TESTNET ||
        'https://api.testnet.solana.com'
      );
    default:
      throw new Error(`Unsupported Solana network: ${network}`);
  }
}

/**
 * Check if a network is a Solana network
 */
export function isSolanaNetwork(network: BlockchainNetwork): boolean {
  return [
    BlockchainNetwork.SOLANA_MAINNET,
    BlockchainNetwork.SOLANA_DEVNET,
    BlockchainNetwork.SOLANA_TESTNET,
  ].includes(network);
}

/**
 * Get default network from environment or fallback to devnet
 */
export function getDefaultSolanaNetwork(): BlockchainNetwork {
  const network = process.env.DEFAULT_SOLANA_NETWORK;
  switch (network) {
    case 'mainnet':
    case 'solana-mainnet':
      return BlockchainNetwork.SOLANA_MAINNET;
    case 'testnet':
    case 'solana-testnet':
      return BlockchainNetwork.SOLANA_TESTNET;
    case 'devnet':
    case 'solana-devnet':
    default:
      return BlockchainNetwork.SOLANA_DEVNET;
  }
}
