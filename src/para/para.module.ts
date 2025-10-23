import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ParaService } from './para.service';
import { PrivyService } from './privy.service';
import { ParaController } from './para.controller';

@Module({
  imports: [ConfigModule],
  providers: [ParaService, PrivyService],
  controllers: [ParaController],
  exports: [ParaService, PrivyService],
})
export class ParaModule {}
