import { Controller, Get, Param } from '@nestjs/common';
import { PaymentLinkService } from './payment-link.service';
import { PaymentLinkDocument } from './payment-link.model';

@Controller('payment-link')
export class PaymentLinkController {
  constructor(private readonly paymentLinkService: PaymentLinkService) {}

  @Get(':linkId')
  async getPaymentLink(
    @Param('linkId') linkId: string,
  ): Promise<PaymentLinkDocument> {
    return this.paymentLinkService.getPaymentLinkByLinkId(linkId);
  }
}
