import { Controller, Get, Param, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { PreviewService } from './preview.service';
import { PaymentLinkRepository } from '../payment-link/payment-repository';

@Controller('preview')
export class MastraController {
  constructor(
    private previewService: PreviewService,
    private paymentLinkRepository: PaymentLinkRepository,
  ) {}

  @Get('payment/:linkId/image')
  async getPaymentPreviewImage(
    @Param('linkId') linkId: string,
    @Res() res: Response,
  ) {
    try {
      // Find payment link
      const paymentLink = await this.paymentLinkRepository.findOne({ linkId });
      if (!paymentLink) {
        throw new NotFoundException('Payment link not found');
      }

      // Generate preview image
      const previewData = {
        name: paymentLink.title,
        amount: paymentLink.amount,
        token: paymentLink.token as 'USDC' | 'USDT' | 'DAI',
        walletAddress: paymentLink.creatorWalletId?.toString(),
      };

      const svgImage = await this.previewService.generatePaymentPreview(previewData);
      
      // Convert data URL to buffer if needed, or serve SVG directly
      if (svgImage.startsWith('data:image/svg+xml;base64,')) {
        const svgBuffer = Buffer.from(svgImage.split(',')[1], 'base64');
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svgBuffer);
      } else {
        // If it's a data URL, serve it directly
        res.setHeader('Content-Type', 'image/svg+xml');
        res.send(svgImage);
      }
    } catch (error) {
      console.error('Error serving preview image:', error);
      res.status(404).send('Preview image not found');
    }
  }

  @Get('payment/:linkId')
  async getPaymentPage(
    @Param('linkId') linkId: string,
    @Res() res: Response,
  ) {
    try {
      // Find payment link
      const paymentLink = await this.paymentLinkRepository.findOne({ linkId });
      if (!paymentLink) {
        throw new NotFoundException('Payment link not found');
      }

      // Generate preview data
      const previewData = {
        name: paymentLink.title,
        amount: paymentLink.amount,
        token: paymentLink.token as 'USDC' | 'USDT' | 'DAI',
        walletAddress: paymentLink.creatorWalletId?.toString(),
      };

      // Generate preview image URL
      const previewImageUrl = `${process.env.BASE_URL || 'https://your-domain.com'}/preview/payment/${linkId}/image`;
      
      // Generate payment page HTML
      const html = this.previewService.generatePaymentPageHTML(
        paymentLink.linkUrl,
        previewData,
        previewImageUrl,
      );

      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (error) {
      console.error('Error serving payment page:', error);
      res.status(404).send('Payment link not found');
    }
  }

  @Get('test/:linkId')
  async testPreview(@Param('linkId') linkId: string) {
    // Test endpoint to generate preview without database
    const testData = {
      name: `Test Payment ${linkId}`,
      amount: '100.00',
      token: 'USDC' as const,
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
    };

    const previewImage = await this.previewService.generatePaymentPreview(testData);
    
    return {
      linkId,
      previewImage,
      testData,
    };
  }
}
