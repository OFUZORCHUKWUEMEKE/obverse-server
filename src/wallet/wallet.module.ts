import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { WalletController } from './wallet.controller';
import { WalletSchema } from './wallet.model';
import { WalletRepository } from './wallet.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { ParaModule } from '../para/para.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'Wallet', schema: WalletSchema }]),
    ParaModule,
  ],
  providers: [WalletService, WalletRepository],
  controllers: [WalletController],
  exports: [WalletRepository, WalletService],
})
export class WalletModule {}
