import { Tool } from '@mastra/core';
import { z } from 'zod';

interface UserProfile {
  preferredTokens: string[];
  averageTransactionAmount: number;
  frequentOperations: string[];
  lastSeenAt: Date;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced';
}

export const createSmartResponseTool = (
  userRepository: any,
  transactionRepository: any,
) => {
  return new Tool({
    id: 'smart_response',
    description:
      'Generate personalized, context-aware responses based on user behavior and preferences',
    inputSchema: z.object({
      telegramUserId: z.string().describe('Telegram user ID'),
      message: z.string().describe('User message'),
      intent: z.string().describe('Detected intent type'),
      conversationHistory: z
        .array(
          z.object({
            role: z.string(),
            content: z.string(),
            timestamp: z.number(),
          }),
        )
        .optional()
        .describe('Recent conversation history'),
    }),
    execute: async (params: any) => {
      const {
        telegramUserId,
        message,
        intent,
        conversationHistory = [],
      } = params;

      try {
        // Get user profile and behavior data
        const userProfile = await buildUserProfile(
          telegramUserId,
          userRepository,
          transactionRepository,
        );

        // Analyze message sentiment and urgency
        const messageAnalysis = analyzeMessage(message);

        // Generate personalized response
        const response = generatePersonalizedResponse(
          intent,
          userProfile,
          messageAnalysis,
          conversationHistory,
        );

        return {
          success: true,
          data: {
            response,
            userProfile: {
              experienceLevel: userProfile.experienceLevel,
              preferredTokens: userProfile.preferredTokens,
            },
            messageAnalysis,
            suggestions: generateSmartSuggestions(userProfile, intent),
          },
          error: null,
        };
      } catch (error) {
        return {
          success: false,
          data: null,
          error: `Failed to generate smart response: ${error.message}`,
        };
      }
    },
  });
};

async function buildUserProfile(
  telegramUserId: string,
  userRepository: any,
  transactionRepository: any,
): Promise<UserProfile> {
  try {
    const user = await userRepository.findOne({ telegramId: telegramUserId });

    if (!user) {
      return {
        preferredTokens: [],
        averageTransactionAmount: 0,
        frequentOperations: [],
        lastSeenAt: new Date(),
        experienceLevel: 'beginner',
      };
    }

    // Get user's recent transactions to understand preferences
    const recentTransactions = await transactionRepository
      .find({
        userId: user._id,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, // Last 30 days
      })
      .limit(50);

    // Analyze transaction patterns
    const tokenFrequency: { [key: string]: number } = {};
    const operationTypes: { [key: string]: number } = {};
    let totalAmount = 0;

    recentTransactions.forEach((tx: any) => {
      if (tx.token) {
        tokenFrequency[tx.token] = (tokenFrequency[tx.token] || 0) + 1;
      }

      if (tx.type) {
        operationTypes[tx.type] = (operationTypes[tx.type] || 0) + 1;
      }

      if (tx.amount) {
        totalAmount += parseFloat(tx.amount);
      }
    });

    // Determine experience level
    let experienceLevel: 'beginner' | 'intermediate' | 'advanced' = 'beginner';
    if (recentTransactions.length > 10) {
      experienceLevel = 'intermediate';
    }
    if (
      recentTransactions.length > 50 ||
      Object.keys(tokenFrequency).length > 3
    ) {
      experienceLevel = 'advanced';
    }

    return {
      preferredTokens: Object.entries(tokenFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([token]) => token),
      averageTransactionAmount:
        recentTransactions.length > 0
          ? totalAmount / recentTransactions.length
          : 0,
      frequentOperations: Object.entries(operationTypes)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([op]) => op),
      lastSeenAt: user.lastSeenAt || new Date(),
      experienceLevel,
    };
  } catch (error) {
    console.error('Error building user profile:', error);
    return {
      preferredTokens: [],
      averageTransactionAmount: 0,
      frequentOperations: [],
      lastSeenAt: new Date(),
      experienceLevel: 'beginner',
    };
  }
}

function analyzeMessage(message: string): {
  sentiment: 'positive' | 'neutral' | 'negative';
  urgency: 'low' | 'medium' | 'high';
  keywords: string[];
  hasNumbers: boolean;
  hasAddresses: boolean;
} {
  const lowerMessage = message.toLowerCase();

  // Sentiment analysis (basic)
  const positiveWords = [
    'good',
    'great',
    'excellent',
    'perfect',
    'awesome',
    'thanks',
    'thank you',
  ];
  const negativeWords = [
    'bad',
    'terrible',
    'error',
    'problem',
    'issue',
    'stuck',
    'help',
    'broken',
    'wrong',
  ];

  let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (positiveWords.some((word) => lowerMessage.includes(word))) {
    sentiment = 'positive';
  } else if (negativeWords.some((word) => lowerMessage.includes(word))) {
    sentiment = 'negative';
  }

  // Urgency analysis
  const urgentWords = [
    'urgent',
    'quickly',
    'asap',
    'emergency',
    'immediate',
    'now',
    'stuck',
    'help',
  ];
  const urgency: 'low' | 'medium' | 'high' = urgentWords.some((word) =>
    lowerMessage.includes(word),
  )
    ? 'high'
    : message.includes('?')
      ? 'medium'
      : 'low';

  // Extract keywords
  const cryptoKeywords = [
    'balance',
    'send',
    'transfer',
    'payment',
    'wallet',
    'usdc',
    'usdt',
    'dai',
    'mnt',
    'tokens',
  ];
  const keywords = cryptoKeywords.filter((keyword) =>
    lowerMessage.includes(keyword),
  );

  // Check for numbers and addresses
  const hasNumbers = /\d+/.test(message);
  const hasAddresses = /0x[a-fA-F0-9]{40}/.test(message);

  return {
    sentiment,
    urgency,
    keywords,
    hasNumbers,
    hasAddresses,
  };
}

function generatePersonalizedResponse(
  intent: string,
  userProfile: UserProfile,
  messageAnalysis: any,
  conversationHistory: any[],
): string {
  const { experienceLevel, preferredTokens } = userProfile;
  const { sentiment, urgency } = messageAnalysis;

  // Base responses by intent
  const baseResponses = {
    balance_check: {
      beginner: 'Let me check your wallet balance for you! 💰',
      intermediate: `Checking your balance${preferredTokens.length > 0 ? ` (I see you often use ${preferredTokens.join(', ')})` : ''}...`,
      advanced: 'Retrieving your current positions...',
    },
    send_tokens: {
      beginner:
        "I'll help you send tokens safely! Let me guide you through the process. 🔒",
      intermediate: `Ready to process your transfer${preferredTokens.length > 0 ? ` (${preferredTokens[0]} is your most used token)` : ''}.`,
      advanced: 'Preparing your transaction...',
    },
    payment_link: {
      beginner:
        "Great! Payment links are perfect for receiving payments. I'll walk you through creating one! 🔗",
      intermediate: "Let's create your payment link.",
      advanced: 'Initiating payment link generation...',
    },
  };

  let response =
    baseResponses[intent]?.[experienceLevel] ||
    baseResponses[intent]?.['beginner'] ||
    "I'm here to help!";

  // Adjust for sentiment
  if (sentiment === 'negative' && urgency === 'high') {
    response = `I understand you need help urgently! ${response}`;
  } else if (sentiment === 'positive') {
    response = `${response} 😊`;
  }

  // Add experience-based context
  if (experienceLevel === 'beginner') {
    response += "\n\n💡 New to crypto? I'll explain each step clearly!";
  } else if (experienceLevel === 'advanced' && conversationHistory.length > 5) {
    response += "\n\n⚡ I'll keep this concise since you're experienced.";
  }

  return response;
}

function generateSmartSuggestions(
  userProfile: UserProfile,
  intent: string,
): string[] {
  const { experienceLevel, preferredTokens, frequentOperations } = userProfile;

  const suggestions: string[] = [];

  // Intent-specific suggestions
  if (intent === 'balance_check') {
    if (preferredTokens.length > 0) {
      suggestions.push(`Check your ${preferredTokens[0]} specifically`);
    }
    suggestions.push('View transaction history');
    if (experienceLevel !== 'beginner') {
      suggestions.push('Set up price alerts');
    }
  } else if (intent === 'send_tokens') {
    if (preferredTokens.length > 0) {
      suggestions.push(`Send ${preferredTokens[0]} (your usual choice)`);
    }
    suggestions.push('Create a contact for frequent recipients');
    if (experienceLevel === 'advanced') {
      suggestions.push('Set up recurring transfers');
    }
  } else if (intent === 'payment_link') {
    suggestions.push('Create QR code for easy sharing');
    if (frequentOperations.includes('payment_received')) {
      suggestions.push('Set up template for repeat business');
    }
  }

  // Experience-level suggestions
  if (experienceLevel === 'beginner') {
    suggestions.push('Learn about wallet security');
  } else if (experienceLevel === 'intermediate') {
    suggestions.push('Explore advanced features');
  }

  return suggestions.slice(0, 3); // Limit to 3 suggestions
}
