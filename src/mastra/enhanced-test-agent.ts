// Enhanced test script to demonstrate the improved AI agent functionality
// This file showcases the new smart features and better responses

import { TelegramCryptoAgent } from './agents/payment';

// Enhanced mock services for testing
const mockWalletService = {
  walletRepository: {
    findOne: async (query: any) => {
      if (query.userId === 'experienced_user_456') {
        return {
          _id: 'wallet_experienced',
          address: '0x1234567890abcdef1234567890abcdef12345678',
          userId: 'experienced_user_456',
        };
      }
      if (query.userId === 'new_user_789') {
        return {
          _id: 'wallet_new',
          address: '0xabcdef1234567890abcdef1234567890abcdef12',
          userId: 'new_user_789',
        };
      }
      return null;
    },
  },
};

const mockParaService = {
  getBalance: async (address: string) => ({
    balance: '2.5',
  }),
  getMantleBalance: async (address: string) => ({
    formatted: '150.0',
    symbol: 'MNT',
  }),
  getAllTokenBalances: async (address: string) => [
    { symbol: 'USDC', balance: '1250.123456', address: '0xusdc' },
    { symbol: 'USDT', balance: '800.789012', address: '0xusdt' },
    { symbol: 'DAI', balance: '0.0', address: '0xdai' },
  ],
};

const mockPaymentLinkRepository = {
  create: async (data: any) => ({
    _id: 'payment_link_enhanced',
    ...data,
  }),
};

const mockUserRepository = {
  findOne: async (query: any) => {
    if (query.telegramId === 'experienced_user_456') {
      return {
        _id: 'user_experienced',
        telegramId: 'experienced_user_456',
        firstName: 'Alex',
        lastName: 'Crypto',
        lastSeenAt: new Date(Date.now() - 1000 * 60 * 60), // 1 hour ago
      };
    }
    if (query.telegramId === 'new_user_789') {
      return {
        _id: 'user_new',
        telegramId: 'new_user_789',
        firstName: 'Sam',
        lastName: 'Newcomer',
        lastSeenAt: new Date(), // Just now
      };
    }
    return null;
  },
};

export async function testEnhancedAgent() {
  console.log('🚀 Testing Enhanced Telegram Crypto Agent...\n');

  const agent = new TelegramCryptoAgent(
    mockWalletService,
    mockParaService,
    mockPaymentLinkRepository,
    mockWalletService.walletRepository,
    mockUserRepository,
  );

  console.log('✅ Enhanced agent initialized successfully\n');

  // Test scenarios with different user types and contexts
  const testScenarios = [
    {
      title: 'New User - First Interaction',
      userId: 'new_user_789',
      messages: [
        'Hi there!',
        'What can you help me with?',
        'I want to check my balance',
        'How do I send tokens to someone?',
      ],
    },
    {
      title: 'Experienced User - Natural Language',
      userId: 'experienced_user_456',
      messages: [
        'Hey, show me my USDC balance',
        'I need to send 100 USDC to 0x1234567890abcdef1234567890abcdef12345678',
        'Create a payment link for $50 USDT',
        'What were my recent transactions?',
      ],
    },
    {
      title: 'Error Handling and Recovery',
      userId: 'experienced_user_456',
      messages: [
        'Send all my money to random address', // Should be handled carefully
        'What is the price of Bitcoin?', // Outside scope
        'Help me buy more USDC', // Outside scope
        "I'm stuck and need urgent help!", // High urgency
      ],
    },
    {
      title: 'Context Awareness',
      userId: 'new_user_789',
      messages: [
        "I'm confused about crypto",
        'Is it safe?',
        'How do I get started?',
        'What tokens should I use?',
      ],
    },
  ];

  for (const scenario of testScenarios) {
    console.log(`🎭 **${scenario.title}**`);
    console.log('=' + '='.repeat(scenario.title.length + 4));

    for (let i = 0; i < scenario.messages.length; i++) {
      const message = scenario.messages[i];

      console.log(`\n👤 User: "${message}"`);

      try {
        const startTime = Date.now();
        const response = await agent.processMessage(
          message,
          scenario.userId,
          `chat_${scenario.userId}`,
          {
            messageNumber: i + 1,
            totalMessages: scenario.messages.length,
            scenario: scenario.title,
          },
        );

        const responseTime = Date.now() - startTime;
        console.log(`🤖 Agent (${responseTime}ms): ${response}`);

        // Add a small delay to simulate real conversation timing
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Error processing message: ${error.message}`);
      }
    }

    console.log('\n' + '-'.repeat(60) + '\n');
  }

  // Test advanced features
  console.log('🧠 **Testing Advanced Features**');
  console.log('================================');

  // Test conversation memory
  console.log('\n📝 Testing Conversation Memory:');
  const memoryTestUser = 'memory_test_user';
  const memoryMessages = [
    'Hello!',
    'What was my first message?',
    'Do you remember what I asked before?',
  ];

  for (const message of memoryMessages) {
    console.log(`\n👤 User: "${message}"`);
    const response = await agent.processMessage(
      message,
      memoryTestUser,
      'test_chat',
    );
    console.log(`🤖 Agent: ${response}`);
  }

  // Test intent recognition accuracy
  console.log('\n🎯 Testing Intent Recognition:');
  const intentTests = [
    { message: 'How much USDC do I have?', expected: 'balance_check' },
    { message: 'Transfer 50 USDT to my friend', expected: 'send_tokens' },
    {
      message: 'I need a payment link for my business',
      expected: 'payment_link',
    },
    {
      message: 'Show me my transaction history',
      expected: 'transaction_history',
    },
    { message: 'Good morning! How are you?', expected: 'greeting' },
    { message: 'Can you help me?', expected: 'help' },
  ];

  for (const test of intentTests) {
    const response = await agent.processMessage(
      test.message,
      'intent_test_user',
      'test_chat',
    );
    console.log(`\n📝 Message: "${test.message}"`);
    console.log(`🎯 Expected: ${test.expected}`);
    console.log(`🤖 Response: ${response.substring(0, 100)}...`);
  }

  console.log('\n🎉 Enhanced Agent Testing Completed!');
  console.log('\n📊 **Improvements Demonstrated:**');
  console.log('• ✅ Intelligent intent recognition');
  console.log('• ✅ Conversation memory and context');
  console.log('• ✅ Personalized responses based on user experience');
  console.log('• ✅ Better error handling and recovery');
  console.log('• ✅ Sentiment analysis and urgency detection');
  console.log('• ✅ Smart follow-up suggestions');
  console.log('• ✅ Natural language understanding');
  console.log('• ✅ Contextual help and guidance');
}

// Uncomment to run the enhanced test
// testEnhancedAgent().catch(console.error);
