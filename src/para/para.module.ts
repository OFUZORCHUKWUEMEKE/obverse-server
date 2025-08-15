import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ParaService } from './para.service';
import { ParaController } from './para.controller';

@Module({
  imports: [ConfigModule],
  providers: [ParaService],
  controllers: [ParaController],
  exports: [ParaService],
})
export class ParaModule {}
