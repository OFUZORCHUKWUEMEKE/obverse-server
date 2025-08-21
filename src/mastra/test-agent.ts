// Test script to demonstrate the AI agent functionality
// This file can be run independently to test the agent without the full Telegram integration

import { TelegramCryptoAgent } from './agents/payment';

// Mock services for testing
const mockWalletService = {
  walletRepository: {
    findOne: async (query: any) => {
      if (query.userId === 'test_user_123') {
        return {
          _id: 'wallet_id_123',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          userId: 'test_user_123',
        };
      }
      return null;
    },
  },
};

const mockParaService = {
  getBalance: async (address: string) => ({
    balance: '1.5',
  }),
  getMantleBalance: async (address: string) => ({
    formatted: '100.0',
    symbol: 'MNT',
  }),
  getAllTokenBalances: async (address: string) => [
    { symbol: 'USDC', balance: '500.123456', address: '0xusdc' },
    { symbol: 'USDT', balance: '250.789012', address: '0xusdt' },
    { symbol: 'DAI', balance: '75.345678', address: '0xdai' },
  ],
};

const mockPaymentLinkRepository = {
  create: async (data: any) => ({
    _id: 'payment_link_123',
    ...data,
  }),
};

const mockUserRepository = {
  findOne: async (query: any) => {
    if (query.telegramId === 'test_user_123') {
      return {
        _id: 'user_id_123',
        telegramId: 'test_user_123',
        firstName: 'Test',
        lastName: 'User',
      };
    }
    return null;
  },
};

export async function testAgent() {
  console.log('🤖 Initializing Telegram Crypto Agent...');

  const agent = new TelegramCryptoAgent(
    mockWalletService,
    mockParaService,
    mockPaymentLinkRepository,
    mockWalletService.walletRepository,
    mockUserRepository,
  );

  console.log('✅ Agent initialized successfully');

  // Test balance check
  console.log('\n📊 Testing balance check...');
  try {
    const balanceResult = await agent.executeBalanceCheck('test_user_123');
    console.log('Balance result:', JSON.stringify(balanceResult, null, 2));
  } catch (error) {
    console.error('❌ Balance check error:', error);
  }

  // Test payment link creation
  console.log('\n🔗 Testing payment link creation...');
  try {
    const paymentResult = await agent.executePaymentLinkCreation(
      'test_user_123',
      'test_chat_123',
      'Test Coffee Purchase',
      'USDC',
      '5.50',
      { name: '', email: '', phone: '' },
    );
    console.log('Payment link result:', JSON.stringify(paymentResult, null, 2));
  } catch (error) {
    console.error('❌ Payment link creation error:', error);
  }

  // Test natural language processing
  console.log('\n💬 Testing natural language processing...');
  try {
    const naturalResponse = await agent.processMessage(
      'What is my current wallet balance?',
      'test_user_123',
      'test_chat_123',
    );
    console.log('Natural language response:', naturalResponse);
  } catch (error) {
    console.error('❌ Natural language processing error:', error);
  }

  console.log('\n🎉 Agent testing completed!');
}

// Uncomment to run the test
// testAgent().catch(console.error);
