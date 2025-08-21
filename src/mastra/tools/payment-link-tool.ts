import { Tool } from '@mastra/core';
import { z } from 'zod';
import {
  PaymentLinkType,
  PaymentLinkStatus,
} from '../../payment-link/payment-link.model';
import { BlockchainNetwork } from '../../wallet/wallet.model';
import * as QRCode from 'qrcode';
// Preview image generation is handled by the controller endpoint

export const createPaymentLinkTool = (
  paymentLinkRepository: any,
  walletRepository: any,
  userRepository: any,
) => {
  return new Tool({
    id: 'create_payment_links',
    description: 'Create payment links for cryptocurrency payments',
    inputSchema: z.object({
      telegramUserId: z.string().describe('Telegram user ID of the creator'),
      telegramChatId: z.string().describe('Telegram chat ID for notifications'),
      name: z.string().describe('Payment name/title'),
      token: z.enum(['USDC', 'USDT', 'DAI']).describe('Token type for payment'),
      amount: z.string().describe('Payment amount'),
      details: z
        .record(z.string())
        .optional()
        .describe('Additional details to collect from payers'),
      type: z
        .enum(['ONE_TIME', 'RECURRING'])
        .default('ONE_TIME')
        .describe('Payment link type'),
    }),
    execute: async (params: any) => {
      const {
        telegramUserId,
        telegramChatId,
        name,
        token,
        amount,
        details = {},
        type = 'ONE_TIME',
      } = params;
      try {
        // Get user and wallet
        const user = await userRepository.findOne({
          telegramId: telegramUserId,
        });
        const wallet = await walletRepository.findOne({
          userId: telegramUserId,
        });

        if (!user || !wallet) {
          return {
            success: false,
            error: 'User or wallet not found',
            data: null,
          };
        }

        // Generate unique link ID
        const linkId = generateLinkId();
        const baseUrl = process.env.BASE_URL || 'https://your-domain.com';
        const linkUrl = `${baseUrl}/preview/payment/${linkId}`;

        // Token contract addresses
        const tokenAddresses = {
          USDC: '0x09Bc4E0D864854c6aFB6eB9A9cdF58ac190D0dF9',
          USDT: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956Ae',
          DAI: '0xdA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        };

        // Create payment link
        const paymentLink = await paymentLinkRepository.create({
          creatorUserId: user._id,
          creatorWalletId: wallet._id,
          linkId,
          amount,
          token,
          tokenAddress: tokenAddresses[token],
          network: BlockchainNetwork.MANTLE,
          type: PaymentLinkType.ONE_TIME,
          status: PaymentLinkStatus.ACTIVE,
          title: name,
          linkUrl,
          details,
          payerDetails: convertDetailsToPayerDetails(details),
          telegramChatId,
          metadata: {
            source: 'telegram_ai_agent',
          },
        });

        // Generate QR code
        let qrCodeDataUrl: string | null = null;
        try {
          qrCodeDataUrl = await QRCode.toDataURL(linkUrl, {
            width: 300,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF',
            },
            errorCorrectionLevel: 'M',
          });
        } catch (qrError) {
          console.error('Failed to generate QR code:', qrError);
        }

        // Generate preview image URL (the image will be served by the controller)
        const previewImageUrl = `${baseUrl}/preview/payment/${linkId}/image`;

        return {
          success: true,
          error: null,
          data: {
            paymentLinkId: paymentLink._id,
            linkId,
            linkUrl,
            qrCodeDataUrl,
            previewImageUrl,
            name,
            token,
            amount,
            details,
            createdAt: new Date().toISOString(),
            status: 'ACTIVE',
          },
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to create payment link: ${error.message}`,
          data: null,
        };
      }
    },
  });
};

function generateLinkId(): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function convertDetailsToPayerDetails(details?: {
  [key: string]: string;
}): { [key: string]: any } | undefined {
  if (!details || Object.keys(details).length === 0) {
    return undefined;
  }

  const payerDetails: { [key: string]: any } = {};

  // Initialize all fields from details with empty strings
  Object.keys(details).forEach((key) => {
    payerDetails[key] = '';
  });

  return payerDetails;
}
