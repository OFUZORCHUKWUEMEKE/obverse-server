import { createBalanceTool } from '../tools/balance-tool';
import { createPaymentLinkTool } from '../tools/payment-link-tool';
import { createTransferTool } from '../tools/transfer-tool';

export class TelegramCryptoAgent {
  private balanceTool: any;
  private paymentLinkTool: any;
  private transferTool: any;
  private conversationMemory: Map<
    string,
    Array<{ role: string; content: string; timestamp: number }>
  > = new Map();
  private paymentLinkRepository: any;
  private transactionRepository: any;
  private userRepository: any;

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
    this.balanceTool = createBalanceTool(walletService, paraService);
    this.paymentLinkTool = createPaymentLinkTool(
      paymentLinkRepository,
      walletRepository,
      userRepository,
    );
    this.transferTool = createTransferTool(
      walletRepository,
      userRepository,
      transactionRepository,
      paraService,
    );
  }

  async processMessage(
    message: string,
    telegramUserId: string,
    telegramChatId: string,
    context?: any,
  ): Promise<string> {
    // Store conversation in memory
    this.addToConversationMemory(telegramUserId, 'user', message);

    // Analyze user intent with enhanced understanding
    const intent = this.analyzeUserIntent(message, telegramUserId);

    let response: string;
    try {
      switch (intent.type) {
        case 'balance_check':
          response = await this.handleBalanceIntent(telegramUserId, intent);
          break;
        case 'send_tokens':
          response = await this.handleSendIntent(telegramUserId, intent);
          break;
        case 'payment_link':
          response = await this.handlePaymentLinkIntent(telegramUserId, intent);
          break;
        case 'transaction_history':
          response = await this.handleTransactionHistoryIntent(
            telegramUserId,
            intent,
          );
          break;
        case 'payment_link_stats':
          response = await this.handlePaymentLinkStatsIntent(
            telegramUserId,
            intent,
          );
          break;
        case 'help':
          response = this.handleHelpIntent(telegramUserId, intent);
          break;
        case 'greeting':
          response = this.handleGreetingIntent(telegramUserId);
          break;
        default:
          response = this.handleUnknownIntent(telegramUserId, message);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      response = this.handleError(telegramUserId, error, intent.type);
    }

    // Store assistant response in memory
    this.addToConversationMemory(telegramUserId, 'assistant', response);

    return response;
  }

  private analyzeUserIntent(
    message: string,
    userId: string,
  ): {
    type: string;
    confidence: number;
    entities: any;
    context: any;
  } {
    const lowerMessage = message.toLowerCase();
    const conversationHistory = this.getConversationMemory(userId);

    // Enhanced intent recognition with context
    // Order matters - more specific patterns should come first
    const patterns = {
      payment_link_stats: [
        /\b(payment.*link.*stat|link.*stat|track.*payment.*link|payment.*link.*transaction)\b/i,
        /\b(how.*many.*transaction|total.*transaction.*link|payment.*link.*analytics)\b/i,
        /\b(link.*performance|payment.*received.*link)\b/i,
        /\b(show.*payment.*link.*stat|show.*link.*stat|show.*all.*payment.*link)\b/i,
        /\b(my.*payment.*link.*stat|all.*my.*payment.*link)\b/i,
        /\b(payment.*link.*overview|link.*overview|statistics.*payment.*link)\b/i,
        /\b(view.*payment.*link.*stat|display.*payment.*link)\b/i,
        /\b(payment.*link.*statistics|statistics.*payment.*link)\b/i,
        /\b(track.*payment.*links?|track.*links?)\b/i,
        /\b(show.*payment.*link|view.*payment.*link)\b/i,
      ],
      balance_check: [
        /\b(balance|wallet|how much|check)\b/i,
        /\b(show.*balance|show.*wallet)\b/i,
        /\b(my.*balance|account|funds|money)\b/i,
        /\b(usdc|usdt|dai|mnt).*balance\b/i,
        /\b(what.*have)\b/i,
      ],
      send_tokens: [
        /\b(send|transfer|pay|give)\b.*\b(usdc|usdt|dai|mnt|tokens?)\b/i,
        /\b(transfer|send)\b.*\b(\d+(?:\.\d+)?)\b/i,
        /\b(pay|send).*\b0x[a-fA-F0-9]{40}\b/i,
      ],
      payment_link: [
        /\b(payment.*link|link.*payment|create.*link|generate.*link)\b/i,
        /\b(invoice|bill|payment.*request)\b/i,
        /\b(accept.*payment|receive.*payment)\b/i,
      ],
      transaction_history: [
        /\b(transaction|history|recent|activity|movements?)\b/i,
        /\b(what.*sent|what.*received|past.*transactions?)\b/i,
      ],
      help: [
        /\b(help|what.*can.*do|how.*work|commands?)\b/i,
        /\b(assist|support|guide|explain)\b/i,
      ],
      greeting: [
        /\b(hi|hello|hey|good.*morning|good.*afternoon|good.*evening)\b/i,
        /^(hi|hello|hey)$/i,
      ],
    };

    let bestMatch = {
      type: 'unknown',
      confidence: 0,
      entities: {},
      context: {},
    };

    for (const [intentType, regexes] of Object.entries(patterns)) {
      let confidence = 0;
      const entities: any = {};

      for (const regex of regexes) {
        const match = message.match(regex);
        if (match) {
          confidence += 0.3;

          // Extract entities based on intent type
          if (intentType === 'send_tokens') {
            const amountMatch = message.match(/\b(\d+(?:\.\d+)?)\b/);
            const tokenMatch = message.match(/\b(usdc|usdt|dai|mnt)\b/i);
            const addressMatch = message.match(/\b0x[a-fA-F0-9]{40}\b/i);

            if (amountMatch) entities.amount = amountMatch[1];
            if (tokenMatch) entities.token = tokenMatch[1].toUpperCase();
            if (addressMatch) entities.address = addressMatch[0];
          }

          if (intentType === 'balance_check') {
            const tokenMatch = message.match(/\b(usdc|usdt|dai|mnt)\b/i);
            if (tokenMatch)
              entities.specificToken = tokenMatch[1].toUpperCase();
          }

          if (intentType === 'payment_link_stats') {
            const linkIdMatch = message.match(/\b[A-Za-z0-9]{8}\b/);
            if (linkIdMatch) entities.linkId = linkIdMatch[0];
          }
        }
      }

      // Boost confidence based on conversation context
      if (conversationHistory.length > 0) {
        const lastMessage = conversationHistory[conversationHistory.length - 1];
        if (
          lastMessage.role === 'assistant' &&
          this.isFollowUpIntent(lastMessage.content, intentType)
        ) {
          confidence += 0.2;
        }
      }

      if (confidence > bestMatch.confidence) {
        bestMatch = {
          type: intentType,
          confidence,
          entities,
          context: { conversationHistory },
        };
      }
    }

    return bestMatch;
  }

  private async handleBalanceIntent(
    userId: string,
    intent: any,
  ): Promise<string> {
    try {
      const balanceResult = await this.executeBalanceCheck(
        userId,
        undefined,
        intent.entities.specificToken
          ? [intent.entities.specificToken]
          : undefined,
      );

      if (balanceResult.success) {
        const response = this.formatBalanceForChat(balanceResult.data);

        // Add contextual follow-up suggestions
        const suggestions = this.getContextualSuggestions(
          'balance',
          balanceResult.data,
        );
        return response + (suggestions ? `\n\n${suggestions}` : '');
      } else {
        return `❌ I couldn't retrieve your balance right now: ${balanceResult.error}\n\n💡 Try using /balance command or check if your wallet is set up correctly with /wallet`;
      }
    } catch (error) {
      return '❌ Something went wrong while checking your balance. Let me help you troubleshoot:\n\n1️⃣ Make sure you have a wallet set up (/start)\n2️⃣ Try the /balance command\n3️⃣ Contact support if the issue persists';
    }
  }

  private async handleSendIntent(userId: string, intent: any): Promise<string> {
    const { amount, token, address } = intent.entities;

    if (amount && token && address) {
      return `💸 I see you want to send ${amount} ${token} to ${address}. Let me help you with that!\n\nFor security, please use the /send command:\n\n📝 \`/send ${amount} ${token} ${address}\`\n\n⚠️ This will show you a confirmation before sending.`;
    } else if (amount && token) {
      return `💸 You want to send ${amount} ${token}. I'll need the recipient's address to proceed.\n\n📝 Use: \`/send ${amount} ${token} <recipient_address>\`\n\n💡 Make sure the address starts with 0x and is 42 characters long.`;
    } else {
      return "💸 I can help you send tokens! Here's what I need:\n\n📝 Format: \`/send <amount> <token> <address>\`\n💡 Example: \`/send 10 USDC 0x123...abc\`\n\n🪙 Supported tokens: MNT, USDC, USDT, DAI\n\n💡 Pro tip: Double-check the recipient address before sending!";
    }
  }

  private async handlePaymentLinkIntent(
    userId: string,
    intent: any,
  ): Promise<string> {
    return "🔗 Great! I'll help you create a payment link to accept payments.\n\nUse the /payment command to start the setup process. You'll be able to:\n\n✅ Set a custom payment name\n✅ Choose the token (USDC, USDT, DAI)\n✅ Set the amount\n✅ Collect customer details\n✅ Get a QR code for easy sharing\n\n💡 Perfect for businesses, freelancers, or personal payments!";
  }

  private async handleTransactionHistoryIntent(
    userId: string,
    intent: any,
  ): Promise<string> {
    return '📊 I can show you your recent transactions!\n\nUse the /transactions command to see:\n\n🔷 Native transactions (MNT/ETH)\n🪙 Token transfers (USDC, USDT, DAI)\n🕐 Transaction timestamps\n🔗 Explorer links\n\n💡 This helps you track all your wallet activity.';
  }

  private async handlePaymentLinkStatsIntent(
    userId: string,
    intent: any,
  ): Promise<string> {
    try {
      const { linkId } = intent.entities;

      if (linkId) {
        const stats = await this.getPaymentLinkTransactionCount(linkId, userId);
        return stats;
      } else {
        // Get all payment links for the user
        const allLinksStats = await this.getAllPaymentLinksStats(userId);
        return allLinksStats;
      }
    } catch (error) {
      return "❌ I couldn't retrieve payment link statistics. Please make sure you have created payment links first.\n\n💡 Use /payment to create a payment link, then ask me for stats!";
    }
  }

  private handleHelpIntent(userId: string, intent: any): string {
    const conversationHistory = this.getConversationMemory(userId);
    const isNewUser = conversationHistory.length <= 2;

    if (isNewUser) {
      return '👋 Welcome! I\'m your crypto wallet assistant. Here\'s what I can do:\n\n💰 **Check Balance** - "What\'s my balance?" or /balance\n💸 **Send Tokens** - "Send 10 USDC to 0x..." or /send\n🔗 **Payment Links** - "Create payment link" or /payment\n📊 **Transaction History** - "Show transactions" or /transactions\n📈 **Payment Link Stats** - "Track payment link transactions" or "How many transactions on my payment link?"\n\n🗣️ **Just talk to me naturally!** I understand context and can help with follow-up questions.\n\n💡 Start by checking your balance or creating your first payment link!';
    } else {
      return "🤖 I'm here to help! Based on our conversation, here are some things you might want to do:\n\n💰 /balance - Check your current balances\n💸 /send - Send tokens to someone\n🔗 /payment - Create a payment link\n📊 /transactions - View recent activity\n📈 Ask for payment link statistics\n\n💬 You can also just tell me what you want to do in plain English!";
    }
  }

  private handleGreetingIntent(userId: string): string {
    const conversationHistory = this.getConversationMemory(userId);
    const timeOfDay = new Date().getHours();
    const greeting =
      timeOfDay < 12
        ? 'Good morning'
        : timeOfDay < 17
          ? 'Good afternoon'
          : 'Good evening';

    if (conversationHistory.length <= 2) {
      return `${greeting}! 👋 I\'m your crypto wallet assistant. I can help you manage your wallet, send tokens, and create payment links.\n\n💡 Try saying things like:\n• "What\'s my balance?"\n• "Send 10 USDC to someone"\n• "Create a payment link"\n\nWhat would you like to do?`;
    } else {
      return `${greeting}! Welcome back! 👋\n\nWhat can I help you with today? I remember our previous conversations and can continue where we left off.`;
    }
  }

  private handleUnknownIntent(_userId: string, message: string): string {
    // Try to provide helpful suggestions based on keywords
    const lowerMessage = message.toLowerCase();
    if (lowerMessage.includes('price') || lowerMessage.includes('value')) {
      return '📈 I don\'t have access to current token prices, but I can show you your wallet balances!\n\nTry asking: "What\'s my balance?" or use /balance';
    }

    if (lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
      return "💳 I can't help with buying tokens, but I can help you manage the ones you already have!\n\n💡 I can help you:\n• Check your balance\n• Send tokens to others\n• Create payment links to receive tokens";
    }

    return `🤔 I\'m not sure I understand "${message}". Let me help you with what I can do:\n\n💰 Check wallet balance\n💸 Send tokens\n🔗 Create payment links\n📊 View transactions\n\n💬 Try being more specific, like "show my balance" or "help me send USDC"`;
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

  private isFollowUpIntent(
    lastAssistantMessage: string,
    currentIntentType: string,
  ): boolean {
    const followUpPatterns = {
      balance_check: ['balance', 'check', 'wallet'],
      send_tokens: ['send', 'transfer', 'pay'],
      payment_link: ['payment', 'link', 'create'],
    };

    const patterns = followUpPatterns[currentIntentType] || [];
    return patterns.some((pattern: string) =>
      lastAssistantMessage.toLowerCase().includes(pattern),
    );
  }

  private getContextualSuggestions(
    actionType: string,
    data?: any,
  ): string | null {
    switch (actionType) {
      case 'balance':
        if (data?.tokenBalances?.some((t: any) => parseFloat(t.balance) > 0)) {
          return "💡 **What's next?**\n• Send tokens: /send\n• Create payment link: /payment";
        } else {
          return '💡 **Get started:**\n• Create a payment link to receive tokens: /payment\n• View transaction history: /transactions';
        }
      default:
        return null;
    }
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

    let balanceText = `💰 **Your Wallet Balance**\n\n`;

    // Native balances
    if (balanceData.nativeBalances) {
      if (balanceData.nativeBalances.ETH) {
        balanceText += `🔷 **ETH:** ${balanceData.nativeBalances.ETH.balance} ETH\n`;
      }
      if (balanceData.nativeBalances.MNT) {
        balanceText += `🟢 **MNT:** ${balanceData.nativeBalances.MNT.balance} ${balanceData.nativeBalances.MNT.symbol}\n`;
      }
    }

    // Token balances
    if (balanceData.tokenBalances && balanceData.tokenBalances.length > 0) {
      balanceText += `\n🪙 **Token Balances:**\n`;

      for (const token of balanceData.tokenBalances) {
        const emoji =
          token.symbol === 'USDC'
            ? '🔵'
            : token.symbol === 'USDT'
              ? '🟢'
              : '🟡';
        balanceText += `${emoji} **${token.symbol}:** ${token.balance}\n`;
      }
    }

    balanceText += `\n📍 **Wallet:** \`${balanceData.walletAddress}\``;

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

  async executePaymentLinkCreation(
    telegramUserId: string,
    telegramChatId: string,
    name: string,
    token: 'USDC' | 'USDT' | 'DAI',
    amount: string,
    details?: { [key: string]: string },
  ) {
    try {
      return await this.paymentLinkTool.execute({
        telegramUserId,
        telegramChatId,
        name,
        token,
        amount,
        details,
        type: 'ONE_TIME',
      });
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
          success: false
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
          success: false
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
          ...paymentLink.toObject ? paymentLink.toObject() : paymentLink,
          stats: {
            totalTransactions,
            totalAmountReceived,
            currentUses,
            maxUses,
            conversionRate: paymentLink.viewCount > 0 ? (totalTransactions / paymentLink.viewCount * 100).toFixed(2) : '0',
            averageTransactionAmount: totalTransactions > 0 ? (parseFloat(totalAmountReceived) / totalTransactions).toFixed(2) : '0'
          }
        },
        success: true
      };
    } catch (error) {
      console.error('Error getting payment link stats:', error);
      return {
        response: '❌ Failed to retrieve payment link statistics. Please try again later.',
        linkData: null,
        success: false
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
        { sort: { createdAt: -1 } }
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
        { sort: { createdAt: -1 } }
      );
      
      console.log('Found payment links:', paymentLinks?.length || 0);

      if (!paymentLinks || paymentLinks.length === 0) {
        return {
          response: "📊 Payment Link Statistics\n\n❌ You haven't created any payment links yet.\n\n💡 Use /payment to create your first payment link!",
          linksData: [],
          success: true
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
          ...link.toObject ? link.toObject() : link,
          stats: {
            totalTransactions: transactionCount,
            totalAmountReceived: link.totalAmountReceived || '0',
            currentUses: link.currentUses || 0,
            maxUses: link.maxUses || 1,
            viewCount: link.viewCount || 0,
            conversionRate: link.viewCount > 0 ? (transactionCount / link.viewCount * 100).toFixed(2) : '0',
            averageTransactionAmount: transactionCount > 0 ? (parseFloat(link.totalAmountReceived || '0') / transactionCount).toFixed(2) : '0',
            status: link.status,
            isActive: link.status === 'active'
          }
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
          ...link.toObject ? link.toObject() : link,
          stats: {
            totalTransactions: transactionCount,
            totalAmountReceived: link.totalAmountReceived || '0',
            currentUses: link.currentUses || 0,
            maxUses: link.maxUses || 1,
            viewCount: link.viewCount || 0,
            conversionRate: link.viewCount > 0 ? (transactionCount / link.viewCount * 100).toFixed(2) : '0',
            averageTransactionAmount: transactionCount > 0 ? (parseFloat(link.totalAmountReceived || '0') / transactionCount).toFixed(2) : '0',
            status: link.status,
            isActive: link.status === 'active',
            createdAt: link.createdAt,
            updatedAt: link.updatedAt
          }
        };
      });

      return {
        response,
        linksData: allLinksData,
        success: true
      };
    } catch (error) {
      console.error('Error getting all payment links stats:', error);
      return {
        response: '❌ Failed to retrieve payment link statistics. Please try again later.',
        linksData: null,
        success: false
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
  async getPaymentLinksRawData(
    telegramUserId: string,
  ): Promise<any[] | null> {
    try {
      const userObjectId = await this.getUserObjectId(telegramUserId);
      if (!userObjectId) {
        console.log('User not found for telegramId:', telegramUserId);
        return null;
      }

      const paymentLinks = await this.paymentLinkRepository.find(
        { creatorUserId: userObjectId },
        {},
        { sort: { createdAt: -1 } }
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
