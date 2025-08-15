import { Module } from '@nestjs/common';
import { PaymentLinkService } from './payment-link.service';
import { PaymentLinkController } from './payment-link.controller';
import { Mongoose } from 'mongoose';
import { PaymentLinkSchema } from './payment-link.model';
import { MongooseModule } from '@nestjs/mongoose';
import { PaymentLinkRepository } from './payment-repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: 'PaymentLink', schema: PaymentLinkSchema },
    ]),
  ],
  providers: [PaymentLinkService, PaymentLinkRepository],
  controllers: [PaymentLinkController],
  exports: [PaymentLinkService, PaymentLinkRepository],
})
export class PaymentLinkModule {}
