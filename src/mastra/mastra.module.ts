import { Module } from '@nestjs/common';
import { MastraService } from './mastra.service';
import { MastraController } from './mastra.controller';
import { PreviewService } from './preview.service';
import { WalletModule } from '../wallet/wallet.module';
import { ParaModule } from '../para/para.module';
import { PaymentLinkModule } from '../payment-link/payment-link.module';
import { UsersModule } from '../users/users.module';
import { TransactionModule } from '../transaction/transaction.module';

@Module({
  imports: [
    WalletModule,
    ParaModule,
    PaymentLinkModule,
    UsersModule,
    TransactionModule,
  ],
  controllers: [MastraController],
  providers: [MastraService, PreviewService],
  exports: [MastraService, PreviewService],
})
export class MastraModule {}
