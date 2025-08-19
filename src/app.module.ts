import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WalletModule } from './wallet/wallet.module';
import { TransactionModule } from './transaction/transaction.module';
import { UsersModule } from './users/users.module';
import { PaymentLinkModule } from './payment-link/payment-link.module';
import { Mongoose } from 'mongoose';
import { MongooseModule } from '@nestjs/mongoose/dist/mongoose.module';
import configuration from './config/configuration';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegramModule } from './telegram/telegram.module';
import { ParaModule } from './para/para.module';
import { McpModule } from './mcp/mcp.module';
import { MastraController } from './mastra/mastra.controller';
import { MastraService } from './mastra/mastra.service';
import { MastraModule } from './mastra/mastra.module';
import leanVirtuals from 'mongoose-lean-virtuals';

const config = configuration();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env'],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const uri = config.get<string>('db_url');
        return {
          uri,
          retryAttempts: 3,
          useNewUrlParser: true,
          useUnifiedTopology: true,
          connectionFactory: (connection) => {
            connection.plugin(leanVirtuals);
            return connection;
          },
        };
      },
    }),
    WalletModule,
    TransactionModule,
    UsersModule,
    PaymentLinkModule,
    TelegramModule,
    ParaModule,
    McpModule,
    MastraModule,
  ],
  controllers: [AppController, MastraController],
  providers: [AppService, MastraService],
})
export class AppModule { }
