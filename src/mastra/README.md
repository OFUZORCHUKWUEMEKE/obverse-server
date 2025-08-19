# Telegram Crypto AI Agent with Mastra Integration

This module implements an AI agent that integrates with Mastra AI to provide intelligent cryptocurrency wallet operations through Telegram.

## Overview

The AI agent can:
- Check wallet balances (native tokens and ERC-20 tokens)
- Create payment links for cryptocurrency payments
- Process natural language requests from users
- Interface directly with Telegram for seamless user experience

## Architecture

### Core Components

1. **TelegramCryptoAgent** (`agents/payment.ts`)
   - Main agent class that integrates with Mastra AI
   - Handles natural language processing
   - Provides direct tool access methods

2. **Balance Tool** (`tools/balance-tool.ts`)
   - Implements `create_balance` function
   - Retrieves wallet balances by Telegram user ID or wallet address
   - Supports filtering by specific tokens

3. **Payment Link Tool** (`tools/payment-link-tool.ts`)
   - Implements `create_payment_links` function
   - Creates cryptocurrency payment links with QR codes
   - Supports USDC, USDT, and DAI tokens

4. **Mastra Service** (`mastra.service.ts`)
   - NestJS service that manages the AI agent
   - Provides high-level methods for Telegram integration
   - Handles agent initialization and error management

## Features

### Balance Checking
```typescript
// Direct tool execution
const balanceResult = await agent.executeBalanceCheck('telegram_user_id');

// Natural language processing
const response = await agent.processMessage(
  'What is my wallet balance?',
  'telegram_user_id',
  'chat_id'
);
```

### Payment Link Creation
```typescript
// Direct tool execution
const paymentResult = await agent.executePaymentLinkCreation(
  'telegram_user_id',
  'chat_id',
  'Coffee Purchase',
  'USDC',
  '5.50',
  { name: '', email: '' }
);

// Through natural language
const response = await agent.processMessage(
  'Create a payment link for $10 USDC',
  'telegram_user_id',
  'chat_id'
);
```

### Supported Tokens
- **Native**: ETH, MNT (Mantle)
- **ERC-20**: USDC, USDT, DAI

## Integration with Telegram

The agent is integrated into the Telegram message handler (`telegram/handlers/mesage-handler.ts`) to:

1. **Process Natural Language**: Users can type messages like "show my balance" or "create payment link"
2. **Smart Routing**: The system automatically determines whether to check balance or create payment links based on message content
3. **Fallback Support**: Falls back to existing MCP service if Mastra AI is unavailable
4. **Error Handling**: Provides user-friendly error messages

## Usage Examples

### User Interactions

**Balance Check**:
- User: "What's my balance?"
- Agent: Checks wallet and returns formatted balance information

**Payment Link Creation**:
- User: "I need a payment link for $25 USDC"
- Agent: Guides user through payment link creation or uses /payment command

**General Questions**:
- User: "How do I send crypto?"
- Agent: Provides helpful guidance about crypto operations

## Configuration

### Environment Variables
- Anthropic API key for Claude model access
- Telegram bot token
- Database connection settings

### Dependencies
- `@mastra/core`: AI agent framework
- `@ai-sdk/anthropic`: Claude AI integration
- `zod`: Schema validation
- `qrcode`: QR code generation

## Error Handling

The agent implements comprehensive error handling:
- Tool execution errors are caught and returned as structured responses
- Natural language processing errors fall back to existing services
- All errors are logged for debugging

## Testing

Run the test script to verify functionality:
```typescript
import { testAgent } from './test-agent';
testAgent();
```

## Security Considerations

- Never logs or exposes private keys or sensitive data
- Validates all inputs through Zod schemas
- Implements proper access controls through Telegram user authentication
- Uses secure QR code generation for payment links

## Future Enhancements

1. **Multi-language Support**: Extend to support multiple languages
2. **Advanced Analytics**: Add transaction history analysis
3. **DeFi Integration**: Support for DeFi protocols and yield farming
4. **Multi-chain Support**: Extend beyond Mantle to other blockchains
5. **Voice Interface**: Add voice command support through Telegram