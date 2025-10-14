import { Tool } from '@mastra/core';
import { z } from 'zod';

export const createBalanceTool = (walletService: any, paraService: any) => {
  return new Tool({
    id: 'create_balance',
    description:
      'Check Starknet wallet balance for a user by their Telegram user ID or wallet address',
    inputSchema: z.object({
      telegramUserId: z.string().optional().describe('Telegram user ID'),
      walletAddress: z.string().optional().describe('Starknet wallet address'),
      tokens: z
        .array(z.string())
        .optional()
        .describe("Specific tokens to check (e.g., ['ETH', 'STRK', 'USDC', 'USDT'])"),
    }),
    execute: async (params: any) => {
      const { telegramUserId, walletAddress, tokens } = params;
      try {
        let address = walletAddress;

        // If telegram user ID provided, get wallet address
        if (telegramUserId && !walletAddress) {
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
          address = wallet.address;
        }

        if (!address) {
          return {
            success: false,
            error: 'Either telegramUserId or walletAddress must be provided',
            data: null,
          };
        }

        // Get all Starknet token balances
        const tokenBalances = await paraService.getAllStarknetTokenBalances(address);

        const balanceData = {
          walletAddress: address,
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
