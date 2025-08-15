import { Controller, Get, Query, Param, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { WalletBalanceResponseDto } from './dto/balance.dto';

@ApiTags('Wallet')
@Controller('wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private readonly walletService: WalletService) {}

  @Get('balance/:address')
  @ApiOperation({ summary: 'Get wallet balance by address' })
  @ApiParam({
    name: 'address',
    description: 'Wallet address',
    example: '0x742d35Cc60C7b1b44C3a18b1B9B3B8b5b1234567',
  })
  @ApiQuery({
    name: 'tokens',
    required: false,
    description: 'Comma-separated list of tokens to check',
    example: 'USDC,USDT,ETH',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet balance retrieved successfully',
    type: WalletBalanceResponseDto,
  })
  async getWalletBalance(
    @Param('address') address: string,
    @Query('tokens') tokens?: string,
  ) {
    this.logger.log(`Getting balance for wallet: ${address}`);

    const tokenArray = tokens
      ? tokens.split(',').map((t) => t.trim())
      : undefined;
    return this.walletService.getWalletBalance(address, tokenArray);
  }

  @Get('user/:userId/balance')
  @ApiOperation({ summary: 'Get wallet balance by user ID' })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    example: '507f1f77bcf86cd799439011',
  })
  @ApiQuery({
    name: 'tokens',
    required: false,
    description: 'Comma-separated list of tokens to check',
    example: 'USDC,USDT,ETH',
  })
  @ApiResponse({
    status: 200,
    description: 'User wallet balance retrieved successfully',
    type: WalletBalanceResponseDto,
  })
  async getUserWalletBalance(
    @Param('userId') userId: string,
    @Query('tokens') tokens?: string,
  ) {
    this.logger.log(`Getting balance for user: ${userId}`);

    const tokenArray = tokens
      ? tokens.split(',').map((t) => t.trim())
      : undefined;
    return this.walletService.getUserWalletBalance(userId, tokenArray);
  }

  @Get('balance/:address/refresh')
  @ApiOperation({ summary: 'Refresh wallet balance (force update)' })
  @ApiParam({
    name: 'address',
    description: 'Wallet address',
    example: '0x742d35Cc60C7b1b44C3a18b1B9B3B8b5b1234567',
  })
  @ApiQuery({
    name: 'tokens',
    required: false,
    description: 'Comma-separated list of tokens to check',
    example: 'USDC,USDT,ETH',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet balance refreshed successfully',
    type: WalletBalanceResponseDto,
  })
  async refreshWalletBalance(
    @Param('address') address: string,
    @Query('tokens') tokens?: string,
  ) {
    this.logger.log(`Refreshing balance for wallet: ${address}`);

    const tokenArray = tokens
      ? tokens.split(',').map((t) => t.trim())
      : undefined;
    return this.walletService.refreshWalletBalance(address, tokenArray);
  }
}
