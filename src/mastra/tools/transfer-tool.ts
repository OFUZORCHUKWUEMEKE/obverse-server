import { Tool } from '@mastra/core';
import { z } from 'zod';
import { ethers } from 'ethers';
import {
  createWalletClient,
  http,
  parseEther,
  parseUnits,
  formatEther,
  formatUnits,
  isAddress,
  getContract,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mantle } from 'viem/chains';

const erc20Abi = [
  {
    constant: true,
    inputs: [{ name: '_owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: 'balance', type: 'uint256' }],
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      { name: '_to', type: 'address' },
      { name: '_value', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'decimals',
    outputs: [{ name: '', type: 'uint8' }],
    type: 'function',
  },
] as const;

// Token contract addresses on Mantle network
const TOKEN_ADDRESSES = {
  USDC: '0x09Bc4E0D864854c6aFB6eB9A9cdF58ac190D0dF9' as `0x${string}`,
  USDT: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956Ae' as `0x${string}`,
  DAI: '0xdA10009cBd5D07dd0CeCc66161FC93D7c9000da1' as `0x${string}`,
} as const;

const TOKEN_DECIMALS = {
  USDC: 6,
  USDT: 6,
  DAI: 18,
  MNT: 18,
} as const;

type TokenSymbol = keyof typeof TOKEN_ADDRESSES | 'MNT';

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
      'Transfer MNT or stablecoins (USDC, USDT, DAI) to another address',
    inputSchema: z.object({
      telegramUserId: z.string().describe('Telegram user ID of the sender'),
      toAddress: z
        .string()
        .describe(
          'Destination wallet address (must be valid Ethereum address)',
        ),
      amount: z.string().describe("Amount to transfer (e.g., '10.5', '100')"),
      token: z
        .enum(['MNT', 'USDC', 'USDT', 'DAI'])
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

        const explorerUrl = `https://explorer.mantle.xyz/tx/${transferResult.transactionHash}`;

        return {
          success: true,
          error: null,
          data: {
            transactionHash: transferResult.transactionHash,
            fromAddress: wallet.address,
            toAddress: normalizedToAddress,
            amount,
            token,
            gasUsed: transferResult.gasUsed,
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

  // Validate destination address
  if (!isAddress(toAddress)) {
    return {
      isValid: false,
      error:
        'Invalid destination address. Please provide a valid Ethereum address.',
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
    MNT: 0.001,
    USDC: 0.01,
    USDT: 0.01,
    DAI: 0.01,
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

    if (token === 'MNT') {
      const mantleBalance = await paraService.getMantleBalance(wallet.address);
      balance = parseFloat(mantleBalance.formatted);
    } else {
      const tokenBalance = await paraService.getTokenBalance(
        wallet.address,
        token,
      );
      balance = parseFloat(tokenBalance.balance);
    }

    if (balance < parsedAmount) {
      return {
        isValid: false,
        error: `Insufficient balance. You have ${balance.toFixed(6)} ${token}, but trying to send ${parsedAmount} ${token}.`,
      };
    }

    // Reserve some amount for gas fees (for MNT)
    if (token === 'MNT') {
      const gasReserve = 0.01; // Reserve 0.01 MNT for gas
      if (balance - parsedAmount < gasReserve) {
        return {
          isValid: false,
          error: `Insufficient balance for gas fees. Please keep at least ${gasReserve} MNT for transaction fees.`,
        };
      }
    } else {
      // For token transfers, check if user has enough MNT for gas
      const mantleBalance = await paraService.getMantleBalance(wallet.address);
      const mntBalance = parseFloat(mantleBalance.formatted);
      const gasReserve = 0.001; // Reserve 0.001 MNT for gas

      if (mntBalance < gasReserve) {
        return {
          isValid: false,
          error: `Insufficient MNT balance for gas fees. You need at least ${gasReserve} MNT to send ${token} tokens.`,
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
) {
  try {
    // Get Para SDK instance and wallet info
    const para = paraService.getInstance();

    if (token === 'MNT') {
      // Native MNT transfer
      return await transferMNT(para, wallet, toAddress, amount);
    } else {
      // ERC20 token transfer
      return await transferERC20Token(para, wallet, toAddress, amount, token);
    }
  } catch (error) {
    console.error('Execute transfer error:', error);
    throw new Error(
      `Failed to execute ${token} transfer: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

async function transferMNT(
  para: any,
  wallet: any,
  toAddress: string,
  amount: number,
) {
  try {
    // Use Para SDK to send native MNT
    const amountWei = parseEther(amount.toString());

    const transaction = await para.sendTransaction({
      pregenId: { telegramUserId: wallet.userId },
      transaction: {
        to: toAddress,
        value: amountWei.toString(),
        data: '0x',
      },
    });

    return {
      success: true,
      transactionHash: transaction.hash,
      gasUsed: transaction.gasUsed?.toString(),
      error: null,
    };
  } catch (error) {
    console.error('MNT transfer error:', error);
    return {
      success: false,
      error: `MNT transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      transactionHash: null,
      gasUsed: null,
    };
  }
}

async function transferERC20Token(
  para: any,
  wallet: any,
  toAddress: string,
  amount: number,
  token: TokenSymbol,
) {
  try {
    const tokenAddress = TOKEN_ADDRESSES[token as keyof typeof TOKEN_ADDRESSES];
    const decimals = TOKEN_DECIMALS[token as keyof typeof TOKEN_DECIMALS];

    // Parse amount with correct decimals
    const amountBN = parseUnits(amount.toString(), decimals);

    // Build ERC20 transfer transaction data
    const transferData = encodeFunctionCall(
      'transfer',
      ['address', 'uint256'],
      [toAddress, amountBN.toString()],
    );

    const transaction = await para.sendTransaction({
      pregenId: { telegramUserId: wallet.userId },
      transaction: {
        to: tokenAddress,
        value: '0',
        data: transferData,
      },
    });

    return {
      success: true,
      transactionHash: transaction.hash,
      gasUsed: transaction.gasUsed?.toString(),
      error: null,
    };
  } catch (error) {
    console.error('ERC20 transfer error:', error);
    return {
      success: false,
      error: `${token} transfer failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      transactionHash: null,
      gasUsed: null,
    };
  }
}

function encodeFunctionCall(
  functionName: string,
  types: string[],
  values: any[],
): string {
  try {
    const iface = new ethers.Interface([
      `function ${functionName}(${types.join(',')}) returns (bool)`,
    ]);
    return iface.encodeFunctionData(functionName, values);
  } catch (error) {
    throw new Error(
      `Failed to encode function call: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
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
    tokenAddress:
      token === 'MNT'
        ? null
        : TOKEN_ADDRESSES[token as keyof typeof TOKEN_ADDRESSES],
    fromAddress: wallet.address,
    toAddress,
    transactionHash,
    network: 'MANTLE',
    gasUsed: null, // Will be updated when transaction is confirmed
    metadata: {
      source: 'transfer_tool',
      memo: memo || undefined,
      timestamp: new Date().toISOString(),
    },
  };

  return await transactionRepository.create(transactionData);
}
