// src/telegram/handlers/message.handler.ts
import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { UserRepository } from 'src/users/user-repository';
import { WalletRepository } from 'src/wallet/wallet.repository';
import { TelegramService } from '../telegram.service';
import { PrivyService } from 'src/para/privy.service';
import { PaymentLinkRepository } from 'src/payment-link/payment-repository';
import {
  PaymentLinkType,
  PaymentLinkStatus,
} from 'src/payment-link/payment-link.model';
import { BlockchainNetwork } from 'src/wallet/wallet.model';
import { McpService } from 'src/mcp/mcp.service';
import { MastraService } from 'src/mastra/mastra.service';
import * as QRCode from 'qrcode';

interface PaymentLinkCreationState {
  step: 'name' | 'token' | 'amount' | 'details' | 'confirm';
  name?: string;
  token?: 'USDC' | 'USDT' | 'DAI';
  amount?: string;
  details?: { [key: string]: string };
  currentDetailField?: string;
}

interface PaymentLinkTrackingState {
  step: 'asking_name';
}

@Injectable()
export class MessageHandler {
  private readonly logger = new Logger(MessageHandler.name);
  private paymentCreationStates = new Map<string, PaymentLinkCreationState>();
  private paymentTrackingStates = new Map<string, PaymentLinkTrackingState>();

  constructor(
    @Inject(forwardRef(() => TelegramService))
    private telegramService: TelegramService,
    private userRepository: UserRepository,
    private walletRepository: WalletRepository,
    private privyService: PrivyService,
    private paymentLinkRepository: PaymentLinkRepository,
    private mcpService: McpService,
    private mastraService: MastraService,
  ) { }

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
      const trackingState = this.paymentTrackingStates.get(userId);

      if (paymentState) {
        await this.handlePaymentCreationFlowInternal(
          chatId,
          userId,
          text,
          paymentState,
        );
      } else if (trackingState) {
        await this.handlePaymentLinkTrackingFlow(
          chatId,
          userId,
          text,
          trackingState,
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
      case '/linkstats':
        await this.handleLinkStatsCommand(chatId, userId, args);
        break;
      case '/payment-link':
        await this.handlePaymentLinkTrackingCommand(chatId, userId);
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
        `Processing enhanced natural language request from user ${userId}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
      );

      // Send processing message
      const processingMessages = [
        '🤖 Processing your request...',
        '💭 Thinking...',
        '⚡ Working on it...',
        '🔍 Analyzing...',
        '🧠 Processing...',
      ];
      const processingMsg =
        processingMessages[
        Math.floor(Math.random() * processingMessages.length)
        ];
      const processingMsgId = await this.telegramService.sendMessage(
        chatId,
        processingMsg,
      );

      // Enhanced processing with smart Mastra agent
      const response = await this.mastraService.processNaturalLanguage(
        text,
        userId,
        chatId.toString(),
        {
          userInfo: {
            firstName: msg.from?.first_name,
            lastName: msg.from?.last_name,
            username: msg.from?.username,
          },
          messageMetadata: {
            messageId: msg.message_id,
            timestamp: msg.date,
            chatType: msg.chat.type,
          },
        },
      );

      // Delete processing message
      if (processingMsgId) {
        try {
          await this.telegramService.deleteMessage(
            chatId,
            processingMsgId.message_id,
          );
        } catch (error) {
          // Ignore deletion errors
        }
      }

      // Check if this is a payment link creation response
      if (response.includes('✅ Payment link created!')) {
        // Extract link URL from response
        const linkUrlMatch = response.match(/🌐 (https:\/\/[^\s]+)/);
        const linkUrl = linkUrlMatch ? linkUrlMatch[1] : null;

        // Extract QR code data from response
        const qrCodeMatch = response.match(
          /\[QR_CODE\](data:image\/png;base64,[^[]+)\[\/QR_CODE\]/,
        );
        const qrCodeDataUrl = qrCodeMatch ? qrCodeMatch[1] : null;

        // Clean the response text by removing QR code data
        const cleanResponse = response.replace(
          /\n\n\[QR_CODE\][^[]+\[\/QR_CODE\]/,
          '',
        );

        if (linkUrl) {
          // Send the text response first
          await this.telegramService.sendMessage(chatId, cleanResponse);

          // Send QR code as image if available
          if (qrCodeDataUrl) {
            try {
              // Convert base64 to buffer
              const base64Data = qrCodeDataUrl.replace(
                /^data:image\/png;base64,/,
                '',
              );
              const qrCodeBuffer = Buffer.from(base64Data, 'base64');

              await this.telegramService.sendPhoto(chatId, qrCodeBuffer, {
                caption: `📱 QR Code for your payment link\n🌐 ${linkUrl}`,
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '🌐 Open Payment Page', url: linkUrl },
                      {
                        text: '📋 Copy Link',
                        callback_data: `copy_link:${linkUrl}`,
                      },
                    ],
                    [
                      { text: '💰 Balance', callback_data: 'balance' },
                      { text: '🔗 New Payment Link', callback_data: 'payment' },
                    ],
                  ],
                },
              });
            } catch (error) {
              this.logger.error('Error sending QR code image:', error);
              // Fallback to text message with buttons
              await this.telegramService.sendMessage(
                chatId,
                '🔗 Ready to share:',
                {
                  reply_markup: {
                    inline_keyboard: [
                      [
                        { text: '🌐 Open Payment Page', url: linkUrl },
                        {
                          text: '📋 Copy Link',
                          callback_data: `copy_link:${linkUrl}`,
                        },
                      ],
                      [
                        { text: '💰 Balance', callback_data: 'balance' },
                        {
                          text: '🔗 New Payment Link',
                          callback_data: 'payment',
                        },
                      ],
                    ],
                  },
                },
              );
            }
          } else {
            // No QR code, send just buttons
            await this.telegramService.sendMessage(
              chatId,
              '🔗 Ready to share:',
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      { text: '🌐 Open Payment Page', url: linkUrl },
                      {
                        text: '📋 Copy Link',
                        callback_data: `copy_link:${linkUrl}`,
                      },
                    ],
                    [
                      { text: '💰 Balance', callback_data: 'balance' },
                      { text: '🔗 New Payment Link', callback_data: 'payment' },
                    ],
                  ],
                },
              },
            );
          }
        } else {
          // Fallback to regular message
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
        }
      } else {
        // Regular response with standard buttons
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
      }
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
      const telegramId = msg.from?.id.toString();

      if (!telegramId) {
        throw new Error('telegramId is undefined');
      }

      // Check if user already has a wallet
      const exWallet = await this.walletRepository.findOne({
        userId: telegramId,
      });
      console.log(exWallet);

      const username = msg.from?.username?.toString() || telegramId;

      // Find or create user
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
        // Update last seen for existing users
        user.lastSeenAt = new Date();
        await this.userRepository.save(user);
      }

      // Handle new wallet creation
      if (!exWallet) {
        this.logger.log(
          `No existing wallet found for user ${telegramId}. Creating a new one...`,
        );

        const wallet = await this.privyService.createWallet(telegramId);
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
          privyId: wallet.privyId,
          solanaAddress: wallet.solanaAddress,
          solanaWalletId: wallet.solanaWalletId,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        this.logger.log(
          `New Privy wallet created for user ${telegramId}. Solana: ${newWallet.solanaAddress}`,
        );

        // Create associated token accounts for the wallet
        this.logger.log(`Creating token accounts for user ${telegramId}...`);
        try {
          const tokenAccountResult =
            await this.privyService.createTokenAccountsForWallet(telegramId);
          this.logger.log(
            `Token accounts created: ${tokenAccountResult.created.join(', ')}`,
          );
          if (tokenAccountResult.existing.length > 0) {
            this.logger.log(
              `Token accounts already existed: ${tokenAccountResult.existing.join(', ')}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Failed to create token accounts for user ${telegramId}:`,
            error,
          );
          // Continue anyway - token accounts can be created later if needed
        }

        // Send welcome message for NEW users
        const welcomeText =
          `🎉 <b>Welcome!</b>\n\n` +
          `Your Solana wallet is ready to use.\n\n` +
          `<b>🟣 Solana Address:</b>\n<code>${newWallet.solanaAddress}</code>\n\n` +
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
      } else {
        // Send welcome back message for EXISTING users
        const welcomeText =
          `🎉 <b>Welcome back!</b>\n\n` +
          `Your Solana wallet is ready to use.\n\n` +
          `<b>🟣 Solana Address:</b>\n<code>${exWallet.solanaAddress}</code>\n\n` +
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
      `📈 /linkstats [linkId] - View payment link transaction statistics\n` +
      `👤 /wallet - Show wallet information\n` +
      `⚙️ /settings - Bot settings and preferences\n` +
      `❓ /help - Show this help message\n\n` +
      `<b>Natural Language:</b>\n` +
      `You can also talk to me naturally! Try saying:\n` +
      `• "Show my balance"\n` +
      `• "Send 100 USDC to 0x..."\n` +
      `• "Create payment link for $50"\n` +
      `• "What are my recent transactions?"\n` +
      `• "How many transactions on my payment links?"\n` +
      `• "Track payment link transactions"\n\n` +
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
        `<b>Solana Address:</b>\n<code>${wallet.solanaAddress || 'N/A'}</code>\n\n` +
        `<b>Status:</b> ${wallet.status}\n` +
        `<b>Network:</b> Solana\n` +
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
                callback_data: `copy_address_${wallet.solanaAddress}`,
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
      if (!wallet) {
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

      if (!wallet.solanaAddress) {
        await this.telegramService.sendMessage(
          chatId,
          '❌ No Solana wallet found. Use /start to create one.',
        );
        return;
      }

      // Fetch Solana balances
      this.logger.log(
        `Starting balance fetch for Solana wallet: ${wallet.solanaAddress}`,
      );
      const [solBalance, solanaTokens] = await Promise.all([
        this.privyService.getSolanaBalance(wallet.solanaAddress),
        this.privyService.getAllSolanaTokenBalances(wallet.solanaAddress),
      ]);

      this.logger.log(`Balance fetch completed. SOL: ${solBalance.balance}`);

      let balanceText =
        `💰 <b>Your Wallet Balance</b>\n\n` +
        `<b>🟣 Solana Network:</b>\n` +
        `<b>SOL:</b> ${solBalance.balance || '0'} SOL\n`;

      // Add Solana token balances
      for (const token of solanaTokens) {
        const emoji =
          token.symbol === 'USDC'
            ? '🔵'
            : token.symbol === 'USDT'
              ? '🟢'
              : '🟡';
        const balance = parseFloat(token.balance).toFixed(6);
        balanceText += `${emoji} <b>${token.symbol}:</b> ${balance}\n`;
      }

      balanceText +=
        `\n<b>📍 Wallet Address:</b>\n` +
        `<b>Solana:</b> <code>${wallet.solanaAddress}</code>`;

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
      return;
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
      if (!wallet) {
        await this.telegramService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create a wallet.',
        );
        return;
      }

      if (!wallet.solanaAddress) {
        await this.telegramService.sendMessage(
          chatId,
          '❌ No Solana wallet found. Use /start to create one.',
        );
        return;
      }

      await this.telegramService.sendMessage(
        chatId,
        '⏳ Loading your transactions...',
      );

      const [solanaTransactions] = await Promise.all([
        this.privyService.getSolanaTransactions(wallet.solanaAddress, 5),
      ]);

      let transactionText = `📊 <b>Recent Transactions</b>\n\n`;

      // Show Solana transactions
      if (solanaTransactions.length > 0) {
        transactionText += `<b>🟣 Solana Transactions:</b>\n\n`;
        solanaTransactions.forEach((tx, index) => {
          const statusEmoji = tx.status === 'success' ? '✅' : '❌';
          const date = tx.timestamp
            ? new Date(tx.timestamp * 1000).toLocaleDateString()
            : 'N/A';
          transactionText += `${index + 1}. ${statusEmoji} ${date}\n`;
          transactionText += `   Signature: <code>${tx.signature.substring(0, 16)}...</code>\n`;
          transactionText += `   Fee: ${tx.fee} SOL\n\n`;
        });
      }

      if (solanaTransactions.length === 0) {
        transactionText += `No recent transactions found.\n\n`;
      }

      transactionText += `<b>📍 Wallet Address:</b>\n`;
      transactionText += `<b>Solana:</b> <code>${wallet.solanaAddress}</code>`;

      await this.telegramService.sendMessage(chatId, transactionText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🔄 Refresh', callback_data: 'transactions' },
              { text: '💰 Balance', callback_data: 'balance' },
            ],
            [
              {
                text: '🟣 Solana Explorer',
                url: `https://explorer.solana.com/address/${wallet.solanaAddress}?cluster=devnet`,
              },
            ],
          ],
        },
      });
      return;
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
    try {
      // Check if user has a wallet
      const wallet = await this.walletRepository.findOne({ userId });
      if (!wallet) {
        await this.telegramService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create a wallet first.',
        );
        return;
      }

      // Sending not yet implemented for Solana
      await this.telegramService.sendMessage(
        chatId,
        '⚠️ Sending tokens via command is coming soon!\n\nFor now, you can receive payments using /payment to create a payment link.',
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '💰 Balance', callback_data: 'balance' },
                { text: '🔗 Payment Link', callback_data: 'payment' },
              ],
            ],
          },
        },
      );
      return;
    } catch (error) {
      this.logger.error('Error in send command:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to process send command. Please try again.',
      );
    }
  }

  public async handlePaymentCommand(
    chatId: number,
    userId: string,
    args: string[],
  ) {
    try {
      const wallet = await this.walletRepository.findOne({ userId });
      if (!wallet) {
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

  private async handleLinkStatsCommand(
    chatId: number,
    userId: string,
    args: string[],
  ) {
    try {
      const telegramId = userId;

      if (args.length === 0) {
        // Get all payment links stats
        const response = await this.mastraService.processNaturalLanguage(
          'show me all payment link statistics',
          telegramId,
          chatId.toString(),
        );
        await this.telegramService.sendMessage(chatId, response);
      } else {
        // Get specific payment link stats
        const linkId = args[0];
        const response = await this.mastraService.processNaturalLanguage(
          `payment link stats for ${linkId}`,
          telegramId,
          chatId.toString(),
        );
        await this.telegramService.sendMessage(chatId, response);
      }
    } catch (error) {
      this.logger.error('Error in linkstats command:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to retrieve payment link statistics. Please try again.',
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
      // console.log(wallet);
      const user = await this.userRepository.findOne({ telegramId: userId });

      if (!wallet || !user) {
        throw new Error('Wallet or user not found');
      }

      // Determine the address to use (Solana for Privy wallets, legacy address for Para wallets)
      const walletAddress = wallet.solanaAddress;

      if (!walletAddress) {
        throw new Error('No valid wallet address found');
      }

      // Generate unique link ID
      const linkId = this.generateLinkId();
      const linkUrl = `https://www.obverse.cc/pay/${linkId}`;

      // Get token contract address
      const tokenAddresses = {
        USDC: '0x09Bc4E0D864854c6aFB6eB9A9cdF58ac190D0dF9',
        USDT: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956Ae',
        DAI: '0xdA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
      };

      const paymentLink = await this.paymentLinkRepository.create({
        address: walletAddress,
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

      // Send the text message first with preview image if available
      const messageText =
        `🎉 <b>Payment Link Created Successfully!</b>\n\n` +
        `<b>Name:</b> ${state.name}\n` +
        `<b>Amount:</b> ${state.amount} ${tokenEmoji} ${state.token}\n\n` +
        `<b>Payment Link:</b>\n${linkUrl}\n\n` +
        `<b>Link ID:</b> <code>${linkId}</code>\n\n` +
        `📱 <b>QR Code below for easy sharing!</b>`;

      await this.telegramService.sendMessage(chatId, messageText);

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

  private formatBalanceResponse(balanceData: any): string {
    if (!balanceData) {
      return '❌ No balance data available';
    }

    let balanceText = `💰 <b>Your Wallet Balance</b>\n\n`;

    // Native balances
    if (balanceData.nativeBalances) {
      if (balanceData.nativeBalances.ETH) {
        balanceText += `<b>🔷 ETH:</b> ${balanceData.nativeBalances.ETH.balance} ETH\n`;
      }
      if (balanceData.nativeBalances.MNT) {
        balanceText += `<b>🟢 MNT:</b> ${balanceData.nativeBalances.MNT.balance} ${balanceData.nativeBalances.MNT.symbol}\n`;
      }
    }

    // Token balances
    if (balanceData.tokenBalances && balanceData.tokenBalances.length > 0) {
      balanceText += `\n<b>🪙 Token Balances:</b>\n`;

      for (const token of balanceData.tokenBalances) {
        const emoji =
          token.symbol === 'USDC'
            ? '🔵'
            : token.symbol === 'USDT'
              ? '🟢'
              : '🟡';
        balanceText += `${emoji} <b>${token.symbol}:</b> ${token.balance}\n`;
      }
    }

    balanceText += `\n<b>📍 Wallet Address:</b>\n<code>${balanceData.walletAddress}</code>`;

    return balanceText;
  }

  // Payment Link Tracking Command Handler
  private async handlePaymentLinkTrackingCommand(
    chatId: number,
    userId: string,
  ) {
    try {
      // Set user state to asking for payment link name
      this.paymentTrackingStates.set(userId, { step: 'asking_name' });

      await this.telegramService.sendMessage(
        chatId,
        `🔍 <b>Payment Link Tracker</b>

Please enter the <b>name/title</b> of the payment link you want to track:

For example: "Coffee", "Service Payment", etc.`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Cancel', callback_data: 'cancel' }]],
          },
        },
      );
    } catch (error) {
      this.logger.error('Error in payment link tracking command:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to start payment link tracking. Please try again.',
      );
    }
  }

  // Payment Link Tracking Flow Handler
  private async handlePaymentLinkTrackingFlow(
    chatId: number,
    userId: string,
    text: string,
    state: PaymentLinkTrackingState,
  ) {
    try {
      if (state.step === 'asking_name') {
        const paymentLinkName = text.trim();

        if (!paymentLinkName) {
          await this.telegramService.sendMessage(
            chatId,
            '❌ Please enter a valid payment link name.',
          );
          return;
        }

        // Clear the state
        this.paymentTrackingStates.delete(userId);

        // Search for payment link by name
        await this.searchAndTrackPaymentLink(chatId, userId, paymentLinkName);
      }
    } catch (error) {
      this.logger.error('Error in payment link tracking flow:', error);
      this.paymentTrackingStates.delete(userId);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to process payment link tracking. Please try again.',
      );
    }
  }

  // Search and Track Payment Link
  private async searchAndTrackPaymentLink(
    chatId: number,
    userId: string,
    linkName: string,
  ) {
    try {
      // Get user's payment links matching the name
      const paymentLinks =
        await this.mastraService.getPaymentLinksRawData(userId);

      if (!paymentLinks || paymentLinks.length === 0) {
        await this.telegramService.sendMessage(
          chatId,
          `❌ <b>No Payment Links Found</b>

You haven't created any payment links yet.
Use /payment to create your first payment link!`,
        );
        return;
      }

      // Search for links matching the name (case-insensitive)
      const matchingLinks = paymentLinks.filter(
        (link) =>
          link.title &&
          link.title.toLowerCase().includes(linkName.toLowerCase()),
      );
      if (matchingLinks.length === 0) {
        await this.telegramService.sendMessage(
          chatId,
          `❌ <b>Payment Link Not Found</b>

No payment links found with name containing "<b>${linkName}</b>".

<b>Available payment links:</b>
${paymentLinks
            .slice(0, 5)
            .map((link, idx) => `${idx + 1}. ${link.title}`)
            .join('\n')}

Try using one of these names with /payment-link command.`,
        );
        return;
      }

      if (matchingLinks.length === 1) {
        // Single match found - generate tracking link
        const paymentLink = matchingLinks[0];
        const baseUrl = process.env.BASE_URL || 'https://www.obverse.cc';
        const trackingUrl = `${baseUrl}/transactions/${paymentLink.linkId}`;

        // Debug logging
        this.logger.log(`Debug tracking URL construction (message handler):`);
        this.logger.log(`- baseUrl: "${baseUrl}"`);
        this.logger.log(`- linkId: "${paymentLink.linkId}"`);
        this.logger.log(`- trackingUrl: "${trackingUrl}"`);

        await this.telegramService.sendMessage(
          chatId,
          `✅ <b>Payment Link Found!</b>

🔗 <b>Name:</b> ${paymentLink.title}
💰 <b>Amount:</b> ${paymentLink.amount} ${paymentLink.token}
📊 <b>Status:</b> ${paymentLink.status}
📈 <b>Transactions:</b> ${paymentLink.payments?.length || 0}

🔗 <b>Transaction Tracking:</b>
<a href="${trackingUrl}">${trackingUrl}</a>`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '🌐 View Transactions', url: trackingUrl },
                  {
                    text: '📊 Payment Stats',
                    callback_data: `stats:${paymentLink.linkId}`,
                  },
                ],
                [
                  { text: '💰 Balance', callback_data: 'balance' },
                  { text: '🔗 New Link', callback_data: 'payment' },
                ],
              ],
            },
          },
        );
      } else {
        // Multiple matches - let user choose
        const linkOptions = matchingLinks.slice(0, 5).map((link, idx) => [
          {
            text: `${idx + 1}. ${link.title} (${link.amount} ${link.token})`,
            callback_data: `track_link:${link.linkId}`,
          },
        ]);

        await this.telegramService.sendMessage(
          chatId,
          `🔍 <b>Multiple Links Found</b>

Found <b>${matchingLinks.length}</b> payment links matching "<b>${linkName}</b>":

Please select which one to track:`,
          {
            reply_markup: {
              inline_keyboard: [
                ...linkOptions,
                [{ text: '❌ Cancel', callback_data: 'cancel' }],
              ],
            },
          },
        );
      }
    } catch (error) {
      this.logger.error('Error searching payment links:', error);
      await this.telegramService.sendErrorMessage(
        chatId,
        'Failed to search payment links. Please try again.',
      );
    }
  }

  // Clean up tracking state
  public deletePaymentTrackingState(userId: string): void {
    this.paymentTrackingStates.delete(userId);
  }
}
