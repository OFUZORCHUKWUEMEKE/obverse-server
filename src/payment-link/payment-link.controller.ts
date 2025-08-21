import { Controller, Get, Param, Post } from '@nestjs/common';
import { PaymentLinkService } from './payment-link.service';
import { PaymentLinkDocument } from './payment-link.model';

@Controller('payment-link')
export class PaymentLinkController {
  constructor(private readonly paymentLinkService: PaymentLinkService) { }

  @Get(':linkId')
  async getPaymentLink(
    @Param('linkId') linkId: string,
  ): Promise<PaymentLinkDocument> {
    return this.paymentLinkService.getPaymentLinkByLinkId(linkId);
  }

  @Post(':linkId/transactions')
  async getPaymentLinkWithTransaction(
    @Param('linkId') linkId: string,
  ) {
    return await this.paymentLinkService.getPaymentLinkWithTransactions(linkId);
  }
}
