// src/telegram/handlers/message.handler.ts
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { UserRepository } from 'src/users/user-repository';
import { WalletRepository } from 'src/wallet/wallet.repository';
import { TelegramService } from '../telegram.service';
import { ParaService } from 'src/para/para.service';
import { PaymentLinkRepository } from 'src/payment-link/payment-repository';
import {
  PaymentLinkType,
  PaymentLinkStatus,
} from 'src/payment-link/payment-link.model';
import { BlockchainNetwork } from 'src/wallet/wallet.model';
import { McpService } from 'src/mcp/mcp.service';
import * as QRCode from 'qrcode';

interface PaymentLinkCreationState {
  step: 'name' | 'token' | 'amount' | 'details' | 'confirm';
  name?: string;
  token?: 'USDC' | 'USDT' | 'DAI';
  amount?: string;
  details?: { [key: string]: string };
  currentDetailField?: string;
}

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);
  private paymentCreationStates = new Map<string, PaymentLinkCreationState>();

  constructor(
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService,
    private userRepository: UserRepository,
    private walletRepository: WalletRepository,
    private paraService: ParaService,
    private paymentLinkRepository: PaymentLinkRepository,
    private mcpService: McpService,
  ) {}

  async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id?.toString();
    const text = msg.text;

    if (!userId || !text) return;

    this.logger.log(`Message from user ${userId}: ${text}`);

    // Ensure user exists in database
    if (msg.from) {
      await this.ensureUserExists(msg.from);
    }

    // Handle different message types
    if (text.startsWith('/')) {
      await this.handleCommand(chatId, userId, text, msg);
    } else {
      // Check if user is in payment creation flow
      const paymentState = this.paymentCreationStates.get(userId);
      if (paymentState) {
        await this.handlePaymentCreationFlowInternal(
          chatId,
          userId,
          text,
          paymentState,
        );
      } else {
        await this.handleNaturalLanguage(chatId, userId, text, msg);
      }
    }
  }

  private async handleCommand(
    chatId: number,
    userId: string,
    command: string,
    msg: TelegramBot.Message,
  ) {
    const [cmd, ...args] = command.split(' ');

    switch (cmd.toLowerCase()) {
      case '/start':
        await this.handleStartCommand(chatId, userId, msg);
        break;
      case '/help':
        await this.handleHelpCommand(chatId);
        break;
      case '/wallet':
        await this.handleWalletCommand(chatId, userId);
        break;
      case '/balance':
        await this.handleBalanceCommand(chatId, userId, msg);
        break;
      case '/transactions':
        await this.handleTransactionsCommand(chatId, userId);
        break;
      case '/send':
        await this.handleSendCommand(chatId, userId, args);
        break;
      case '/payment':
        await this.handlePaymentCommand(chatId, userId, args);
        break;
      case '/settings':
        await this.handleSettingsCommand(chatId, userId);
        break;
      case '/cancel':
        await this.handleCancelCommand(chatId, userId);
        break;
      default:
        await this.telegramService.sendMessage(
          chatId,
          '❓ Unknown command. Type /help to see available commands.',
        );
    }
  }

  private async handleNaturalLanguage(
    chatId: number,
    userId: string,
    text: string,
    msg: TelegramBot.Message,
  ) {
    try {
      this.logger.log(
        `Processing natural language request from user ${userId}: "${text}"`,
      );

      // Use MCP service to process the natural language request
      const response = await this.mcpService.processNaturalLanguage(
        text,
        userId,
      );

      await this.telegramService.sendMessage(chatId, response, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Balance', callback_data: 'balance' },
              { text: '📊 Transactions', callback_data: 'transactions' },
            ],
            [
              { text: '💸 Send', callback_data: 'send' },
              { text: '🔗 Payment Link', callback_data: 'payment' },
            ],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Error processing natural language:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Sorry, I had trouble understanding your request. Please try again or use a command like /balance.',
      );
    }
  }

  private async handleStartCommand(
    chatId: number,
    userId: string,
    msg: TelegramBot.Message,
  ) {
    try {
      // Check if user already has a wallet
      const telegramId = msg.from?.id.toString();
      const exWallet = await this.walletRepository.findOne({
        userId: telegramId,
      });
      if (!telegramId) {
        throw new Error('telegramId is undefined');
      }
      const username = msg.from?.username?.toString() || telegramId;
      let user = await this.userRepository.findOne({ telegramId });
      if (!user) {
        user = await this.userRepository.create({
          telegramId,
          firstName: msg.from?.first_name || '',
          lastName: msg.from?.last_name || '',
          username,
          languageCode: msg.from?.language_code || 'en',
          isActive: true,
          lastSeenAt: new Date(),
        });
        this.logger.log(`New user created: ${telegramId}`);
      } else {
        // Update last seen
        user.lastSeenAt = new Date();
        await this.userRepository.save(user);
      }
      if (!exWallet) {
        this.logger.log(
          `No existing wallet found for user ${telegramId}. Creating a new one...`,
        );
        const wallet = await this.paraService.createWallet(telegramId);
        if (!wallet) {
          this.logger.error(`Failed to create wallet for user ${telegramId}`);
          await this.telegramService.sendErrorMessage(
            chatId,
            'Failed to create your wallet. Please try again later.',
          );
          return;
        }
        const newWallet = await this.walletRepository.create({
          userId: telegramId,
          address: wallet.wallet.address,
          paraWalletId: wallet.wallet.id,
          walletShareData: wallet.keyShare,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        this.logger.log(
          `New wallet created for user ${telegramId}: ${newWallet.address}`,
        );
        const welcomeText =
          `🎉 <b>Welcome back!</b>\n\n` +
          `Your wallet is ready to use.\n\n` +
          `<b>Wallet Address:</b>\n<code>${newWallet.address}</code>\n\n` +
          `What would you like to do?\n\n` +
          `💰 /balance - Check your balance\n` +
          `📊 /transactions - View transaction history\n` +
          `💸 /send - Send cryptocurrency\n` +
          `🔗 /payment - Create payment link`;

        await this.telegramService.sendMessage(chatId, welcomeText, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '💰 Balance', callback_data: 'balance' },
                { text: '📊 Transactions', callback_data: 'transactions' },
              ],
              [
                { text: '💸 Send', callback_data: 'send' },
                { text: '🔗 Payment Link', callback_data: 'payment' },
              ],
            ],
          },
        });
      }
      const welcomeText =
        `🎉 <b>Welcome back!</b>\n\n` +
        `Your wallet is ready to use.\n\n` +
        `<b>Wallet Address:</b>\n<code>${exWallet?.address}</code>\n\n` +
        `What would you like to do?\n\n` +
        `💰 /balance - Check your balance\n` +
        `📊 /transactions - View transaction history\n` +
        `💸 /send - Send cryptocurrency\n` +
        `🔗 /payment - Create payment link`;

      await this.telegramService.sendMessage(chatId, welcomeText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Balance', callback_data: 'balance' },
              { text: '📊 Transactions', callback_data: 'transactions' },
            ],
            [
              { text: '💸 Send', callback_data: 'send' },
              { text: '🔗 Payment Link', callback_data: 'payment' },
            ],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Error in start command:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to initialize your wallet. Please try again.',
      );
    }
  }

  private async handleHelpCommand(chatId: number) {
    const helpText =
      `🤖 <b>Crypto Wallet Bot Help</b>\n\n` +
      `<b>Available Commands:</b>\n\n` +
      `💰 /balance - Check your wallet balance\n` +
      `📊 /transactions - View transaction history\n` +
      `💸 /send - Send cryptocurrency to another wallet\n` +
      `🔗 /payment - Create a payment link for receiving payments\n` +
      `👤 /wallet - Show wallet information\n` +
      `⚙️ /settings - Bot settings and preferences\n` +
      `❓ /help - Show this help message\n\n` +
      `<b>Natural Language:</b>\n` +
      `You can also talk to me naturally! Try saying:\n` +
      `• "Show my balance"\n` +
      `• "Send 100 USDC to 0x..."\n` +
      `• "Create payment link for $50"\n` +
      `• "What are my recent transactions?"\n\n` +
      `<b>Need help?</b> Just ask me anything!`;

    await this.telegramService.sendMessage(chatId, helpText);
  }

  private async handleWalletCommand(chatId: number, userId: string) {
    try {
      // const wallet = await this.walletService.findByUserId(userId);
      const wallet = await this.walletRepository.findOne({ userId });

      if (!wallet) {
        await this.telegramService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create one.',
        );
        return;
      }

      const walletText =
        `👛 <b>Your Wallet</b>\n\n` +
        `<b>Address:</b>\n<code>${wallet.address}</code>\n\n` +
        `<b>Status:</b> ${wallet.status}\n` +
        `<b>Networks:</b> ${wallet.supportedNetworks.join(', ')}\n` +
        `<b>Created:</b> ${wallet.createdAt?.toLocaleDateString()}\n\n` +
        `<b>Quick Actions:</b>`;

      await this.telegramService.sendMessage(chatId, walletText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: 'balance' },
              { text: '📊 Transactions', callback_data: 'transactions' },
            ],
            [
              { text: '💸 Send', callback_data: 'send' },
              { text: '🔗 Payment Link', callback_data: 'payment' },
            ],
            [
              {
                text: '📋 Copy Address',
                callback_data: `copy_address_${wallet.address}`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Error in wallet command:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to retrieve wallet information.',
      );
    }
  }

  private async handleBalanceCommand(
    chatId: number,
    userId: string,
    msg: TelegramBot.Message,
  ) {
    try {
      const telegramId = msg.from?.id.toString();
      if (!telegramId) {
        await this.telegramService.sendErrorMessage(
          chatId,
          'Unable to identify user. Please try again.',
        );
        return;
      }

      const wallet = await this.walletRepository.findOne({
        userId: telegramId,
      });
      if (!wallet?.address) {
        await this.telegramService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create a wallet.',
        );
        return;
      }

      await this.telegramService.sendMessage(
        chatId,
        '⏳ Fetching your balances...',
      );

      const [ethBalance, mantleBalance, tokenBalances] = await Promise.all([
        this.paraService.getBalance(wallet.address),
        this.paraService.getMantleBalance(wallet.address),
        this.paraService.getAllTokenBalances(wallet.address),
      ]);

      let balanceText =
        `💰 <b>Your Wallet Balance</b>\n\n` +
        `<b>🔷 ETH:</b> ${ethBalance.balance || '0'} ETH\n` +
        `<b>🟢 MNT:</b> ${mantleBalance.formatted || '0'} ${mantleBalance.symbol || 'MNT'}\n\n` +
        `<b>🪙 Token Balances:</b>\n`;

      // Add token balances
      for (const token of tokenBalances) {
        const emoji =
          token.symbol === 'USDC'
            ? '🔵'
            : token.symbol === 'USDT'
              ? '🟢'
              : '🟡';
        const balance = parseFloat(token.balance).toFixed(6);
        balanceText += `${emoji} <b>${token.symbol}:</b> ${balance}\n`;
      }

      balanceText += `\n<b>📍 Wallet Address:</b>\n<code>${wallet.address}</code>`;

      await this.telegramService.sendMessage(chatId, balanceText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh', callback_data: 'balance' },
              { text: '💸 Send', callback_data: 'send' },
            ],
            [
              { text: '📊 Transactions', callback_data: 'transactions' },
              { text: '🔗 Payment Link', callback_data: 'payment' },
            ],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Error in balance command:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to fetch balance. Please try again later.',
      );
    }
  }

  private async handleTransactionsCommand(chatId: number, userId: string) {
    try {
      const telegramId = userId;
      const wallet = await this.walletRepository.findOne({
        userId: telegramId,
      });
      if (!wallet?.address) {
        await this.telegramService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create a wallet.',
        );
        return;
      }

      await this.telegramService.sendMessage(
        chatId,
        '⏳ Loading your transactions...',
      );

      const transactions = await this.paraService.getWalletTransactions(
        wallet.address,
        5,
      );

      let transactionText = `📊 <b>Recent Transactions</b>\n\n`;

      // Show native transactions first
      if (transactions.nativeTransactions.length > 0) {
        transactionText += `<b>🔷 Native Transactions (MNT/ETH):</b>\n\n`;
        transactions.nativeTransactions.forEach((tx, index) => {
          transactionText += `${index + 1}. ${this.paraService.formatTransactionForDisplay(tx)}\n\n`;
        });
      }

      // Show token transfers
      if (transactions.tokenTransfers.length > 0) {
        transactionText += `<b>🪙 Token Transfers:</b>\n\n`;
        transactions.tokenTransfers.forEach((transfer, index) => {
          transactionText += `${index + 1}. ${this.paraService.formatTokenTransferForDisplay(transfer)}\n\n`;
        });
      }

      if (
        transactions.nativeTransactions.length === 0 &&
        transactions.tokenTransfers.length === 0
      ) {
        transactionText += `No recent transactions found for your wallet.\n\n`;
      }

      transactionText += `<b>📍 Wallet Address:</b>\n<code>${wallet.address}</code>`;

      await this.telegramService.sendMessage(chatId, transactionText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh', callback_data: 'transactions' },
              { text: '💰 Balance', callback_data: 'balance' },
            ],
            [
              {
                text: '🌐 View on Explorer',
                url: `https://explorer.mantle.xyz/address/${wallet.address}`,
              },
            ],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Error in transactions command:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to fetch transactions. Please try again later.',
      );
    }
  }

  private async handleSendCommand(
    chatId: number,
    userId: string,
    args: string[],
  ) {
    await this.telegramService.sendMessage(
      chatId,
      '💸 Send feature coming soon!\n\n(Send functionality will be implemented with Para integration)',
    );
  }

  public async handlePaymentCommand(
    chatId: number,
    userId: string,
    args: string[],
  ) {
    try {
      const wallet = await this.walletRepository.findOne({ userId });
      if (!wallet?.address) {
        await this.telegramService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create a wallet.',
        );
        return;
      }

      // Start payment link creation flow
      this.paymentCreationStates.set(userId, { step: 'name' });

      await this.telegramService.sendMessage(
        chatId,
        `🔗 <b>Create Payment Link</b>\n\n` +
          `Let's create a payment link for your business!\n\n` +
          `<b>Step 1 of 4:</b> What would you like to name this payment?\n\n` +
          `<i>Example: "Coffee Shop Order", "Service Payment", "Product Purchase"</i>\n\n` +
          `Type <code>/cancel</code> to cancel anytime.`,
      );
    } catch (error) {
      this.logger.error('Error in payment command:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to start payment link creation. Please try again.',
      );
    }
  }

  private async handleSettingsCommand(chatId: number, userId: string) {
    const settingsText =
      `⚙️ <b>Bot Settings</b>\n\n` + `Configure your preferences:`;

    await this.telegramService.sendMessage(chatId, settingsText, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔔 Notifications',
              callback_data: 'settings_notifications',
            },
            { text: '💱 Default Token', callback_data: 'settings_token' },
          ],
          [
            { text: '🌐 Language', callback_data: 'settings_language' },
            { text: '🔐 Security', callback_data: 'settings_security' },
          ],
        ],
      },
    });
  }

  private async handleCancelCommand(chatId: number, userId: string) {
    if (this.paymentCreationStates.has(userId)) {
      this.paymentCreationStates.delete(userId);
      await this.telegramService.sendMessage(
        chatId,
        '❌ Payment link creation cancelled.',
      );
    } else {
      await this.telegramService.sendMessage(
        chatId,
        'No active payment creation process to cancel.',
      );
    }
  }

  private async handlePaymentCreationFlowInternal(
    chatId: number,
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ) {
    try {
      switch (state.step) {
        case 'name':
          await this.handlePaymentNameStep(chatId, userId, text, state);
          break;
        case 'token':
          await this.handlePaymentTokenStep(chatId, userId, text, state);
          break;
        case 'amount':
          await this.handlePaymentAmountStep(chatId, userId, text, state);
          break;
        case 'details':
          await this.handlePaymentDetailsStep(chatId, userId, text, state);
          break;
        case 'confirm':
          await this.handlePaymentConfirmStep(chatId, userId, text, state);
          break;
      }
    } catch (error) {
      this.logger.error('Error in payment creation flow:', error);
      this.paymentCreationStates.delete(userId);
      await this.telegramService.sendErrorMessage(
        chatId,
        'An error occurred during payment link creation. Please try again with /payment.',
      );
    }
  }

  private async handlePaymentNameStep(
    chatId: number,
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ) {
    if (text.length > 100) {
      await this.telegramService.sendMessage(
        chatId,
        '❌ Payment name is too long. Please keep it under 100 characters.',
      );
      return;
    }

    state.name = text;
    state.step = 'token';

    await this.telegramService.sendMessage(
      chatId,
      `✅ Payment name set: <b>${text}</b>\n\n` +
        `<b>Step 2 of 4:</b> Which token would you like to accept?\n\n` +
        `Please choose one of the following:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔵 USDC', callback_data: 'payment_token_USDC' },
              { text: '🟢 USDT', callback_data: 'payment_token_USDT' },
            ],
            [{ text: '🟡 DAI', callback_data: 'payment_token_DAI' }],
          ],
        },
      },
    );

    this.paymentCreationStates.set(userId, state);
  }

  private async handlePaymentTokenStep(
    chatId: number,
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ) {
    const validTokens = ['USDC', 'USDT', 'DAI'];
    const upperText = text.toUpperCase();

    if (!validTokens.includes(upperText)) {
      await this.telegramService.sendMessage(
        chatId,
        '❌ Invalid token. Please choose USDC, USDT, or DAI.',
      );
      return;
    }

    state.token = upperText as 'USDC' | 'USDT' | 'DAI';
    state.step = 'amount';

    const tokenEmoji =
      upperText === 'USDC' ? '🔵' : upperText === 'USDT' ? '🟢' : '🟡';

    await this.telegramService.sendMessage(
      chatId,
      `✅ Token selected: ${tokenEmoji} <b>${upperText}</b>\n\n` +
        `<b>Step 3 of 4:</b> What's the amount you want to request?\n\n` +
        `<i>Example: 10.50, 100, 0.5</i>\n\n` +
        `Please enter the amount in ${upperText}:`,
    );

    this.paymentCreationStates.set(userId, state);
  }

  private async handlePaymentAmountStep(
    chatId: number,
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ) {
    const amount = parseFloat(text);

    if (isNaN(amount) || amount <= 0) {
      await this.telegramService.sendMessage(
        chatId,
        '❌ Invalid amount. Please enter a valid positive number.',
      );
      return;
    }

    state.amount = text;
    state.step = 'details';
    state.details = {};

    await this.telegramService.sendMessage(
      chatId,
      `✅ Amount set: <b>${amount} ${state.token}</b>\n\n` +
        `<b>Step 4 of 4:</b> What customer details would you like to collect?\n\n` +
        `<i>Examples: name, email, phone, address, notes</i>\n\n` +
        `You can type:\n` +
        `• Single fields: "name" then "email" then "phone"\n` +
        `• Multiple fields at once: "name, email, phone, age"\n\n` +
        `Type <b>"done"</b> when finished:`,
    );

    this.paymentCreationStates.set(userId, state);
  }

  private async handlePaymentDetailsStep(
    chatId: number,
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ) {
    const lowerText = text.toLowerCase().trim();

    if (
      lowerText === 'done' ||
      lowerText === 'finish' ||
      lowerText === 'complete'
    ) {
      state.step = 'confirm';
      await this.showPaymentConfirmation(chatId, userId, state);
      return;
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

      await this.telegramService.sendMessage(
        chatId,
        `✅ Added fields: <b>${fields.join(', ')}</b>\n\n` +
          `<b>Current fields:</b>\n${detailsList}\n\n` +
          `Type more fields (comma-separated or one by one) or <b>"done"</b> to continue:`,
      );
    } else {
      // Add single field (initialize with empty string)
      state.details[lowerText] = '';

      const detailsList = Object.keys(state.details)
        .map((field, index) => `${index + 1}. ${field}`)
        .join('\n');

      await this.telegramService.sendMessage(
        chatId,
        `✅ Added field: <b>${lowerText}</b>\n\n` +
          `<b>Current fields:</b>\n${detailsList}\n\n` +
          `Type another field (or comma-separated fields) or <b>"done"</b> to continue:`,
      );
    }

    this.paymentCreationStates.set(userId, state);
  }

  private async showPaymentConfirmation(
    chatId: number,
    userId: string,
    state: PaymentLinkCreationState,
  ) {
    const tokenEmoji =
      state.token === 'USDC' ? '🔵' : state.token === 'USDT' ? '🟢' : '🟡';

    // Build details list from user-defined fields
    const detailsList =
      state.details && Object.keys(state.details).length > 0
        ? Object.keys(state.details)
            .map((field, index) => `  ${index + 1}. ${field}`)
            .join('\n')
        : '  (No details to collect)';

    const confirmationText =
      `🔗 <b>Payment Link Summary</b>\n\n` +
      `<b>Name:</b> ${state.name}\n` +
      `<b>Token:</b> ${tokenEmoji} ${state.token}\n` +
      `<b>Amount:</b> ${state.amount} ${state.token}\n\n` +
      `<b>Customer Details to Collect:</b>\n${detailsList}\n\n` +
      `Is this correct?`;

    await this.telegramService.sendMessage(chatId, confirmationText, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Create Link', callback_data: 'payment_confirm_yes' },
            { text: '❌ Cancel', callback_data: 'payment_confirm_no' },
          ],
        ],
      },
    });

    this.paymentCreationStates.set(userId, state);
  }

  private async handlePaymentConfirmStep(
    chatId: number,
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ) {
    // This step is handled by callback buttons, so we'll just inform the user
    await this.telegramService.sendMessage(
      chatId,
      'Please use the buttons above to confirm or cancel your payment link.',
    );
  }

  public async handlePaymentCreationFlow(
    chatId: number,
    userId: string,
    text: string,
    state: PaymentLinkCreationState,
  ) {
    return this.handlePaymentCreationFlowInternal(chatId, userId, text, state);
  }

  public getPaymentCreationState(
    userId: string,
  ): PaymentLinkCreationState | undefined {
    return this.paymentCreationStates.get(userId);
  }

  public deletePaymentCreationState(userId: string): void {
    this.paymentCreationStates.delete(userId);
  }

  public async createPaymentLink(
    chatId: number,
    userId: string,
    state: PaymentLinkCreationState,
  ) {
    try {
      const wallet = await this.walletRepository.findOne({ userId });
      const user = await this.userRepository.findOne({ telegramId: userId });

      if (!wallet || !user) {
        throw new Error('Wallet or user not found');
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

      const paymentLink = await this.paymentLinkRepository.create({
        creatorUserId: user._id,
        creatorWalletId: wallet._id,
        linkId,
        amount: state.amount,
        token: state.token,
        tokenAddress: tokenAddresses[state.token!],
        network: BlockchainNetwork.MANTLE,
        type: PaymentLinkType.ONE_TIME,
        status: PaymentLinkStatus.ACTIVE,
        title: state.name!,
        linkUrl,
        details: state.details || {},
        payerDetails: this.convertDetailsToPayerDetails(state.details),
        telegramChatId: chatId.toString(),
        metadata: {
          source: 'telegram',
        },
      });

      const tokenEmoji =
        state.token === 'USDC' ? '🔵' : state.token === 'USDT' ? '🟢' : '🟡';

      // Generate QR code for the payment link
      const qrCodeBuffer = await this.generateQRCode(linkUrl);

      // Send the text message first
      await this.telegramService.sendMessage(
        chatId,
        `🎉 <b>Payment Link Created Successfully!</b>\n\n` +
          `<b>Name:</b> ${state.name}\n` +
          `<b>Amount:</b> ${state.amount} ${tokenEmoji} ${state.token}\n\n` +
          `<b>Payment Link:</b>\n${linkUrl}\n\n` +
          `<b>Link ID:</b> <code>${linkId}</code>\n\n` +
          `📱 <b>QR Code below for easy sharing!</b>`,
      );

      // Send the QR code as a photo
      await this.telegramService.sendPhoto(chatId, qrCodeBuffer, {
        caption: `QR Code for ${state.name}\nScan to access payment link`,
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 Open in Browser', url: linkUrl },
              { text: '📋 Copy Link', callback_data: `copy_link_${linkId}` },
            ],
            [
              {
                text: '📊 View Details',
                callback_data: `view_payment_${paymentLink._id}`,
              },
              { text: '🔗 Create Another', callback_data: 'create_payment' },
            ],
          ],
        },
      });

      // Clean up state
      this.paymentCreationStates.delete(userId);
    } catch (error) {
      this.logger.error('Error creating payment link:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to create payment link. Please try again.',
      );
    }
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

  private async generateQRCode(text: string): Promise<Buffer> {
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
      this.logger.error('Error generating QR code:', error);
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

  private async ensureUserExists(telegramUser: TelegramBot.User) {
    try {
      // const existingUser = await this.userService.findByTelegramId(telegramUser.id.toString());
      const existingUser = await this.userRepository.findOne({
        telegramId: telegramUser.id.toString(),
      });

      if (!existingUser) {
        await this.userRepository.create({
          telegramId: telegramUser.id.toString(),
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          username: telegramUser.username,
          languageCode: telegramUser.language_code,
          isActive: true,
          lastSeenAt: new Date(),
        });

        this.logger.log(`New user created: ${telegramUser.id}`);
      } else {
        // Update last seen
        // await this.userRepository.updateLastSeen(telegramUser.id.toString());
        await this.userRepository.findOneAndUpdate(
          { telegramId: telegramUser.id.toString() },
          { lastSeenAt: new Date() },
          { new: true },
        );
      }
    } catch (error) {
      this.logger.error('Error ensuring user exists:', error);
    }
  }
}
