import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { UsersModule } from 'src/users/users.module';
import { PaymentLinkModule } from 'src/payment-link/payment-link.module';
import { WalletModule } from 'src/wallet/wallet.module';
import { TransactionModule } from 'src/transaction/transaction.module';
import { CallbackHandler } from './handlers/callback.handler';
import { MessageHandler } from './handlers/mesage-handler';
import { ParaModule } from 'src/para/para.module';
import { McpModule } from 'src/mcp/mcp.module';
import { MastraModule } from 'src/mastra/mastra.module';

@Module({
  imports: [
    UsersModule,
    PaymentLinkModule,
    WalletModule,
    TransactionModule,
    ParaModule,
    McpModule,
    MastraModule,
  ],
  providers: [TelegramService, CallbackHandler, MessageHandler],
  controllers: [TelegramController],
  exports: [TelegramService, CallbackHandler, MessageHandler],
})
export class TelegramModule {}
