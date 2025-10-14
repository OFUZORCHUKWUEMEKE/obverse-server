import { Tool } from '@mastra/core';
import { z } from 'zod';
import { Account, CallData, cairo, uint256, RpcProvider, validateAndParseAddress } from 'starknet';

// Token contract addresses on Starknet Sepolia testnet
const TOKEN_ADDRESSES = {
  ETH: '0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7',
  STRK: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
  USDC: '0x053b40a647cedfca6ca84f542a0fe36736031905a9639a7f19a3c1e66bfd5080',
  USDT: '0x068f5c6a61780768455de69077e07e89787839bf8166decfbf92b645209c0fb8',
} as const;

const TOKEN_DECIMALS = {
  ETH: 18,
  STRK: 18,
  USDC: 6,
  USDT: 6,
} as const;

type TokenSymbol = keyof typeof TOKEN_ADDRESSES;

interface TransferResult {
  success: boolean;
  error: string | null;
  data: {
    transactionHash?: string;
    fromAddress?: string;
    toAddress?: string;
    amount?: string;
    token?: string;
    gasUsed?: string;
    confirmationUrl?: string;
  } | null;
}

interface ValidationResult {
  isValid: boolean;
  error?: string;
  wallet?: any;
  user?: any;
  parsedAmount?: number;
  normalizedToAddress?: string;
}

export const createTransferTool = (
  walletRepository: any,
  userRepository: any,
  transactionRepository: any,
  paraService: any,
) => {
  return new Tool({
    id: 'transfer_tokens',
    description:
      'Transfer ETH, STRK or stablecoins (USDC, USDT) on Starknet to another address',
    inputSchema: z.object({
      telegramUserId: z.string().describe('Telegram user ID of the sender'),
      toAddress: z
        .string()
        .describe(
          'Destination wallet address (must be valid Starknet address)',
        ),
      amount: z.string().describe("Amount to transfer (e.g., '10.5', '100')"),
      token: z
        .enum(['ETH', 'STRK', 'USDC', 'USDT'])
        .describe('Token type to transfer'),
      memo: z
        .string()
        .optional()
        .describe('Optional memo/note for the transaction'),
    }),
    execute: async (params: any): Promise<TransferResult> => {
      const { telegramUserId, toAddress, amount, token, memo = '' } = params;

      try {
        // Input validation
        const validationResult = await validateTransferInputs(
          telegramUserId,
          toAddress,
          amount,
          token as TokenSymbol,
          walletRepository,
          userRepository,
          paraService,
        );

        if (!validationResult.isValid) {
          return {
            success: false,
            error: validationResult.error || 'Validation failed',
            data: null,
          };
        }

        const { wallet, user, parsedAmount, normalizedToAddress } =
          validationResult;

        if (
          !wallet ||
          !user ||
          parsedAmount === undefined ||
          !normalizedToAddress
        ) {
          return {
            success: false,
            error: 'Invalid validation result data',
            data: null,
          };
        }

        // Execute the transfer
        const transferResult = await executeTransfer(
          wallet,
          normalizedToAddress,
          parsedAmount,
          token as TokenSymbol,
          paraService,
          walletRepository,
        );

        if (!transferResult.success) {
          return {
            success: false,
            error: transferResult.error,
            data: null,
          };
        }

        // Record transaction in database
        try {
          await recordTransaction(
            transactionRepository,
            user,
            wallet,
            normalizedToAddress,
            amount,
            token,
            transferResult.transactionHash,
            memo,
          );
        } catch (dbError) {
          // Don't fail the entire operation if DB recording fails
          console.error('Failed to record transaction in database:', dbError);
        }

        const explorerUrl = `https://sepolia.starkscan.co/tx/${transferResult.transactionHash}`;

        return {
          success: true,
          error: null,
          data: {
            transactionHash: transferResult.transactionHash,
            fromAddress: wallet.address,
            toAddress: normalizedToAddress,
            amount,
            token,
            // gasUsed: transferResult.gasUsed,
            confirmationUrl: explorerUrl,
          },
        };
      } catch (error) {
        console.error('Transfer tool error:', error);
        return {
          success: false,
          error: `Transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          data: null,
        };
      }
    },
  });
};

async function validateTransferInputs(
  telegramUserId: string,
  toAddress: string,
  amount: string,
  token: TokenSymbol,
  walletRepository: any,
  userRepository: any,
  paraService: any,
): Promise<ValidationResult> {
  // Check if user exists
  const user = await userRepository.findOne({ telegramId: telegramUserId });
  if (!user) {
    return {
      isValid: false,
      error: 'User not found. Please use /start to register first.',
    };
  }

  // Check if user has a wallet
  const wallet = await walletRepository.findOne({ userId: telegramUserId });
  if (!wallet?.address) {
    return {
      isValid: false,
      error: 'No wallet found. Please use /start to create a wallet first.',
    };
  }

  // Validate destination address (Starknet address validation)
  try {
    validateAndParseAddress(toAddress);
  } catch (e) {
    return {
      isValid: false,
      error:
        'Invalid destination address. Please provide a valid Starknet address.',
    };
  }

  const normalizedToAddress = toAddress.toLowerCase();

  // Check if sender is not sending to themselves
  if (wallet.address.toLowerCase() === normalizedToAddress) {
    return {
      isValid: false,
      error: 'Cannot send tokens to your own wallet address.',
    };
  }

  // Validate amount
  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return {
      isValid: false,
      error: 'Invalid amount. Please provide a positive number.',
    };
  }

  // Check minimum transfer amounts
  const minimumAmounts = {
    ETH: 0.0001,
    STRK: 0.1,
    USDC: 0.01,
    USDT: 0.01,
  };

  if (parsedAmount < minimumAmounts[token]) {
    return {
      isValid: false,
      error: `Minimum transfer amount for ${token} is ${minimumAmounts[token]} ${token}.`,
    };
  }

  // Check user balance
  try {
    let balance: number = 0;

    // Get token balance from Starknet
    const tokenBalance = await paraService.getStarknetTokenBalance(
      wallet.address,
      token,
    );
    balance = parseFloat(tokenBalance.balance);

    if (balance < parsedAmount) {
      return {
        isValid: false,
        error: `Insufficient balance. You have ${balance.toFixed(6)} ${token}, but trying to send ${parsedAmount} ${token}.`,
      };
    }

    // Reserve some amount for gas fees (for ETH or STRK)
    if (token === 'ETH' || token === 'STRK') {
      const gasReserve = token === 'ETH' ? 0.001 : 0.5; // Reserve for gas
      if (balance - parsedAmount < gasReserve) {
        return {
          isValid: false,
          error: `Insufficient balance for gas fees. Please keep at least ${gasReserve} ${token} for transaction fees.`,
        };
      }
    } else {
      // For token transfers, check if user has enough STRK for gas
      const strkBalance = await paraService.getStarknetTokenBalance(
        wallet.address,
        'STRK',
      );
      const balance = parseFloat(strkBalance.balance);
      const gasReserve = 0.5; // Reserve STRK for gas

      if (balance < gasReserve) {
        return {
          isValid: false,
          error: `Insufficient STRK balance for gas fees. You need at least ${gasReserve} STRK to send ${token} tokens.`,
        };
      }
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Failed to check wallet balance. Please try again later.',
    };
  }

  return {
    isValid: true,
    wallet,
    user,
    parsedAmount,
    normalizedToAddress,
  };
}

async function executeTransfer(
  wallet: any,
  toAddress: string,
  amount: number,
  token: TokenSymbol,
  paraService: any,
  walletRepository: any,
) {
  try {
    // Use Starknet RPC to execute transfer
    return await transferStarknetToken(paraService, wallet, toAddress, amount, token, walletRepository);
  } catch (error) {
    console.error('Execute transfer error:', error);
    throw new Error(
      `Failed to execute ${token} transfer: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

async function transferStarknetToken(
  paraService: any,
  wallet: any,
  toAddress: string,
  amount: number,
  token: TokenSymbol,
  walletRepository: any,
) {
  try {
    const tokenAddress = TOKEN_ADDRESSES[token];
    const decimals = TOKEN_DECIMALS[token];

    // Convert amount to uint256 with proper decimals
    const amountInSmallestUnit = BigInt(Math.floor(amount * Math.pow(10, decimals)));
    const amountUint256 = uint256.bnToUint256(amountInSmallestUnit);

    // Get Starknet account from paraService (with wallet repository for retrieval)
    const account = await paraService.getStarknetAccount(wallet.userId, walletRepository);

    // Build transfer call
    const transferCall = {
      contractAddress: tokenAddress,
      entrypoint: 'transfer',
      calldata: CallData.compile({
        recipient: toAddress,
        amount: amountUint256,
      }),
    };

    // Execute the transaction
    const result = await account.execute(transferCall);

    // Wait for transaction to be accepted
    await paraService.getStarknetProvider().waitForTransaction(result.transaction_hash);

    return {
      success: true,
      transactionHash: result.transaction_hash,
      gasUsed: null, // Starknet gas calculation is different
      error: null,
    };
  } catch (error) {
    console.error('Starknet transfer error:', error);
    return {
      success: false,
      error: `${token} transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      transactionHash: null,
      gasUsed: null,
    };
  }
}

async function recordTransaction(
  transactionRepository: any,
  user: any,
  wallet: any,
  toAddress: string,
  amount: string,
  token: string,
  transactionHash: string,
  memo: string,
) {
  const transactionData = {
    userId: user._id,
    walletId: wallet._id,
    type: 'SEND',
    status: 'COMPLETED',
    amount: parseFloat(amount),
    token,
    tokenAddress: TOKEN_ADDRESSES[token as keyof typeof TOKEN_ADDRESSES],
    fromAddress: wallet.address,
    toAddress,
    transactionHash,
    network: 'STARKNET',
    gasUsed: null, // Will be updated when transaction is confirmed
    metadata: {
      source: 'transfer_tool',
      memo: memo || undefined,
      timestamp: new Date().toISOString(),
    },
  };

  return await transactionRepository.create(transactionData);
}
