import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { WalletModule } from 'src/wallet/wallet.module';
import { ParaModule } from 'src/para/para.module';
import { PaymentLinkModule } from 'src/payment-link/payment-link.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [WalletModule, ParaModule, PaymentLinkModule, UsersModule],
  providers: [McpService],
  controllers: [McpController],
  exports: [McpService],
})
export class McpModule {}
