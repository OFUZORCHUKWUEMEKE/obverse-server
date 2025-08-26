import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentLinkRepository } from './payment-repository';
import { PaymentLinkDocument } from './payment-link.model';
import { TransactionRepository } from 'src/transaction/transacton.repository';

@Injectable()
export class PaymentLinkService {
  constructor(
    private readonly paymentLinkRepository: PaymentLinkRepository,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async getAllPaymentLinks(): Promise<PaymentLinkDocument[]> {
    return this.paymentLinkRepository.find({});
  }

  async getPaymentLinkByLinkId(linkId: string): Promise<PaymentLinkDocument> {
    const paymentLink = await this.paymentLinkRepository.findOne({ linkId });

    if (!paymentLink) {
      throw new NotFoundException(`Payment link with ID ${linkId} not found`);
    }

    return paymentLink;
  }

  async getPaymentLinksByUserId(
    userId: string,
  ): Promise<PaymentLinkDocument[]> {
    return this.paymentLinkRepository.find({ creatorUserId: userId });
  }

  async getPaymentLinkWithTransactions(linkId: string) {
    const paymentLink = await this.paymentLinkRepository
      .model()
      .findOne({ linkId })
      .exec();

    if (!paymentLink) {
      throw new NotFoundException('Payment link not found');
    }

    const transactions = await this.transactionRepository
      .model()
      .find({ paymentLinkId: paymentLink._id })
      .sort({ createdAt: -1 })
      .exec();

    return {
      paymentLink,
      transactions,
    };
  }
}
