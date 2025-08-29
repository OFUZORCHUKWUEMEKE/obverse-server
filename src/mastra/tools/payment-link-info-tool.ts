import { Tool } from '@mastra/core';
import { z } from 'zod';

export const createPaymentLinkInfoTool = (
  paymentLinkRepository: any,
  userRepository: any,
) => {
  return new Tool({
    id: 'get_payment_link_info',
    description: 'Get payment link information and statistics by link ID',
    inputSchema: z.object({
      telegramUserId: z.string().describe('Telegram user ID of the requester'),
      linkId: z
        .string()
        .describe('Payment link ID to retrieve information for'),
    }),
    execute: async (params: any) => {
      const { telegramUserId, linkId } = params;

      try {
        // Get user
        const user = await userRepository.findOne({
          telegramId: telegramUserId,
        });

        if (!user) {
          return {
            success: false,
            error: 'User not found',
            data: null,
          };
        }

        // Find the payment link
        const paymentLink = await paymentLinkRepository.findOne({
          linkId,
          creatorUserId: user._id,
        });

        if (!paymentLink) {
          return {
            success: false,
            error: `Payment link with ID "${linkId}" not found or you don't have access to it`,
            data: null,
          };
        }

        // Calculate statistics
        const totalTransactions = paymentLink.payments?.length || 0;
        const totalAmountReceived = paymentLink.totalAmountReceived || '0';
        const currentUses = paymentLink.currentUses || 0;
        const maxUses = paymentLink.maxUses || 1;
        const viewCount = paymentLink.viewCount || 0;

        // Get recent transactions
        const recentTransactions = paymentLink.payments
          ? paymentLink.payments.slice(-5).map((payment) => ({
              amount: payment.amount,
              payerAddress: payment.payerAddress,
              paidAt: payment.paidAt,
              transactionHash: payment.transactionHash,
            }))
          : [];

        return {
          success: true,
          error: null,
          data: {
            linkId: paymentLink.linkId,
            title: paymentLink.title,
            amount: paymentLink.amount,
            token: paymentLink.token,
            tokenAddress: paymentLink.tokenAddress,
            network: paymentLink.network,
            status: paymentLink.status,
            type: paymentLink.type,
            linkUrl: paymentLink.linkUrl,
            details: paymentLink.details,
            createdAt: paymentLink.createdAt,
            updatedAt: paymentLink.updatedAt,
            statistics: {
              totalTransactions,
              totalAmountReceived,
              currentUses,
              maxUses,
              viewCount,
              conversionRate:
                viewCount > 0
                  ? ((totalTransactions / viewCount) * 100).toFixed(2)
                  : '0',
              averageTransactionAmount:
                totalTransactions > 0
                  ? (
                      parseFloat(totalAmountReceived) / totalTransactions
                    ).toFixed(2)
                  : '0',
            },
            recentTransactions,
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to retrieve payment link info: ${error.message}`,
          data: null,
        };
      }
    },
  });
};
