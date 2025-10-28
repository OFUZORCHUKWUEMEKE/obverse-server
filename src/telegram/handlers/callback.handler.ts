import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import TelegramBot from 'node-telegram-bot-api';
import { TelegramService } from '../telegram.service';
import { ParaService } from 'src/para/para.service';
import { PrivyService } from 'src/para/privy.service';
import { MessageHandler } from './mesage-handler';
import { PaymentLinkRepository } from 'src/payment-link/payment-repository';
import { Types } from 'mongoose';
import { WalletRepository } from 'src/wallet/wallet.repository';
import { MastraService } from 'src/mastra/mastra.service';

@Injectable()
export class CallbackHandler {
  private readonly logger = new Logger(CallbackHandler.name);

  constructor(
    @Inject(forwardRef(() => TelegramService))
    private telegramBotService: TelegramService,
    private paraService: ParaService,
    private privyService: PrivyService,
    @Inject(forwardRef(() => MessageHandler))
    private messageHandler: MessageHandler,
    private paymentLinkRepository: PaymentLinkRepository,
    private walletRepository: WalletRepository,
    private mastraService: MastraService,
  ) {}

  async handleCallback(callbackQuery: TelegramBot.CallbackQuery) {
    const chatId = callbackQuery.message?.chat.id;
    const userId = callbackQuery.from.id.toString();
    const data = callbackQuery.data;

    if (!chatId || !data) return;

    this.logger.log(`Callback from user ${userId}: ${data}`);

    // Answer the callback query first
    await this.telegramBotService.answerCallbackQuery(callbackQuery.id);

    // Handle different callback actions
    switch (data) {
      case 'balance':
        await this.handleBalanceCallback(chatId, userId);
        break;
      case 'transactions':
        await this.handleTransactionsCallback(chatId, userId);
        break;
      case 'send':
        await this.handleSendCallback(chatId, userId);
        break;
      case 'payment':
        await this.handlePaymentCallback(chatId, userId);
        break;
      case 'settings_notifications':
        await this.handleNotificationSettings(chatId, userId);
        break;
      case 'settings_token':
        await this.handleTokenSettings(chatId, userId);
        break;
      case 'settings_language':
        await this.handleLanguageSettings(chatId, userId);
        break;
      case 'settings_security':
        await this.handleSecuritySettings(chatId, userId);
        break;
      default:
        if (data.startsWith('copy_address_')) {
          const address = data.replace('copy_address_', '');
          await this.handleCopyAddress(chatId, address);
        } else if (data.startsWith('copy_link_')) {
          const linkId = data.replace('copy_link_', '');
          await this.handleCopyLink(chatId, linkId);
        } else if (data.startsWith('view_payment_')) {
          const paymentId = data.replace('view_payment_', '');
          await this.handleViewPaymentDetails(chatId, paymentId);
        } else if (data.startsWith('track_link:')) {
          const linkId = data.replace('track_link:', '');
          await this.handleTrackLinkCallback(chatId, userId, linkId);
        } else if (data.startsWith('payment_token_')) {
          const token = data.replace('payment_token_', '');
          await this.handlePaymentTokenCallback(chatId, userId, token);
        } else if (data === 'payment_confirm_yes') {
          await this.handlePaymentConfirmYes(chatId, userId);
        } else if (data === 'payment_confirm_no') {
          await this.handlePaymentConfirmNo(chatId, userId);
        } else if (data === 'create_payment') {
          await this.handleCreatePaymentCallback(chatId, userId);
        } else if (data.startsWith('confirm_send_')) {
          await this.handleConfirmTransfer(chatId, userId, data);
        } else if (data === 'cancel_send') {
          await this.handleCancelTransfer(chatId, userId);
        } else {
          await this.telegramBotService.sendMessage(
            chatId,
            '❓ Unknown action.',
          );
        }
    }
  }

  private async handleBalanceCallback(chatId: number, userId: string) {
    try {
      const wallet = await this.walletRepository.findOne({ userId });
      if (!wallet) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create a wallet.',
        );
        return;
      }

      if (!wallet.solanaAddress) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ No Solana wallet found. Use /start to create one.',
        );
        return;
      }

      await this.telegramBotService.sendMessage(
        chatId,
        '⏳ Fetching your balances...',
      );

      this.logger.log(`Fetching balances for Solana wallet: ${wallet.solanaAddress}`);

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
        const emoji = token.symbol === 'USDC' ? '🔵' : token.symbol === 'USDT' ? '🟢' : '🟡';
        const balance = parseFloat(token.balance).toFixed(6);
        balanceText += `${emoji} <b>${token.symbol}:</b> ${balance}\n`;
      }

      balanceText +=
        `\n<b>📍 Wallet Address:</b>\n` +
        `<b>Solana:</b> <code>${wallet.solanaAddress}</code>`;

      await this.telegramBotService.sendMessage(chatId, balanceText, {
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
      this.logger.error('Error in balance callback:', error);
      await this.telegramBotService.sendMessage(
        chatId,
        '❌ Failed to fetch balance. Please try again later.',
      );
    }
  }

  private async handleTransactionsCallback(chatId: number, userId: string) {
    try {
      const wallet = await this.walletRepository.findOne({ userId });
      if (!wallet) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create a wallet.',
        );
        return;
      }

      if (!wallet.solanaAddress) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ No Solana wallet found. Use /start to create one.',
        );
        return;
      }

      await this.telegramBotService.sendMessage(
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
          const date = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleDateString() : 'N/A';
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

      await this.telegramBotService.sendMessage(chatId, transactionText, {
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
    } catch (error) {
      this.logger.error('Error in transactions callback:', error);
      await this.telegramBotService.sendMessage(
        chatId,
        '❌ Failed to fetch transactions. Please try again later.',
      );
    }
  }

  private async handleSendCallback(chatId: number, userId: string) {
    await this.telegramBotService.sendMessage(
      chatId,
      `💸 <b>Send Tokens</b>\n\n` +
        `<b>Usage:</b> <code>/send &lt;amount&gt; &lt;token&gt; &lt;address&gt; [memo]</code>\n\n` +
        `<b>Examples:</b>\n` +
        `• <code>/send 10 USDC 0x123...abc</code>\n` +
        `• <code>/send 0.5 MNT 0x456...def Payment for coffee</code>\n` +
        `• <code>/send 100 USDT 0x789...ghi Monthly subscription</code>\n\n` +
        `<b>Supported tokens:</b> MNT, USDC, USDT, DAI\n\n` +
        `<i>Note: The address must be a valid Ethereum address</i>`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Check Balance First', callback_data: 'balance' },
              { text: '📊 View Transactions', callback_data: 'transactions' },
            ],
          ],
        },
      },
    );
  }

  private async handlePaymentCallback(chatId: number, userId: string) {
    try {
      const wallet = await this.walletRepository.findOne({ userId });
      if (!wallet) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ No wallet found. Use /start to create a wallet.',
        );
        return;
      }

      // Start payment link creation flow
      await this.messageHandler.handlePaymentCommand(chatId, userId, []);
    } catch (error) {
      this.logger.error('Error in payment callback:', error);
      await this.telegramBotService.sendMessage(
        chatId,
        '❌ Failed to start payment link creation. Please try again.',
      );
    }
  }

  private async handleCopyAddress(chatId: number, address: string) {
    await this.telegramBotService.sendMessage(
      chatId,
      `📋 <b>Wallet Address</b>\n\n<code>${address}</code>\n\n` +
        `<i>Tap to copy the address above</i>`,
    );
  }

  private async handleCopyLink(chatId: number, linkId: string) {
    try {
      const paymentLink = await this.paymentLinkRepository.findOne({ linkId });

      if (!paymentLink) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ Payment link not found.',
        );
        return;
      }

      await this.telegramBotService.sendMessage(
        chatId,
        `📋 <b>Payment Link</b>\n\n<code>${paymentLink.linkUrl}</code>\n\n` +
          `<i>Tap to copy the link above, or use the button below to open it.</i>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌐 Open Link', url: paymentLink.linkUrl }],
            ],
          },
        },
      );
    } catch (error) {
      this.logger.error('Error handling copy link:', error);
      await this.telegramBotService.sendMessage(
        chatId,
        '❌ Error retrieving payment link. Please try again.',
      );
    }
  }

  private async handleViewPaymentDetails(chatId: number, paymentId: string) {
    try {
      const paymentLink = await this.paymentLinkRepository.findOne({
        _id: new Types.ObjectId(paymentId),
      });

      if (!paymentLink) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ Payment link not found.',
        );
        return;
      }

      // Get token emoji
      const tokenEmoji =
        paymentLink.token === 'USDC'
          ? '🔵'
          : paymentLink.token === 'USDT'
            ? '🟢'
            : '🟡';

      // Format status with emoji
      const statusEmoji =
        paymentLink.status === 'active'
          ? '🟢'
          : paymentLink.status === 'completed'
            ? '✅'
            : paymentLink.status === 'expired'
              ? '⏰'
              : '🔴';

      // Build details list
      const detailsList =
        paymentLink.details && Object.keys(paymentLink.details).length > 0
          ? Object.keys(paymentLink.details)
              .map((field, index) => `  ${index + 1}. ${field}`)
              .join('\n')
          : '  No details to collect';

      // Format payment info
      const paymentCount = paymentLink.payments?.length || 0;
      const totalReceived = paymentLink.totalAmountReceived || '0';

      let detailsText =
        `📊 <b>Payment Link Details</b>\n\n` +
        `<b>Name:</b> ${paymentLink.title}\n` +
        `<b>Amount:</b> ${paymentLink.amount} ${tokenEmoji} ${paymentLink.token}\n` +
        `<b>Status:</b> ${statusEmoji} ${paymentLink.status}\n` +
        `<b>Network:</b> ${paymentLink.network}\n\n` +
        `<b>Customer Details to Collect:</b>\n${detailsList}\n\n` +
        `<b>Statistics:</b>\n` +
        `• Views: ${paymentLink.viewCount || 0}\n` +
        `• Payments: ${paymentCount}\n` +
        `• Total Received: ${totalReceived} ${paymentLink.token}\n` +
        `• Uses: ${paymentLink.currentUses}/${paymentLink.maxUses === -1 ? '∞' : paymentLink.maxUses}\n\n` +
        `<b>Link ID:</b> <code>${paymentLink.linkId}</code>\n` +
        `<b>Created:</b> ${paymentLink.createdAt?.toLocaleDateString()}\n`;

      if (paymentLink.expiresAt) {
        detailsText += `<b>Expires:</b> ${paymentLink.expiresAt.toLocaleDateString()}\n`;
      }

      await this.telegramBotService.sendMessage(chatId, detailsText, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🌐 Open Link', url: paymentLink.linkUrl },
              {
                text: '📋 Copy Link',
                callback_data: `copy_link_${paymentLink.linkId}`,
              },
            ],
            [{ text: '🔗 Create New Link', callback_data: 'create_payment' }],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Error viewing payment details:', error);
      await this.telegramBotService.sendMessage(
        chatId,
        '❌ Error retrieving payment link details. Please try again.',
      );
    }
  }

  private async handleNotificationSettings(chatId: number, userId: string) {
    await this.telegramBotService.sendMessage(
      chatId,
      '🔔 <b>Notification Settings</b>\n\nComing soon!',
    );
  }

  private async handleTokenSettings(chatId: number, userId: string) {
    await this.telegramBotService.sendMessage(
      chatId,
      '💱 <b>Default Token Settings</b>\n\nComing soon!',
    );
  }

  private async handleLanguageSettings(chatId: number, userId: string) {
    await this.telegramBotService.sendMessage(
      chatId,
      '🌐 <b>Language Settings</b>\n\nComing soon!',
    );
  }

  private async handleSecuritySettings(chatId: number, userId: string) {
    await this.telegramBotService.sendMessage(
      chatId,
      '🔐 <b>Security Settings</b>\n\nComing soon!',
    );
  }

  private async handlePaymentTokenCallback(
    chatId: number,
    userId: string,
    token: string,
  ) {
    // Get the payment state and continue the flow
    const paymentState = this.messageHandler.getPaymentCreationState(userId);
    if (paymentState && paymentState.step === 'token') {
      await this.messageHandler.handlePaymentCreationFlow(
        chatId,
        userId,
        token,
        paymentState,
      );
    } else {
      await this.telegramBotService.sendMessage(
        chatId,
        '❌ Payment creation session expired. Please start again with /payment.',
      );
    }
  }

  private async handlePaymentConfirmYes(chatId: number, userId: string) {
    const paymentState = this.messageHandler.getPaymentCreationState(userId);
    if (paymentState && paymentState.step === 'confirm') {
      await this.messageHandler.createPaymentLink(chatId, userId, paymentState);
    } else {
      await this.telegramBotService.sendMessage(
        chatId,
        '❌ Payment creation session expired. Please start again with /payment.',
      );
    }
  }

  private async handlePaymentConfirmNo(chatId: number, userId: string) {
    this.messageHandler.deletePaymentCreationState(userId);
    await this.telegramBotService.sendMessage(
      chatId,
      '❌ Payment link creation cancelled.',
    );
  }

  private async handleCreatePaymentCallback(chatId: number, userId: string) {
    // Start new payment creation flow
    await this.messageHandler.handlePaymentCommand(chatId, userId, []);
  }

  private async handleConfirmTransfer(
    chatId: number,
    userId: string,
    data: string,
  ) {
    try {
      // Parse callback data: confirm_send_<amount>_<token>_<address>_<memo>
      const parts = data.replace('confirm_send_', '').split('_');

      if (parts.length < 3) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ Invalid transfer data. Please try again.',
        );
        return;
      }

      const amount = parts[0];
      const token = parts[1];
      const toAddress = parts[2];
      const memo = parts[3] ? decodeURIComponent(parts[3]) : '';

      // Send processing message
      await this.telegramBotService.sendMessage(
        chatId,
        `⏳ <b>Processing Transfer...</b>\n\n` +
          `💸 Sending ${amount} ${token} to <code>${toAddress}</code>\n\n` +
          `⚠️ Please wait, this may take a few moments...`,
      );

      // Execute the transfer using Mastra service
      const result = await this.mastraService.sendTokens(
        userId,
        toAddress,
        amount,
        token as 'MNT' | 'USDC' | 'USDT' | 'DAI',
        memo,
      );

      // Send the result
      await this.telegramBotService.sendMessage(chatId, result, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: 'balance' },
              { text: '📊 Transactions', callback_data: 'transactions' },
            ],
            [{ text: '💸 Send Again', callback_data: 'send' }],
          ],
        },
      });
    } catch (error) {
      this.logger.error('Error handling transfer confirmation:', error);

      await this.telegramBotService.sendMessage(
        chatId,
        `❌ <b>Transfer Failed</b>\n\n` +
          `An error occurred while processing your transfer. Please try again later.\n\n` +
          `Error: ${error.message}`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '💰 Check Balance', callback_data: 'balance' },
                { text: '🔄 Try Again', callback_data: 'send' },
              ],
            ],
          },
        },
      );
    }
  }

  private async handleCancelTransfer(chatId: number, userId: string) {
    await this.telegramBotService.sendMessage(
      chatId,
      '❌ Transfer cancelled.\n\nNo tokens were sent.',
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '💰 Check Balance', callback_data: 'balance' },
              { text: '💸 Send Tokens', callback_data: 'send' },
            ],
          ],
        },
      },
    );
  }

  private async handleTrackLinkCallback(
    chatId: number,
    userId: string,
    linkId: string,
  ) {
    try {
      // Get the payment link by ID
      const paymentLinks =
        await this.mastraService.getPaymentLinksRawData(userId);

      if (!paymentLinks || paymentLinks.length === 0) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ No payment links found.',
        );
        return;
      }

      // Find the specific payment link
      const paymentLink = paymentLinks.find((link) => link.linkId === linkId);

      if (!paymentLink) {
        await this.telegramBotService.sendMessage(
          chatId,
          '❌ Payment link not found.',
        );
        return;
      }

      // Generate tracking URL
      const baseUrl = process.env.BASE_URL || 'https://www.obverse.cc';
      const trackingUrl = `${baseUrl}/transactions/${paymentLink.linkId}`;

      // Debug logging
      this.logger.log(`Debug tracking URL construction:`);
      this.logger.log(`- baseUrl: "${baseUrl}"`);
      this.logger.log(`- linkId: "${paymentLink.linkId}"`);
      this.logger.log(`- trackingUrl: "${trackingUrl}"`);
      this.logger.log(`- trackingUrl length: ${trackingUrl.length}`);

      await this.telegramBotService.sendMessage(
        chatId,
        `✅ <b>Payment Link Tracking</b>

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
    } catch (error) {
      this.logger.error('Error in track link callback:', error);
      await this.telegramBotService.sendMessage(
        chatId,
        '❌ Failed to get payment link details. Please try again.',
      );
    }
  }
}
