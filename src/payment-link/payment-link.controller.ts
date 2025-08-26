import { Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentLinkService } from './payment-link.service';
import { PaymentLinkDocument } from './payment-link.model';

@Controller('payment-link')
export class PaymentLinkController {
  constructor(private readonly paymentLinkService: PaymentLinkService) {}

  @Get()
  async getAllPaymentLinks(): Promise<PaymentLinkDocument[]> {
    return this.paymentLinkService.getAllPaymentLinks();
  }

  @Get('user/:userId')
  async getPaymentLinksByUserId(
    @Param('userId') userId: string,
  ): Promise<PaymentLinkDocument[]> {
    return this.paymentLinkService.getPaymentLinksByUserId(userId);
  }

  @Get(':linkId')
  async getPaymentLink(
    @Param('linkId') linkId: string,
  ): Promise<PaymentLinkDocument> {
    return this.paymentLinkService.getPaymentLinkByLinkId(linkId);
  }

  @Post(':linkId/transactions')
  async getPaymentLinkWithTransaction(@Param('linkId') linkId: string) {
    return await this.paymentLinkService.getPaymentLinkWithTransactions(linkId);
  }
}
