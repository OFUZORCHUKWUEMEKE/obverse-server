import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { createBalanceTool } from '../tools/balance-tool';
import { createPaymentLinkTool } from '../tools/payment-link-tool';
import { createPaymentLinkInfoTool } from '../tools/payment-link-info-tool';
import { createPaymentTrackingTool } from '../tools/payment-tracking-tool';
import { createTransferTool } from '../tools/transfer-tool';
import { formatPaymentTrackingReport } from '../utils/payment-report-formatter';

export class TelegramCryptoAgent {
  private balanceTool: any;
  private paymentLinkTool: any;
  private paymentLinkInfoTool: any;
  private paymentTrackingTool: any;
  private transferTool: any;
  private conversationMemory: Map<
    string,
    Array<{ role: string; content: string; timestamp: number }>
  > = new Map();
  private paymentLinkRepository: any;
  private transactionRepository: any;
  private userRepository: any;
  private model: any;

  /**
   * Construct a TelegramCryptoAgent instance, which contains the necessary tool instances
   * and the Anthropic AI model.
   *
   * @param walletService Wallet service to interact with wallet data
   * @param paraService Para service to interact with Para data
   * @param paymentLinkRepository Payment link repository to interact with payment link data
   * @param walletRepository Wallet repository to interact with wallet data
   * @param userRepository User repository to interact with user data
   * @param transactionRepository Transaction repository to interact with transaction data (optional)
   */
  constructor(
    walletService: any,
    paraService: any,
    paymentLinkRepository: any,
    walletRepository: any,
    userRepository: any,
    transactionRepository?: any,
  ) {
    this.paymentLinkRepository = paymentLinkRepository;
    this.transactionRepository = transactionRepository;
    this.userRepository = userRepository;

    // Create tools
    this.balanceTool = createBalanceTool(walletService, paraService);
    this.paymentLinkTool = createPaymentLinkTool(
      paymentLinkRepository,
      walletRepository,
      userRepository,
    );
    this.paymentLinkInfoTool = createPaymentLinkInfoTool(
      paymentLinkRepository,
      userRepository,
    );
    this.paymentTrackingTool = createPaymentTrackingTool(
      paymentLinkRepository,
      userRepository,
    );
    this.transferTool = createTransferTool(
      walletRepository,
      userRepository,
      transactionRepository,
      paraService,
    );

    // Store the Anthropic model for direct use - using model compatible with AI SDK v5
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.model = anthropic('claude-3-5-sonnet-20241022');
  }

  async processMessage(
    message: string,
    telegramUserId: string,
    telegramChatId: string,
    context?: any,
  ): Promise<string> {
    try {
      // Store conversation in memory
      this.addToConversationMemory(telegramUserId, 'user', message);

      // Get conversation history for context
      const conversationHistory = this.getConversationMemory(telegramUserId);

      // Prepare messages for the AI model
      const messages = [
        {
          role: 'system' as const,
          content: `You are a crypto wallet assistant. ALWAYS use the provided tools for user requests. Be very brief.

IMPORTANT: 
- For balance checks: ALWAYS use create_balance tool with telegramUserId
- For payment links: ALWAYS use create_payment_links tool
- For payment link info: ALWAYS use get_payment_link_info tool with telegramUserId and linkId
- For payment tracking: ALWAYS use track_payments tool with telegramUserId for analytics
- For transfers: Guide users to /send command
- NEVER generate fake data - only use tool results

Keep responses under 30 words. Use tools first, then respond with results.

User ID: ${telegramUserId}`,
        },
        // Add conversation history
        ...conversationHistory.slice(-4).map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: message,
        },
      ];

      // Check if this is a balance request and handle it directly
      const lowerMessage = message.toLowerCase();
      if (
        lowerMessage.includes('balance') ||
        lowerMessage.includes('check my') ||
        lowerMessage.includes('wallet')
      ) {
        console.log('Detected balance request, using balance tool directly');
        const balanceResult = await this.executeBalanceCheck(telegramUserId);
        if (balanceResult.success) {
          return this.formatBalanceForChat(balanceResult.data);
        } else {
          return `❌ ${balanceResult.error}`;
        }
      }

      // Check for payment tracking request first
      const paymentTrackingMatch =
        lowerMessage.match(/(?:track|monitor|analytics?).*payment/i) ||
        lowerMessage.match(/payment.*(?:track|monitor|analytics?)/i) ||
        lowerMessage.match(/(?:payment|link).*(?:stats|statistics|metrics)/i) ||
        lowerMessage.match(
          /(?:show|get).*payment.*(?:data|analytics?|tracking)/i,
        );

      if (paymentTrackingMatch && !lowerMessage.match(/([a-zA-Z0-9]{8})/)) {
        console.log('Detected payment tracking request');

        try {
          const trackingResult =
            await this.executePaymentTracking(telegramUserId);

          if (trackingResult.success) {
            const data = trackingResult.data;
            return formatPaymentTrackingReport(data);
          } else {
            return `❌ ${trackingResult.error}`;
          }
        } catch (error) {
          console.error('Error getting payment tracking:', error);
          return `❌ Error retrieving payment analytics: ${error.message}`;
        }
      }

      // Check for payment link info request
      const paymentLinkInfoMatch =
        lowerMessage.match(
          /(?:payment.*link.*info|link.*info|info.*link).*?([a-zA-Z0-9]{8})/i,
        ) ||
        lowerMessage.match(
          /(?:get|show|check).*(?:payment.*link|link).*?([a-zA-Z0-9]{8})/i,
        ) ||
        lowerMessage.match(/([a-zA-Z0-9]{8}).*(?:info|stats|details)/i);

      if (paymentLinkInfoMatch) {
        console.log('Detected payment link info request');
        const linkId = paymentLinkInfoMatch[1];

        try {
          const linkInfoResult = await this.executePaymentLinkInfo(
            telegramUserId,
            linkId,
          );

          if (linkInfoResult.success) {
            const data = linkInfoResult.data;
            const statusEmoji = data.status === 'active' ? '🟢' : '🔴';
            const tokenEmoji = this.getTokenEmoji(data.token);

            let response = `📊 Payment Link Info\n\n`;
            response += `🔗 ${data.title}\n`;
            response += `🆔 \`${data.linkId}\`\n`;
            response += `${statusEmoji} Status: ${data.status}\n`;
            response += `${tokenEmoji} ${data.amount} ${data.token}\n`;
            response += `🌐 ${data.linkUrl}\n\n`;

            response += `📈 Statistics:\n`;
            response += `• Transactions: ${data.statistics.totalTransactions}\n`;
            response += `• Total Received: ${data.statistics.totalAmountReceived} ${data.token}\n`;
            response += `• Views: ${data.statistics.viewCount}\n`;
            response += `• Conversion: ${data.statistics.conversionRate}%\n\n`;

            if (data.recentTransactions.length > 0) {
              response += `💸 Recent Transactions:\n`;
              data.recentTransactions.slice(-3).forEach((tx, index) => {
                const date = new Date(tx.paidAt).toLocaleDateString();
                const shortAddress = `${tx.payerAddress.slice(0, 6)}...${tx.payerAddress.slice(-4)}`;
                response += `${index + 1}. ${tx.amount} ${data.token} from ${shortAddress} (${date})\n`;
              });
            } else {
              response += `📝 No transactions yet`;
            }

            return response;
          } else {
            return `❌ ${linkInfoResult.error}`;
          }
        } catch (error) {
          console.error('Error getting payment link info:', error);
          return `❌ Error retrieving payment link info: ${error.message}`;
        }
      }

      // Check for complete payment link request with details
      const paymentLinkMatch =
        lowerMessage.match(
          /create.*payment.*link.*for\s+(.+?)\s+\$?(\d+\.?\d*)\s+(usdc|usdt|dai)(?:\s+collect\s+(.+))?$/i,
        ) ||
        lowerMessage.match(
          /payment.*link.*(.+?)\s+\$?(\d+\.?\d*)\s+(usdc|usdt|dai)(?:\s+collect\s+(.+))?$/i,
        ) ||
        lowerMessage.match(
          /create.*link.*(.+?)\s+\$?(\d+\.?\d*)\s+(usdc|usdt|dai)(?:\s+collect\s+(.+))?$/i,
        );

      if (paymentLinkMatch) {
        console.log(
          'Detected complete payment link request, using tool directly',
        );
        console.log('Full regex match:', paymentLinkMatch);
        const [, name, amount, token, collectFields] = paymentLinkMatch;

        // Parse collection fields if provided
        const details = {};
        if (collectFields) {
          console.log('Raw collectFields:', collectFields);
          const fields = collectFields.split(',').map((f) => f.trim());
          console.log('Parsed fields:', fields);
          fields.forEach((field) => {
            details[field] = `Enter your ${field}`;
          });
          console.log('Details object:', details);
        } else {
          console.log('No collectFields found');
        }

        console.log('Parsed details:', {
          name: name.trim(),
          amount: amount.trim(),
          token: token.toUpperCase(),
          details,
        });

        try {
          console.log('=== CALLING REAL PAYMENT LINK TOOL ===');
          console.log('Using createPaymentLinkTool - NOT creating dummy link');

          const paymentResult = await this.executePaymentLinkCreation(
            telegramUserId,
            telegramChatId,
            name.trim(),
            token.toUpperCase() as 'USDC' | 'USDT' | 'DAI',
            amount.trim(),
            Object.keys(details).length > 0 ? details : undefined,
          );
          console.log('=== REAL PAYMENT LINK TOOL RESULT ===');
          console.log('Payment link creation result:', paymentResult);

          if (paymentResult.success) {
            let response = `✅ Payment link created!

🔗 ${paymentResult.data.name}
💰 ${paymentResult.data.amount} ${paymentResult.data.token}
🌐 ${paymentResult.data.linkUrl}`;

            if (
              paymentResult.data.details &&
              Object.keys(paymentResult.data.details).length > 0
            ) {
              response += `\n📋 Collecting: ${Object.keys(paymentResult.data.details).join(', ')}`;
            }

            response += `\n\n📱 QR Code and payment page ready!
💬 Share this link to receive payments!`;

            // Include QR code data in a special format for the message handler
            if (paymentResult.data.qrCodeDataUrl) {
              response += `\n\n[QR_CODE]${paymentResult.data.qrCodeDataUrl}[/QR_CODE]`;
            }

            return response;
          } else {
            return `❌ ${paymentResult.error}`;
          }
        } catch (error) {
          console.error('Error in payment link creation:', error);
          return `❌ Error creating payment link: ${error.message}`;
        }
      }

      // Check if this is a general payment link request without complete details
      if (
        (lowerMessage.includes('payment link') ||
          lowerMessage.includes('create link')) &&
        !lowerMessage.match(/\$?\d+\.?\d*\s+(usdc|usdt|dai)/i)
      ) {
        console.log(
          'Detected general payment link request, asking for details',
        );
        return `To create a payment link, I need:
• Name/title for the payment
• Token (USDC, USDT, or DAI) 
• Amount
• Payment details to collect from payers (optional)

Example: "Create payment link for Coffee $5 USDC collect email,phone"
Or: "Create payment link for Service $10 USDT collect name,address,notes"`;
      }

      // Use AI SDK v5 approach for other requests
      console.log(
        'Sending message to Claude with',
        messages.length,
        'messages',
      );
      const result = await generateText({
        model: this.model,
        messages,
        temperature: 0.7,
      });

      console.log('Claude response received:', result.text?.substring(0, 100));
      console.log('Tool calls made:', result.toolCalls?.length || 0);
      console.log('Tool results:', result.toolResults?.length || 0);

      // Get the final response text, which includes tool results
      const response =
        result.text ||
        'I apologize, but I encountered an issue processing your request.';

      // Store assistant response in memory
      this.addToConversationMemory(telegramUserId, 'assistant', response);

      return response;
    } catch (error) {
      console.error('Error processing message with AI:', error);
      // Fallback to simple error message
      const fallbackResponse = this.handleError(
        telegramUserId,
        error,
        'unknown',
      );
      this.addToConversationMemory(
        telegramUserId,
        'assistant',
        fallbackResponse,
      );
      return fallbackResponse;
    }
  }

  private handleError(
    _userId: string,
    _error: any,
    intentType: string,
  ): string {
    const errorContext = {
      balance_check: {
        message: 'checking your balance',
        suggestions: [
          'Try /balance command',
          'Check if wallet is set up with /wallet',
          'Contact support',
        ],
      },
      send_tokens: {
        message: 'processing your transfer',
        suggestions: [
          'Use /send command for secure transfers',
          'Check your balance first',
          'Verify recipient address',
        ],
      },
      payment_link: {
        message: 'creating your payment link',
        suggestions: [
          'Try /payment command',
          'Check your wallet setup',
          'Try again in a moment',
        ],
      },
    };

    const context = errorContext[intentType] || {
      message: 'processing your request',
      suggestions: ['Try using specific commands', 'Type /help for assistance'],
    };

    return `❌ Something went wrong while ${context.message}.\n\n🔧 **Try these solutions:**\n${context.suggestions.map((s: string, i: number) => `${i + 1}️⃣ ${s}`).join('\n')}\n\n💡 If the problem persists, the issue might be temporary. Please try again in a few minutes.`;
  }

  private addToConversationMemory(
    userId: string,
    role: 'user' | 'assistant',
    content: string,
  ): void {
    if (!this.conversationMemory.has(userId)) {
      this.conversationMemory.set(userId, []);
    }

    const conversation = this.conversationMemory.get(userId)!;
    conversation.push({
      role,
      content,
      timestamp: Date.now(),
    });

    // Keep only last 10 messages to prevent memory bloat
    if (conversation.length > 10) {
      conversation.splice(0, conversation.length - 10);
    }
  }

  private getConversationMemory(
    userId: string,
  ): Array<{ role: string; content: string; timestamp: number }> {
    return this.conversationMemory.get(userId) || [];
  }

  async checkBalance(
    telegramUserId: string,
    tokens?: string[],
  ): Promise<string> {
    try {
      const balanceResult = await this.executeBalanceCheck(
        telegramUserId,
        undefined,
        tokens,
      );
      if (balanceResult.success) {
        return this.formatBalanceForChat(balanceResult.data);
      } else {
        return `❌ Unable to check balance: ${balanceResult.error}`;
      }
    } catch (error) {
      return '❌ Error checking your balance. Please try again.';
    }
  }

  async createPaymentLink(
    telegramUserId: string,
    telegramChatId: string,
    params: {
      name: string;
      token: 'USDC' | 'USDT' | 'DAI';
      amount: string;
      details?: { [key: string]: string };
    },
  ): Promise<string> {
    try {
      const paymentResult = await this.executePaymentLinkCreation(
        telegramUserId,
        telegramChatId,
        params.name,
        params.token,
        params.amount,
        params.details,
      );

      if (paymentResult.success) {
        const data = paymentResult.data;
        return `🎉 Payment link created successfully!\n\n🔗 **${data.name}**\nAmount: ${data.amount} ${data.token}\nLink: ${data.linkUrl}\n\nShare this link to receive payments!`;
      } else {
        return `❌ Failed to create payment link: ${paymentResult.error}`;
      }
    } catch (error) {
      return '❌ Error creating payment link. Please try again.';
    }
  }

  private formatBalanceForChat(balanceData: any): string {
    if (!balanceData) {
      return '❌ No balance data available';
    }

    let balanceText = `💰 Your Wallet Balance\n\n`;

    // Native balances
    if (balanceData.nativeBalances) {
      if (balanceData.nativeBalances.ETH) {
        balanceText += `🔷 ETH: ${balanceData.nativeBalances.ETH.balance} ETH\n`;
      }
      if (balanceData.nativeBalances.MNT) {
        balanceText += `🟢 MNT: ${balanceData.nativeBalances.MNT.balance} ${balanceData.nativeBalances.MNT.symbol}\n`;
      }
    }

    // Token balances
    if (balanceData.tokenBalances && balanceData.tokenBalances.length > 0) {
      balanceText += `\n🪙 Token Balances:\n`;

      for (const token of balanceData.tokenBalances) {
        const emoji =
          token.symbol === 'USDC'
            ? '🔵'
            : token.symbol === 'USDT'
              ? '🟢'
              : '🟡';
        balanceText += `${emoji} ${token.symbol}: ${token.balance}\n`;
      }
    }

    balanceText += `\n📍 Wallet: \`${balanceData.walletAddress}\``;

    return balanceText;
  }

  // Direct tool access methods
  async executeBalanceCheck(
    telegramUserId: string,
    walletAddress?: string,
    tokens?: string[],
  ) {
    try {
      return await this.balanceTool.execute({
        telegramUserId,
        walletAddress,
        tokens,
      });
    } catch (error) {
      console.error('Error executing balance check:', error);
      throw error;
    }
  }

  async executePaymentLinkInfo(telegramUserId: string, linkId: string) {
    try {
      return await this.paymentLinkInfoTool.execute({
        telegramUserId,
        linkId,
      });
    } catch (error) {
      console.error('Error executing payment link info:', error);
      throw error;
    }
  }

  async executePaymentTracking(
    telegramUserId: string,
    linkId?: string,
    timeframe?: '24h' | '7d' | '30d' | '90d' | 'all',
    includeTransactions?: boolean,
    limit?: number,
  ) {
    try {
      return await this.paymentTrackingTool.execute({
        telegramUserId,
        linkId,
        timeframe: timeframe || '30d',
        includeTransactions: includeTransactions !== false,
        limit: limit || 10,
      });
    } catch (error) {
      console.error('Error executing payment tracking:', error);
      throw error;
    }
  }

  async executePaymentLinkCreation(
    telegramUserId: string,
    telegramChatId: string,
    name: string,
    token: 'USDC' | 'USDT' | 'DAI',
    amount: string,
    details?: { [key: string]: string },
  ) {
    try {
      console.log('=== EXECUTING REAL createPaymentLinkTool ===');
      console.log('Tool ID:', this.paymentLinkTool.id);
      console.log('Tool Description:', this.paymentLinkTool.description);
      console.log('Executing payment link tool with params:', {
        telegramUserId,
        telegramChatId,
        name,
        token,
        amount,
        details,
        type: 'ONE_TIME',
      });

      console.log('=== CALLING this.paymentLinkTool.execute() ===');
      const result = await this.paymentLinkTool.execute({
        telegramUserId,
        telegramChatId,
        name,
        token,
        amount,
        details,
        type: 'ONE_TIME',
      });

      console.log('=== RAW TOOL EXECUTION RESULT ===');
      console.log('Payment link tool result:', result);

      if (result && result.data && result.data.linkUrl) {
        console.log('✅ REAL PAYMENT LINK CREATED:', result.data.linkUrl);
      } else {
        console.log('❌ NO VALID LINK URL IN RESULT');
      }

      return result;
    } catch (error) {
      console.error('Error executing payment link creation:', error);
      throw error;
    }
  }

  async executeTransfer(
    telegramUserId: string,
    toAddress: string,
    amount: string,
    token: 'MNT' | 'USDC' | 'USDT' | 'DAI',
    memo?: string,
  ) {
    try {
      return await this.transferTool.execute({
        telegramUserId,
        toAddress,
        amount,
        token,
        memo,
      });
    } catch (error) {
      console.error('Error executing transfer:', error);
      throw error;
    }
  }

  async sendTokens(
    telegramUserId: string,
    toAddress: string,
    amount: string,
    token: 'MNT' | 'USDC' | 'USDT' | 'DAI',
    memo?: string,
  ): Promise<string> {
    try {
      const transferResult = await this.executeTransfer(
        telegramUserId,
        toAddress,
        amount,
        token,
        memo,
      );

      if (transferResult.success) {
        const data = transferResult.data;
        return `✅ Transfer Successful!**\n\n💸 Sent: ${data.amount} ${data.token}\n📍 To: \`${data.toAddress}\`\n📊 Transaction: \`${data.transactionHash}\`\n\n🔗 [View on Explorer](${data.confirmationUrl})`;
      } else {
        return `❌ Transfer failed: ${transferResult.error}`;
      }
    } catch (error) {
      return '❌ Error processing transfer. Please try again.';
    }
  }

  async getPaymentLinkTransactionCount(
    linkId: string,
    telegramUserId: string,
  ): Promise<string> {
    try {
      // Find the payment link
      const paymentLink = await this.paymentLinkRepository.findOne({ linkId });

      if (!paymentLink) {
        return `❌ Payment link with ID "${linkId}" not found.\n\n💡 Make sure you're using the correct link ID from your payment links.`;
      }

      // Check if the user owns this payment link
      const user = await this.paymentLinkRepository.findOne({
        linkId,
        creatorUserId: await this.getUserObjectId(telegramUserId),
      });

      if (!user) {
        return `❌ You don't have access to payment link "${linkId}".\n\n💡 You can only view statistics for your own payment links.`;
      }

      const totalTransactions = paymentLink.payments?.length || 0;
      const totalAmountReceived = paymentLink.totalAmountReceived || '0';
      const currentUses = paymentLink.currentUses || 0;
      const maxUses = paymentLink.maxUses || 1;

      const tokenEmoji = this.getTokenEmoji(paymentLink.token);
      const statusEmoji = paymentLink.status === 'active' ? '🟢' : '🔴';

      let response = `📊 Payment Link Statistics\n\n`;
      response += `🔗 Link: ${paymentLink.title}\n`;
      response += `🆔 ID: \`${linkId}\`\n`;
      response += `${statusEmoji} Status: ${paymentLink.status}\n`;
      response += `${tokenEmoji} Token: ${paymentLink.token}\n`;
      response += `💰Amount: ${paymentLink.amount} ${paymentLink.token}\n\n`;

      response += `📈 Transaction Summary:\n`;
      response += `• Total Transactions: ${totalTransactions}\n`;
      response += `• Uses: ${currentUses}/${maxUses === -1 ? '∞' : maxUses}\n`;
      response += `• Total Received: ${totalAmountReceived} ${paymentLink.token}\n`;
      response += `• View Count: ${paymentLink.viewCount || 0}\n\n`;

      if (totalTransactions > 0 && paymentLink.payments) {
        response += `💸 Recent Transactions\n`;
        const recentPayments = paymentLink.payments.slice(-3);

        recentPayments.forEach((payment, index) => {
          const date = new Date(payment.paidAt).toLocaleDateString();
          const shortAddress = `${payment.payerAddress.slice(0, 6)}...${payment.payerAddress.slice(-4)}`;
          response += `${index + 1}. ${payment.amount} ${paymentLink.token} from ${shortAddress} on ${date}\n`;
        });

        if (paymentLink.payments.length > 3) {
          response += `\n...and ${paymentLink.payments.length - 3} more transactions\n`;
        }
      } else {
        response += `📝 No transactions yet\n`;
        response += `Share your payment link to start receiving payments!\n`;
      }

      response += `\n🔗 Link URL: ${paymentLink.linkUrl}`;

      return response;
    } catch (error) {
      console.error('Error getting payment link stats:', error);
      return '❌ Failed to retrieve payment link statistics. Please try again later.';
    }
  }

  // Enhanced method that returns both formatted response AND full link data
  async getPaymentLinkStatsWithData(
    linkId: string,
    telegramUserId: string,
  ): Promise<{ response: string; linkData: any | null; success: boolean }> {
    try {
      // Find the payment link
      const paymentLink = await this.paymentLinkRepository.findOne({ linkId });

      if (!paymentLink) {
        return {
          response: `❌ Payment link with ID "${linkId}" not found.\n\n💡 Make sure you're using the correct link ID from your payment links.`,
          linkData: null,
          success: false,
        };
      }

      // Check if the user owns this payment link
      const userObjectId = await this.getUserObjectId(telegramUserId);
      const user = await this.paymentLinkRepository.findOne({
        linkId,
        creatorUserId: userObjectId,
      });

      if (!user) {
        return {
          response: `❌ You don't have access to payment link "${linkId}".\n\n💡 You can only view statistics for your own payment links.`,
          linkData: null,
          success: false,
        };
      }

      const totalTransactions = paymentLink.payments?.length || 0;
      const totalAmountReceived = paymentLink.totalAmountReceived || '0';
      const currentUses = paymentLink.currentUses || 0;
      const maxUses = paymentLink.maxUses || 1;

      const tokenEmoji = this.getTokenEmoji(paymentLink.token);
      const statusEmoji = paymentLink.status === 'active' ? '🟢' : '🔴';

      let response = `📊 Payment Link Statistics\n\n`;
      response += `🔗 Link: ${paymentLink.title}\n`;
      response += `🆔 ID: \`${linkId}\`\n`;
      response += `${statusEmoji} Status: ${paymentLink.status}\n`;
      response += `${tokenEmoji} Token: ${paymentLink.token}\n`;
      response += `💰Amount: ${paymentLink.amount} ${paymentLink.token}\n\n`;

      response += `📈 Transaction Summary:\n`;
      response += `• Total Transactions: ${totalTransactions}\n`;
      response += `• Uses: ${currentUses}/${maxUses === -1 ? '∞' : maxUses}\n`;
      response += `• Total Received: ${totalAmountReceived} ${paymentLink.token}\n`;
      response += `• View Count: ${paymentLink.viewCount || 0}\n\n`;

      if (totalTransactions > 0 && paymentLink.payments) {
        response += `💸 Recent Transactions\n`;
        const recentPayments = paymentLink.payments.slice(-3);

        recentPayments.forEach((payment, index) => {
          const date = new Date(payment.paidAt).toLocaleDateString();
          const shortAddress = `${payment.payerAddress.slice(0, 6)}...${payment.payerAddress.slice(-4)}`;
          response += `${index + 1}. ${payment.amount} ${paymentLink.token} from ${shortAddress} on ${date}\n`;
        });

        if (paymentLink.payments.length > 3) {
          response += `\n...and ${paymentLink.payments.length - 3} more transactions\n`;
        }
      } else {
        response += `📝 No transactions yet\n`;
        response += `Share your payment link to start receiving payments!\n`;
      }

      response += `\n🔗 Link URL: ${paymentLink.linkUrl}`;

      // Return both formatted response and full link data
      return {
        response,
        linkData: {
          ...(paymentLink.toObject ? paymentLink.toObject() : paymentLink),
          stats: {
            totalTransactions,
            totalAmountReceived,
            currentUses,
            maxUses,
            conversionRate:
              paymentLink.viewCount > 0
                ? ((totalTransactions / paymentLink.viewCount) * 100).toFixed(2)
                : '0',
            averageTransactionAmount:
              totalTransactions > 0
                ? (parseFloat(totalAmountReceived) / totalTransactions).toFixed(
                    2,
                  )
                : '0',
          },
        },
        success: true,
      };
    } catch (error) {
      console.error('Error getting payment link stats:', error);
      return {
        response:
          '❌ Failed to retrieve payment link statistics. Please try again later.',
        linkData: null,
        success: false,
      };
    }
  }

  async getAllPaymentLinksStats(telegramUserId: string): Promise<string> {
    try {
      const userObjectId = await this.getUserObjectId(telegramUserId);
      console.log('Getting payment links for user:', userObjectId);

      const paymentLinks = await this.paymentLinkRepository.find(
        {
          creatorUserId: userObjectId,
        },
        {},
        { sort: { createdAt: -1 } },
      );

      console.log('Found payment links:', paymentLinks?.length || 0);

      if (!paymentLinks || paymentLinks.length === 0) {
        return "📊 Payment Link Statistics**\n\n❌ You haven't created any payment links yet.\n\n💡 Use /payment to create your first payment link!";
      }

      let response = `📊 All Payment Links Statistics\n\n`;
      response += `📈 Overview:\n`;
      response += `• Total Links: ${paymentLinks.length}\n`;

      const activeLinks = paymentLinks.filter(
        (link) => link.status === 'active',
      ).length;
      const totalTransactions = paymentLinks.reduce(
        (sum, link) => sum + (link.payments?.length || 0),
        0,
      );
      const totalViews = paymentLinks.reduce(
        (sum, link) => sum + (link.viewCount || 0),
        0,
      );

      response += `• Active Links: ${activeLinks}\n`;
      response += `• Total Transactions: ${totalTransactions}\n`;
      response += `• Total Views: ${totalViews}\n\n`;

      response += `🔗 Individual Links:\n`;

      paymentLinks.slice(0, 5).forEach((link, index) => {
        const tokenEmoji = this.getTokenEmoji(link.token);
        const statusEmoji = link.status === 'active' ? '🟢' : '🔴';
        const transactionCount = link.payments?.length || 0;

        response += `${index + 1}. ${link.title}\n`;
        response += `   ${statusEmoji} ${link.status} | ${tokenEmoji} ${link.amount} ${link.token}\n`;
        response += `   📊 ${transactionCount} transactions | 👁️ ${link.viewCount || 0} views\n`;
        response += `   🆔 \`${link.linkId}\`\n\n`;
      });

      if (paymentLinks.length > 5) {
        response += `...and ${paymentLinks.length - 5} more links\n\n`;
      }

      response += `💡 Get detailed stats: Ask me "payment link stats for [linkId]" to see specific transaction details.`;

      return response;
    } catch (error) {
      console.error('Error getting all payment links stats:', error);
      return '❌ Failed to retrieve payment link statistics. Please try again later.';
    }
  }

  // Enhanced method that returns both formatted response AND full links data
  async getAllPaymentLinksStatsWithData(
    telegramUserId: string,
  ): Promise<{ response: string; linksData: any[] | null; success: boolean }> {
    try {
      const userObjectId = await this.getUserObjectId(telegramUserId);
      console.log('Getting payment links for user:', userObjectId);

      const paymentLinks = await this.paymentLinkRepository.find(
        {
          creatorUserId: userObjectId,
        },
        {},
        { sort: { createdAt: -1 } },
      );

      console.log('Found payment links:', paymentLinks?.length || 0);

      if (!paymentLinks || paymentLinks.length === 0) {
        return {
          response:
            "📊 Payment Link Statistics\n\n❌ You haven't created any payment links yet.\n\n💡 Use /payment to create your first payment link!",
          linksData: [],
          success: true,
        };
      }

      let response = `📊 All Payment Links Statistics\n\n`;
      response += `📈 Overview:\n`;
      response += `• Total Links: ${paymentLinks.length}\n`;

      const activeLinks = paymentLinks.filter(
        (link) => link.status === 'active',
      ).length;
      const totalTransactions = paymentLinks.reduce(
        (sum, link) => sum + (link.payments?.length || 0),
        0,
      );
      const totalViews = paymentLinks.reduce(
        (sum, link) => sum + (link.viewCount || 0),
        0,
      );
      const totalRevenue = paymentLinks.reduce(
        (sum, link) => sum + parseFloat(link.totalAmountReceived || '0'),
        0,
      );

      response += `• Active Links: ${activeLinks}\n`;
      response += `• Total Transactions: ${totalTransactions}\n`;
      response += `• Total Views: ${totalViews}\n`;
      response += `• Total Revenue: ${totalRevenue.toFixed(2)} (across all tokens)\n\n`;

      response += `🔗 Individual Links:\n`;

      const linksWithStats = paymentLinks.slice(0, 5).map((link, index) => {
        const tokenEmoji = this.getTokenEmoji(link.token);
        const statusEmoji = link.status === 'active' ? '🟢' : '🔴';
        const transactionCount = link.payments?.length || 0;

        response += `${index + 1}. ${link.title}\n`;
        response += `   ${statusEmoji} ${link.status} | ${tokenEmoji} ${link.amount} ${link.token}\n`;
        response += `   📊 ${transactionCount} transactions | 👁️ ${link.viewCount || 0} views\n`;
        response += `   🆔 \`${link.linkId}\`\n`;
        response += `   🔗 ${link.linkUrl}\n\n`;

        // Return enhanced link data
        return {
          ...(link.toObject ? link.toObject() : link),
          stats: {
            totalTransactions: transactionCount,
            totalAmountReceived: link.totalAmountReceived || '0',
            currentUses: link.currentUses || 0,
            maxUses: link.maxUses || 1,
            viewCount: link.viewCount || 0,
            conversionRate:
              link.viewCount > 0
                ? ((transactionCount / link.viewCount) * 100).toFixed(2)
                : '0',
            averageTransactionAmount:
              transactionCount > 0
                ? (
                    parseFloat(link.totalAmountReceived || '0') /
                    transactionCount
                  ).toFixed(2)
                : '0',
            status: link.status,
            isActive: link.status === 'active',
          },
        };
      });

      if (paymentLinks.length > 5) {
        response += `...and ${paymentLinks.length - 5} more links\n\n`;
      }

      response += `💡 Get detailed stats: Ask me "payment link stats for [linkId]" to see specific transaction details.`;

      // Prepare all links data with stats
      const allLinksData = paymentLinks.map((link) => {
        const transactionCount = link.payments?.length || 0;
        return {
          ...(link.toObject ? link.toObject() : link),
          stats: {
            totalTransactions: transactionCount,
            totalAmountReceived: link.totalAmountReceived || '0',
            currentUses: link.currentUses || 0,
            maxUses: link.maxUses || 1,
            viewCount: link.viewCount || 0,
            conversionRate:
              link.viewCount > 0
                ? ((transactionCount / link.viewCount) * 100).toFixed(2)
                : '0',
            averageTransactionAmount:
              transactionCount > 0
                ? (
                    parseFloat(link.totalAmountReceived || '0') /
                    transactionCount
                  ).toFixed(2)
                : '0',
            status: link.status,
            isActive: link.status === 'active',
            createdAt: link.createdAt,
            updatedAt: link.updatedAt,
          },
        };
      });

      return {
        response,
        linksData: allLinksData,
        success: true,
      };
    } catch (error) {
      console.error('Error getting all payment links stats:', error);
      return {
        response:
          '❌ Failed to retrieve payment link statistics. Please try again later.',
        linksData: null,
        success: false,
      };
    }
  }

  private async getUserObjectId(telegramUserId: string): Promise<any> {
    try {
      console.log('Looking up user with telegramId:', telegramUserId);
      const user = await this.userRepository.findOne({
        telegramId: telegramUserId,
      });
      console.log('Found user:', user ? 'Yes' : 'No', user?._id);
      return user?._id;
    } catch (error) {
      console.error('Error getting user ObjectId:', error);
      return null;
    }
  }

  private getTokenEmoji(token: string): string {
    const tokenEmojis = {
      USDC: '🔵',
      USDT: '🟢',
      DAI: '🟡',
      MNT: '🔷',
    };
    return tokenEmojis[token] || '🪙';
  }

  // Public methods for external access with full data
  async getPaymentLinkFullStats(
    linkId: string,
    telegramUserId: string,
  ): Promise<{ response: string; linkData: any | null; success: boolean }> {
    return await this.getPaymentLinkStatsWithData(linkId, telegramUserId);
  }

  async getAllPaymentLinksFullStats(
    telegramUserId: string,
  ): Promise<{ response: string; linksData: any[] | null; success: boolean }> {
    return await this.getAllPaymentLinksStatsWithData(telegramUserId);
  }

  // Get raw payment links data without formatting
  async getPaymentLinksRawData(telegramUserId: string): Promise<any[] | null> {
    try {
      const userObjectId = await this.getUserObjectId(telegramUserId);
      if (!userObjectId) {
        console.log('User not found for telegramId:', telegramUserId);
        return null;
      }

      const paymentLinks = await this.paymentLinkRepository.find(
        { creatorUserId: userObjectId },
        {},
        { sort: { createdAt: -1 } },
      );

      return paymentLinks || [];
    } catch (error) {
      console.error('Error getting raw payment links:', error);
      return null;
    }
  }

  // Get specific payment link raw data
  async getPaymentLinkRawData(
    linkId: string,
    telegramUserId: string,
  ): Promise<any | null> {
    try {
      const userObjectId = await this.getUserObjectId(telegramUserId);
      if (!userObjectId) {
        return null;
      }

      const paymentLink = await this.paymentLinkRepository.findOne({
        linkId,
        creatorUserId: userObjectId,
      });

      return paymentLink;
    } catch (error) {
      console.error('Error getting payment link raw data:', error);
      return null;
    }
  }
}
