import { Injectable, Logger } from '@nestjs/common';
import { WalletRepository } from 'src/wallet/wallet.repository';
import { ParaService } from 'src/para/para.service';
import { PaymentLinkRepository } from 'src/payment-link/payment-repository';
import { UserRepository } from 'src/users/user-repository';
import {
  PaymentLinkType,
  PaymentLinkStatus,
} from 'src/payment-link/payment-link.model';
import { BlockchainNetwork } from 'src/wallet/wallet.model';
import * as QRCode from 'qrcode';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface McpToolResult {
  content: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isInteractive?: boolean;
  nextStep?: string;
  sessionId?: string;
  buttons?: Array<Array<{
    text: string;
    data?: string;
    url?: string;
  }>>;
}

interface PaymentLinkCreationState {
  step: 'name' | 'token' | 'amount' | 'details' | 'confirm';
  name?: string;
  token?: 'USDC' | 'USDT' | 'DAI';
  amount?: string;
  details?: { [key: string]: string };
  currentDetailField?: string;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private paymentCreationStates = new Map<string, PaymentLinkCreationState>();

  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly paraService: ParaService,
    private readonly paymentLinkRepository: PaymentLinkRepository,
    private readonly userRepository: UserRepository,
  ) { }

  async listTools(): Promise<McpTool[]> {
    return [
      {
        name: 'get_wallet_balance',
        description:
          'Get the wallet balance for a user including ETH, MNT, and token balances',
        inputSchema: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'The telegram user ID',
            },
          },
          required: ['userId'],
        },
      },
      {
        name: 'create_payment_link',
        description:
          'Start the interactive payment link creation process (like /payment command)',
        inputSchema: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'The telegram user ID of the payment link creator',
            },
          },
          required: ['userId'],
        },
      },
      {
        name: 'cancel_payment_creation',
        description:
          'Cancel the current payment link creation process',
        inputSchema: {
          type: 'object',
          properties: {
            userId: {
              type: 'string',
              description: 'The telegram user ID',
            },
          },
          required: ['userId'],
        },
      },
    ];
  }

  async callTool(name: string, args: any): Promise<McpToolResult> {
    this.logger.log(`Calling MCP tool: ${name} with args:`, args);

    switch (name) {
      case 'get_wallet_balance':
        return this.getWalletBalance(args.userId);
      case 'create_payment_link':
        return this.startPaymentLinkCreation(args.userId);
      case 'cancel_payment_creation':
        return this.cancelPaymentCreation(args.userId);
      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
        };
    }
  }

  private async getWalletBalance(userId: string): Promise<McpToolResult> {
    try {
      // Find user's wallet
      const wallet = await this.walletRepository.findOne({ userId });
      if (!wallet?.address) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ No wallet found for this user. User needs to create a wallet first using /start.',
            },
          ],
        };
      }

      // Get all balances in parallel
      const [ethBalance, mantleBalance, tokenBalances] = await Promise.all([
        this.paraService.getBalance(wallet.address),
        this.paraService.getMantleBalance(wallet.address),
        this.paraService.getAllTokenBalances(wallet.address),
      ]);

      // Format the response
      let balanceText =
        `💰 Wallet Balance\n\n` +
        `🔷 ETH: ${ethBalance.balance || '0'} ETH\n` +
        `🟢 MNT: ${mantleBalance.formatted || '0'} ${mantleBalance.symbol || 'MNT'}\n\n` +
        `🪙 Token Balances:\n`;

      // Add token balances
      for (const token of tokenBalances) {
        const emoji =
          token.symbol === 'USDC'
            ? '🔵'
            : token.symbol === 'USDT'
              ? '🟢'
              : '🟡';
        const balance = parseFloat(token.balance).toFixed(6);
        balanceText += `${emoji} ${token.symbol}: ${balance}\n`;
      }

      balanceText += `\n📍 Wallet Address: ${wallet.address}`;

      return {
        content: [
          {
            type: 'text',
            text: balanceText,
          },
        ],
      };
    } catch (error) {
      this.logger.error('Error getting wallet balance:', error);
      return {
        content: [
          {
            type: 'text',
            text: '❌ Failed to fetch wallet balance. Please try again later.',
          },
        ],
      };
    }
  }

  private async startPaymentLinkCreation(
    userId: string,
  ): Promise<McpToolResult> {
    try {
      // Check if user has a wallet
      const wallet = await this.walletRepository.findOne({ userId });
      if (!wallet?.address) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ No wallet found for this user. User needs to create a wallet first using /start.',
            },
          ],
        };
      }

      // Start payment link creation flow
      this.paymentCreationStates.set(userId, { step: 'name' });

      return {
        content: [
          {
            type: 'text',
            text:
              `🔗 **Create Payment Link**\n\n` +
              `Let's create a payment link for your business!\n\n` +
              `**Step 1 of 4:** What would you like to name this payment?\n\n` +
              `*Example: "Coffee Shop Order", "Service Payment", "Product Purchase"*\n\n` +
              `Please provide the payment name:`,
          },
        ],
        isInteractive: true,
        nextStep: 'name',
        sessionId: userId,
        buttons: [
          [{ text: '❌ Cancel', data: 'cancel' }],
        ],
      };
    } catch (error) {
      this.logger.error('Error starting payment link creation:', error);
      return {
        content: [
          {
            type: 'text',
            text: '❌ Failed to start payment link creation. Please try again later.',
          },
        ],
      };
    }
  }

  private async continuePaymentCreation(
    userId: string,
    input: string,
  ): Promise<McpToolResult> {
    try {
      const state = this.paymentCreationStates.get(userId);
      if (!state) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ No active payment creation session. Please start with create_payment_link.',
            },
          ],
        };
      }

      switch (state.step) {
        case 'name':
          return this.handlePaymentNameStep(userId, input, state);
        case 'token':
          return this.handlePaymentTokenStep(userId, input, state);
        case 'amount':
          return this.handlePaymentAmountStep(userId, input, state);
        case 'details':
          return this.handlePaymentDetailsStep(userId, input, state);
        case 'confirm':
          return this.handlePaymentConfirmStep(userId, input, state);
        default:
          return {
            content: [
              {
                type: 'text',
                text: '❌ Unknown step in payment creation process.',
              },
            ],
          };
      }
    } catch (error) {
      this.logger.error('Error continuing payment creation:', error);
      this.paymentCreationStates.delete(userId);
      return {
        content: [
          {
            type: 'text',
            text: '❌ An error occurred during payment link creation. Please start over.',
          },
        ],
      };
    }
  }

  private async handlePaymentNameStep(
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ): Promise<McpToolResult> {
    if (text.length > 100) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Payment name is too long. Please keep it under 100 characters.',
          },
        ],
        isInteractive: true,
        nextStep: 'name',
        sessionId: userId,
      };
    }

    state.name = text;
    state.step = 'token';
    this.paymentCreationStates.set(userId, state);

    return {
      content: [
        {
          type: 'text',
          text:
            `✅ Payment name set: **${text}**\n\n` +
            `**Step 2 of 4:** Which token would you like to accept?\n\n` +
            `Please choose one of the following:`,
        },
      ],
      isInteractive: true,
      nextStep: 'token',
      sessionId: userId,
      buttons: [
        [
          { text: '🔵 USDC', data: 'USDC' },
          { text: '🟢 USDT', data: 'USDT' },
        ],
        [{ text: '🟡 DAI', data: 'DAI' }],
      ],
    };
  }

  private async handlePaymentTokenStep(
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ): Promise<McpToolResult> {
    const validTokens = ['USDC', 'USDT', 'DAI'];
    const upperText = text.toUpperCase();

    if (!validTokens.includes(upperText)) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Invalid token. Please choose USDC, USDT, or DAI.',
          },
        ],
        isInteractive: true,
        nextStep: 'token',
        sessionId: userId,
        buttons: [
          [
            { text: '🔵 USDC', data: 'USDC' },
            { text: '🟢 USDT', data: 'USDT' },
          ],
          [{ text: '🟡 DAI', data: 'DAI' }],
        ],
      };
    }

    state.token = upperText as 'USDC' | 'USDT' | 'DAI';
    state.step = 'amount';
    this.paymentCreationStates.set(userId, state);

    const tokenEmoji =
      upperText === 'USDC' ? '🔵' : upperText === 'USDT' ? '🟢' : '🟡';

    return {
      content: [
        {
          type: 'text',
          text:
            `✅ Token selected: ${tokenEmoji} **${upperText}**\n\n` +
            `**Step 3 of 4:** What's the amount you want to request?\n\n` +
            `*Example: 10.50, 100, 0.5*\n\n` +
            `Please enter the amount in ${upperText}:`,
        },
      ],
      isInteractive: true,
      nextStep: 'amount',
      sessionId: userId,
    };
  }

  private async handlePaymentAmountStep(
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ): Promise<McpToolResult> {
    const amount = parseFloat(text);

    if (isNaN(amount) || amount <= 0) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ Invalid amount. Please enter a valid positive number.',
          },
        ],
        isInteractive: true,
        nextStep: 'amount',
        sessionId: userId,
      };
    }

    state.amount = text;
    state.step = 'details';
    state.details = {};
    this.paymentCreationStates.set(userId, state);

    return {
      content: [
        {
          type: 'text',
          text:
            `✅ Amount set: **${amount} ${state.token}**\n\n` +
            `**Step 4 of 4:** What customer details would you like to collect?\n\n` +
            `*Examples: name, email, phone, address, notes*\n\n` +
            `You can type:\n` +
            `• Single fields: "name" then "email" then "phone"\n` +
            `• Multiple fields at once: "name, email, phone, age"\n\n` +
            `Type **"done"** when finished:`,
        },
      ],
      isInteractive: true,
      nextStep: 'details',
      sessionId: userId,
    };
  }

  private async handlePaymentDetailsStep(
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ): Promise<McpToolResult> {
    const lowerText = text.toLowerCase().trim();

    if (
      lowerText === 'done' ||
      lowerText === 'finish' ||
      lowerText === 'complete'
    ) {
      state.step = 'confirm';
      this.paymentCreationStates.set(userId, state);
      return this.showPaymentConfirmation(userId, state);
    }

    if (!state.details) state.details = {};

    // Check if user provided comma-separated values
    if (text.includes(',')) {
      // Parse comma-separated fields
      const fields = text
        .split(',')
        .map((field) => field.trim().toLowerCase())
        .filter((field) => field.length > 0);

      // Add each field as a separate key
      fields.forEach((field) => {
        state.details![field] = '';
      });

      const detailsList = Object.keys(state.details)
        .map((field, index) => `${index + 1}. ${field}`)
        .join('\n');

      this.paymentCreationStates.set(userId, state);

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Added fields: **${fields.join(', ')}**\n\n` +
              `**Current fields:**\n${detailsList}\n\n` +
              `Type more fields (comma-separated or one by one) or **"done"** to continue:`,
          },
        ],
        isInteractive: true,
        nextStep: 'details',
        sessionId: userId,
      };
    } else {
      // Add single field (initialize with empty string)
      state.details[lowerText] = '';

      const detailsList = Object.keys(state.details)
        .map((field, index) => `${index + 1}. ${field}`)
        .join('\n');

      this.paymentCreationStates.set(userId, state);

      return {
        content: [
          {
            type: 'text',
            text:
              `✅ Added field: **${lowerText}**\n\n` +
              `**Current fields:**\n${detailsList}\n\n` +
              `Type another field (or comma-separated fields) or **"done"** to continue:`,
          },
        ],
        isInteractive: true,
        nextStep: 'details',
        sessionId: userId,
      };
    }
  }

  private async showPaymentConfirmation(
    userId: string,
    state: PaymentLinkCreationState,
  ): Promise<McpToolResult> {
    const tokenEmoji =
      state.token === 'USDC' ? '🔵' : state.token === 'USDT' ? '🟢' : '🟡';

    // Build details list from user-defined fields
    const detailsList =
      state.details && Object.keys(state.details).length > 0
        ? Object.keys(state.details)
          .map((field, index) => `  ${index + 1}. ${field}`)
          .join('\n')
        : '  (No details to collect)';

    return {
      content: [
        {
          type: 'text',
          text:
            `🔗 **Payment Link Summary**\n\n` +
            `**Name:** ${state.name}\n` +
            `**Token:** ${tokenEmoji} ${state.token}\n` +
            `**Amount:** ${state.amount} ${state.token}\n\n` +
            `**Customer Details to Collect:**\n${detailsList}\n\n` +
            `Is this correct?`,
        },
      ],
      isInteractive: true,
      nextStep: 'confirm',
      sessionId: userId,
      buttons: [
        [
          { text: '✅ Create Link', data: 'yes' },
          { text: '❌ Cancel', data: 'no' },
        ],
      ],
    };
  }

  private async handlePaymentConfirmStep(
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ): Promise<McpToolResult> {
    const lowerText = text.toLowerCase().trim();

    if (lowerText === 'no' || lowerText === 'cancel') {
      this.paymentCreationStates.delete(userId);
      return {
        content: [
          {
            type: 'text',
            text: '❌ Payment link creation cancelled.',
          },
        ],
      };
    }

    if (
      lowerText === 'yes' ||
      lowerText === 'create' ||
      lowerText === 'confirm'
    ) {
      return this.createPaymentLinkFromState(userId, state);
    }

    return {
      content: [
        {
          type: 'text',
          text: 'Please type **"yes"** to create the link or **"no"** to cancel.',
        },
      ],
      isInteractive: true,
      nextStep: 'confirm',
      sessionId: userId,
    };
  }

  private async createPaymentLinkFromState(
    userId: string,
    state: PaymentLinkCreationState,
  ): Promise<McpToolResult> {
    try {
      // Find user's wallet and user record
      const [wallet, user] = await Promise.all([
        this.walletRepository.findOne({ userId }),
        this.userRepository.findOne({ telegramId: userId }),
      ]);

      if (!wallet?.address) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ No wallet found for this user. User needs to create a wallet first using /start.',
            },
          ],
        };
      }

      if (!user) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ User not found. Please use /start to register.',
            },
          ],
        };
      }

      // Generate unique link ID
      const linkId = this.generateLinkId();
      const linkUrl = `https://obverse-ui.vercel.app/pay/${linkId}`;

      // Get token contract address
      const tokenAddresses = {
        USDC: '0x09Bc4E0D864854c6aFB6eB9A9cdF58ac190D0dF9',
        USDT: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956Ae',
        DAI: '0xdA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      };

      // Create payment link
      await this.paymentLinkRepository.create({
        creatorUserId: user._id,
        creatorWalletId: wallet._id,
        linkId,
        amount: state.amount!,
        token: state.token!,
        tokenAddress: tokenAddresses[state.token!],
        network: BlockchainNetwork.MANTLE,
        type: PaymentLinkType.ONE_TIME,
        status: PaymentLinkStatus.ACTIVE,
        title: state.name!,
        linkUrl,
        details: state.details || {},
        payerDetails: this.convertDetailsToPayerDetails(state.details),
        metadata: {
          source: 'mcp',
        },
      });

      const tokenEmoji =
        state.token === 'USDC' ? '🔵' : state.token === 'USDT' ? '🟢' : '🟡';

      // Build details list
      const detailsList =
        state.details && Object.keys(state.details).length > 0
          ? Object.keys(state.details)
            .map((field, index) => `  ${index + 1}. ${field}`)
            .join('\n')
          : '  (No details to collect)';

      // Generate QR code as buffer
      const qrCodeBuffer = await this.generateQRCodeBuffer(linkUrl);

      const responseText =
        `🎉 **Payment Link Created Successfully!**\n\n` +
        `**Name:** ${state.name}\n` +
        `**Amount:** ${state.amount} ${tokenEmoji} ${state.token}\n` +
        `**Network:** Mantle\n\n` +
        `**Customer Details to Collect:**\n${detailsList}\n\n` +
        `**Payment Link:** ${linkUrl}\n` +
        `**Link ID:** ${linkId}\n\n` +
        `Share this link with your customers to receive payments!`;

      // Clean up state
      this.paymentCreationStates.delete(userId);

      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
          {
            type: 'image',
            data: qrCodeBuffer.toString('base64'),
            mimeType: 'image/png',
          },
        ],
        buttons: [
          [
            { text: '🌐 Open in Browser', url: linkUrl },
            { text: '📋 Copy Link', data: `copy_link_${linkId}` },
          ],
          [
            { text: '📊 View Details', data: `view_payment_${linkId}` },
            { text: '🔗 Create Another', data: 'create_payment' },
          ],
        ],
      };
    } catch (error) {
      this.logger.error('Error creating payment link from state:', error);
      this.paymentCreationStates.delete(userId);
      return {
        content: [
          {
            type: 'text',
            text: '❌ Failed to create payment link. Please try again later.',
          },
        ],
      };
    }
  }

  private async cancelPaymentCreation(userId: string): Promise<McpToolResult> {
    const state = this.paymentCreationStates.get(userId);
    if (!state) {
      return {
        content: [
          {
            type: 'text',
            text: '❌ No active payment creation session to cancel.',
          },
        ],
      };
    }

    this.paymentCreationStates.delete(userId);
    return {
      content: [
        {
          type: 'text',
          text: '❌ Payment link creation cancelled. You can start a new one anytime by saying "create payment link".',
        },
      ],
    };
  }

  private generateLinkId(): string {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private async generateQRCodeDataURL(text: string): Promise<string> {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(text, {
        type: 'image/png',
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      });
      return qrCodeDataURL;
    } catch (error) {
      this.logger.error('Error generating QR code:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  private async generateQRCodeBuffer(text: string): Promise<Buffer> {
    try {
      const qrCodeBuffer = await QRCode.toBuffer(text, {
        type: 'png',
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      });
      return qrCodeBuffer;
    } catch (error) {
      this.logger.error('Error generating QR code buffer:', error);
      throw new Error('Failed to generate QR code');
    }
  }

  private convertDetailsToPayerDetails(details?: {
    [key: string]: string;
  }): { [key: string]: any } | undefined {
    if (!details || Object.keys(details).length === 0) {
      return undefined;
    }

    const payerDetails: { [key: string]: any } = {};

    // Initialize all fields from details with empty strings
    Object.keys(details).forEach((key) => {
      payerDetails[key] = '';
    });

    return payerDetails;
  }

  async processNaturalLanguage(
    message: string,
    userId: string,
  ): Promise<string> {
    const lowerMessage = message.toLowerCase().trim();

    // Check if user wants to cancel payment creation
    if (lowerMessage === 'cancel' || lowerMessage === '/cancel' || lowerMessage === 'quit' || lowerMessage === 'exit') {
      const paymentState = this.paymentCreationStates.get(userId);
      if (paymentState) {
        this.logger.log(`Cancelling payment creation flow for user ${userId}`);
        const result = await this.cancelPaymentCreation(userId);
        return result.content[0].text || 'Payment creation cancelled.';
      }
    }

    // Check if user is in payment creation flow first
    const paymentState = this.paymentCreationStates.get(userId);
    if (paymentState) {
      this.logger.log(`Continuing payment creation flow for user ${userId} at step ${paymentState.step}`);
      const result = await this.continuePaymentCreation(userId, message);
      return result.content[0].text || 'Continuing payment creation...';
    }

    // Simple pattern matching for balance queries
    const balanceKeywords = [
      'balance',
      'wallet',
      'money',
      'funds',
      'tokens',
      'eth',
      'mnt',
      'usdc',
      'usdt',
    ];
    // Pattern matching for payment link queries
    const paymentKeywords = [
      'payment',
      'link',
      'create payment',
      'payment link',
      'receive money',
      'get paid',
    ];

    if (balanceKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      this.logger.log(`Processing balance request for user ${userId}`);
      const result = await this.callTool('get_wallet_balance', { userId });
      return result.content[0].text || 'Unable to retrieve balance information.';
    }

    if (paymentKeywords.some((keyword) => lowerMessage.includes(keyword))) {
      this.logger.log(`Processing payment request for user ${userId}`);
      const result = await this.callTool('create_payment_link', { userId });
      return result.content[0].text || 'Unable to start payment link creation.';
    }

    return (
      '🤖 I understand you want to: "' +
      message +
      '"\n\n' +
      'I can help you with:\n' +
      '• Check your wallet balance\n' +
      '• View transaction history\n' +
      '• Create payment links\n' +
      '• Send payments\n\n' +
      'Try saying: "show my balance", "create payment link" or use commands like /balance'
    );
  }
}
