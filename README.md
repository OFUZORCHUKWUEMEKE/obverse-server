# Obverse

> A stablecoin AI agent that helps merchants collect payments with links and QR codes directly from Telegram

Obverse is an intelligent payment assistant that simplifies cryptocurrency transactions for merchants. Built as a Telegram bot, it enables seamless payment collection through shareable links and QR codes, making crypto payments as easy as traditional payment methods.

## 🌟 Features

### 💰 Wallet Management
- **Automatic Wallet Creation**: Generates secure wallets for users via Para SDK
- **Multi-Token Support**: Supports MNT, USDC, USDT, and DAI
- **Balance Checking**: Real-time balance queries for all supported tokens
- **Transaction History**: View complete transaction history including native and token transfers

### 💸 Payment Processing
- **Payment Links**: Create shareable payment links with custom amounts
- **QR Code Generation**: Automatic QR code generation for easy mobile payments
- **Token Transfers**: Send cryptocurrencies directly through Telegram commands
- **Transaction Tracking**: Monitor payment status and confirmations

### 🤖 AI-Powered Assistant
- **Natural Language Processing**: Understands payment requests in conversational language
- **Smart Commands**: Intuitive command system for common operations
- **Interactive Responses**: Provides helpful guidance and error handling
- **Context Awareness**: Maintains conversation context for complex operations

### 🔗 Telegram Integration
- **Bot Commands**: Full command suite (`/start`, `/balance`, `/send`, `/payment`, etc.)
- **Inline Keyboards**: Interactive buttons for easy navigation
- **Group Support**: Works in both private chats and group conversations
- **Error Handling**: Comprehensive error messages and recovery suggestions

## 🛠 Technology Stack

- **Backend**: NestJS with TypeScript
- **Database**: MongoDB with Mongoose
- **Blockchain**: Mantle Network (EVM-compatible)
- **Wallet SDK**: Para SDK for secure wallet generation
- **Telegram**: node-telegram-bot-api
- **AI Framework**: Mastra for intelligent agent capabilities
- **Smart Contracts**: ethers.js and viem for blockchain interactions

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- MongoDB database
- Telegram Bot Token
- Para API Key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mantle
```

2. Install dependencies:
```bash
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Configure the following variables:
```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
ENABLE_TELEGRAM=true

# Para SDK Configuration
PARA_API_KEY=your_para_api_key
PARA_ENVIRONMENT=beta

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/obverse

# Server Configuration
PORT=4000
```

4. Start the development server:
```bash
pnpm run start:dev
```

## 📱 Usage

### Getting Started with the Bot

1. **Start the Bot**: Send `/start` to create your wallet
2. **Check Balance**: Use `/balance` or ask "What's my balance?"
3. **Send Tokens**: Use `/send <amount> <token> <address>`
4. **Create Payment Link**: Use `/payment` to start the payment link wizard
5. **View Transactions**: Use `/transactions` to see your payment history

### Available Commands

| Command | Description |
|---------|-------------|
| `/start` | Initialize wallet and start the bot |
| `/help` | Show available commands and features |
| `/wallet` | Display wallet information |
| `/balance` | Check wallet balance for all tokens |
| `/send` | Send cryptocurrency to another address |
| `/payment` | Create a payment link |
| `/transactions` | View transaction history |
| `/settings` | Configure bot preferences |

### Payment Link Creation

1. Use the `/payment` command
2. Specify the payment details:
   - **Name**: Description for the payment
   - **Token**: Choose from USDC, USDT, or DAI
   - **Amount**: Payment amount
   - **Details**: Optional additional information

3. Share the generated link with customers
4. Monitor payments through the bot

## 🏗 Project Structure

```
src/
├── config/           # Configuration management
├── core/             # Core utilities and base classes
├── mastra/           # AI agent and tools
│   ├── agents/       # Payment processing agents
│   └── tools/        # Blockchain interaction tools
├── para/             # Para SDK wallet integration
├── payment-link/     # Payment link management
├── telegram/         # Telegram bot handlers
├── transaction/      # Transaction processing
├── users/            # User management
└── wallet/           # Wallet operations
```

## 🔧 API Endpoints

The application provides RESTful APIs alongside the Telegram interface:

- `GET /api/docs` - Swagger API documentation
- `GET /payment-links` - List payment links
- `GET /transactions` - Transaction history
- `POST /wallets/balance` - Check wallet balance
- `POST /para/transfer` - Send tokens

## 🧪 Testing

Run the test suite:
```bash
# Unit tests
pnpm run test

# E2E tests
pnpm run test:e2e

# Test coverage
pnpm run test:cov
```

## 🔒 Security Features

- **Secure Wallet Generation**: Uses Para SDK's secure key management
- **Environment Isolation**: Separate configurations for development and production
- **Input Validation**: Comprehensive validation for all user inputs
- **Error Handling**: Secure error messages that don't expose sensitive information
- **Rate Limiting**: Built-in protection against abuse

## 🌐 Supported Networks

- **Primary**: Mantle Network (Chain ID: 5000)
- **Tokens**: MNT, USDC, USDT, DAI

## 📋 Roadmap

- [ ] Multi-chain support
- [ ] Fiat currency integration
- [ ] Advanced analytics dashboard
- [ ] Subscription-based payment links
- [ ] Mobile app companion
- [ ] Merchant dashboard

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 License

This project is licensed under the UNLICENSED License - see the package.json for details.

## 🆘 Support

For support and questions:
- Open an issue on GitHub
- Contact the development team

## 🙏 Acknowledgments

- [Para](https://getpara.com) for wallet infrastructure
- [Mantle Network](https://mantle.xyz) for blockchain platform
- [NestJS](https://nestjs.com) for the robust backend framework
- [Mastra](https://mastra.ai) for AI agent capabilities

---

Built with ❤️ for the future of cryptocurrency payments
