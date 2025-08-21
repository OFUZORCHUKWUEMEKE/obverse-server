import { createBalanceTool } from '../tools/balance-tool';
import { createPaymentLinkTool } from '../tools/payment-link-tool';
import { createTransferTool } from '../tools/transfer-tool';

export class TelegramCryptoAgent {
  private balanceTool: any;
  private paymentLinkTool: any;
  private transferTool: any;

  constructor(
    walletService: any,
    paraService: any,
    paymentLinkRepository: any,
    walletRepository: any,
    userRepository: any,
    transactionRepository?: any,
  ) {
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
    const lowerMessage = message.toLowerCase();

    // Handle balance requests
    if (lowerMessage.includes('balance') || lowerMessage.includes('wallet')) {
      try {
        const balanceResult = await this.executeBalanceCheck(telegramUserId);
        if (balanceResult.success) {
          return this.formatBalanceForChat(balanceResult.data);
        } else {
          return `❌ Unable to check balance: ${balanceResult.error}`;
        }
      } catch (error) {
        return '❌ Error checking your balance. Please try again.';
      }
    }

    // Handle transfer/send requests
    if (lowerMessage.includes('send') || lowerMessage.includes('transfer')) {
      return '💸 I can help you send tokens! Please use the /send command to start a transfer, or try:\n\n📝 Format: `/send <amount> <token> <address>`\n💡 Example: `/send 10 USDC 0x123...abc`\n\n🪙 Supported tokens: MNT, USDC, USDT, DAI';
    }

    // Handle payment link requests
    if (lowerMessage.includes('payment') || lowerMessage.includes('link')) {
      return '🔗 I can help you create payment links! Please use the /payment command to start the payment link creation process.';
    }

    return '👋 I\'m your assistant! I can help you:\n\n💰 Check wallet balances - just ask "what\'s my balance?"\n💸 Send tokens - use /send command or say "send tokens"\n🔗 Create payment links - use /payment command\n📊 View transactions - use /transactions command\n\nWhat would you like to do?';
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
        return `✅ **Transfer Successful!**\n\n💸 Sent: ${data.amount} ${data.token}\n📍 To: \`${data.toAddress}\`\n📊 Transaction: \`${data.transactionHash}\`\n\n🔗 [View on Explorer](${data.confirmationUrl})`;
      } else {
        return `❌ Transfer failed: ${transferResult.error}`;
      }
    } catch (error) {
      return '❌ Error processing transfer. Please try again.';
    }
  }
}
