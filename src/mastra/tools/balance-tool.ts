import { Tool } from '@mastra/core';
import { z } from 'zod';
import { getDefaultSolanaNetwork } from '../../config/blockchain.config';

export const createBalanceTool = (walletService: any, privyService: any) => {
  return new Tool({
    id: 'create_balance',
    description:
      'Check Solana wallet balance for a user by their Telegram user ID',
    inputSchema: z.object({
      telegramUserId: z.string().describe('Telegram user ID'),
      tokens: z
        .array(z.string())
        .optional()
        .describe("Specific tokens to check (e.g., ['USDC', 'USDT'])"),
    }),
    execute: async (params: any) => {
      const { telegramUserId, tokens } = params;
      try {
        // Get wallet by telegram user ID
        const wallet = await walletService.walletRepository.findOne({
          userId: telegramUserId,
        });
        if (!wallet) {
          return {
            success: false,
            error: 'No wallet found for this user',
            data: null,
          };
        }

        // Use solanaAddress for Privy wallets
        const address = wallet.solanaAddress;

        if (!address) {
          return {
            success: false,
            error: 'No Solana address found for this wallet',
            data: null,
          };
        }

        // Get all Solana balances
        const [solBalance, tokenBalances] = await Promise.all([
          privyService.getSolanaBalance(address),
          privyService.getAllSolanaTokenBalances(address),
        ]);

        const balanceData = {
          walletAddress: address,
          network: getDefaultSolanaNetwork(),
          nativeBalance: {
            SOL: {
              balance: solBalance.balance || '0',
              symbol: 'SOL',
            },
          },
          tokenBalances: tokenBalances.map((token: any) => ({
            symbol: token.symbol,
            balance: parseFloat(token.balance).toFixed(6),
            contractAddress: token.contractAddress,
          })),
        };

        // Filter tokens if specific tokens requested
        if (tokens && tokens.length > 0) {
          balanceData.tokenBalances = balanceData.tokenBalances.filter(
            (token: any) => tokens.includes(token.symbol),
          );
        }

        return {
          success: true,
          error: null,
          data: balanceData,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to get balance: ${error.message}`,
          data: null,
        };
      }
    },
  });
};
