import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentLinkRepository } from './payment-repository';
import { PaymentLinkDocument } from './payment-link.model';

@Injectable()
export class PaymentLinkService {
  constructor(private readonly paymentLinkRepository: PaymentLinkRepository) {}

  async getPaymentLinkByLinkId(linkId: string): Promise<PaymentLinkDocument> {
    const paymentLink = await this.paymentLinkRepository.findOne({ linkId });

    if (!paymentLink) {
      throw new NotFoundException(`Payment link with ID ${linkId} not found`);
    }

    return paymentLink;
  }
}
