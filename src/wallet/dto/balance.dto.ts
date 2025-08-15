import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsArray,
  IsEthereumAddress,
} from 'class-validator';

export class GetBalanceDto {
  @ApiProperty({
    description: 'Wallet address to check balance for',
    example: '0x742d35Cc60C7b1b44C3a18b1B9B3B8b5b1234567',
  })
  @IsEthereumAddress()
  address: string;

  @ApiPropertyOptional({
    description: 'Specific tokens to check balance for',
    example: ['USDC', 'USDT', 'ETH'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tokens?: string[];
}

export class TokenBalance {
  @ApiProperty({ description: 'Token symbol', example: 'USDC' })
  symbol: string;

  @ApiProperty({ description: 'Token balance', example: '1000.50' })
  balance: string;

  @ApiProperty({ description: 'USD value of the balance', example: '1000.50' })
  usdValue?: string;

  @ApiProperty({
    description: 'Token contract address',
    example: '0xa0b86a33e6176d50b32b34b3b0b7b7b8b1234567',
  })
  contractAddress?: string;

  @ApiProperty({ description: 'Token decimals', example: 6 })
  decimals?: number;
}

export class WalletBalanceResponseDto {
  @ApiProperty({
    description: 'Wallet address',
    example: '0x742d35Cc60C7b1b44C3a18b1B9B3B8b5b1234567',
  })
  address: string;

  @ApiProperty({
    description: 'Total USD value of all tokens',
    example: '2500.75',
  })
  totalUsdValue: string;

  @ApiProperty({ description: 'Token balances', type: [TokenBalance] })
  tokens: TokenBalance[];

  @ApiProperty({ description: 'Last updated timestamp' })
  lastUpdated: Date;
}
