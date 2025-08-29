import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';
import { CallbackHandler } from './handlers/callback.handler';
import { MessageHandler } from './handlers/mesage-handler';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private bot: TelegramBot;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => MessageHandler))
    private messageHandler: MessageHandler,
    @Inject(forwardRef(() => CallbackHandler))
    private callbackHandler: CallbackHandler,
  ) {}

  onModuleInit() {
    // Allow disabling Telegram bot via environment variable
    const enableTelegram =
      this.configService.get<string>('ENABLE_TELEGRAM') !== 'false';
    if (enableTelegram) {
      this.initializeBot();
    } else {
      this.logger.log('Telegram bot disabled via ENABLE_TELEGRAM=false');
    }
  }

  onModuleDestroy() {
    this.closeBot();
  }

  private async initializeBot() {
    try {
      const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

      if (!token) {
        this.logger.warn(
          'TELEGRAM_BOT_TOKEN is not configured. Telegram bot will not start.',
        );
        return;
      }

      this.logger.log('Initializing Telegram bot...');

      // Initialize bot with better error handling
      this.bot = new TelegramBot(token, {
        polling: {
          interval: 1000,
          autoStart: false,
          params: {
            timeout: 30,
          },
        },
        webHook: false,
      });

      // Set up enhanced error handling
      this.bot.on('error', (error) => {
        this.logger.error('Telegram bot error:', error);
        this.handleBotError(error);
      });

      this.bot.on('polling_error', (error) => {
        this.logger.error('Telegram polling error:', error);
        this.handlePollingError(error);
      });

      // Validate bot token first with timeout
      try {
        this.logger.log('Validating bot token...');
        const botInfo = (await Promise.race([
          this.bot.getMe(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Token validation timeout')),
              10000,
            ),
          ),
        ])) as any;
        this.logger.log(
          `Bot token validated. Bot info: @${botInfo.username} (${botInfo.first_name})`,
        );
      } catch (tokenError) {
        this.logger.error('Bot token validation failed:', tokenError.message);
        if (tokenError.message.includes('401')) {
          this.logger.error(
            '❌ Invalid bot token. Please check your TELEGRAM_BOT_TOKEN environment variable.',
          );
        } else if (tokenError.message.includes('timeout')) {
          this.logger.error(
            '❌ Network timeout. Please check your internet connection.',
          );
        }
        return;
      }

      // Set up handlers
      this.setupHandlers();

      // Start polling with retry mechanism
      await this.startPollingWithRetry();

      // Set bot commands
      await this.setBotCommands();
    } catch (error) {
      this.logger.error('Failed to initialize Telegram bot:', error.message);
      this.logger.error('Bot will not be available until this is resolved.');
    }
  }

  private async startPollingWithRetry(maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.log(
          `Starting Telegram bot polling (attempt ${attempt}/${maxRetries})...`,
        );
        await this.bot.startPolling();
        this.logger.log('✅ Telegram bot polling started successfully');
        return;
      } catch (error) {
        this.logger.error(`Polling attempt ${attempt} failed:`, error.message);
        if (attempt === maxRetries) {
          this.logger.error(
            '❌ All polling attempts failed. Bot will not receive messages.',
          );
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      }
    }
  }

  private handleBotError(error: any) {
    if (error.code === 'EFATAL' || error.message.includes('EFATAL')) {
      this.logger.error(
        'Fatal bot error detected. This usually indicates network issues.',
      );
      this.logger.error('Possible solutions:');
      this.logger.error('1. Check your internet connection');
      this.logger.error('2. Verify the bot token is valid');
      this.logger.error('3. Check if Telegram servers are accessible');
    }
  }

  private handlePollingError(error: any) {
    if (error.code === 'EFATAL' || error.message.includes('EFATAL')) {
      this.logger.error(
        'Fatal polling error detected. Attempting to restart polling...',
      );
      setTimeout(async () => {
        try {
          if (this.bot) {
            await this.bot.stopPolling();
            await this.startPollingWithRetry(1);
          }
        } catch (restartError) {
          this.logger.error('Failed to restart polling:', restartError.message);
        }
      }, 5000);
    }
  }

  private closeBot() {
    if (this.bot) {
      this.bot.stopPolling();
      this.logger.log('Telegram bot stopped');
    }
  }

  private setupHandlers() {
    // Handle all text messages
    this.bot.on('message', async (msg) => {
      try {
        await this.messageHandler.handleMessage(msg);
      } catch (error) {
        this.logger.error('Error handling message:', error);
        await this.sendErrorMessage(
          msg.chat.id,
          'Sorry, something went wrong. Please try again.',
        );
      }
    });

    // Handle callback queries (inline keyboard buttons)
    this.bot.on('callback_query', async (callbackQuery) => {
      try {
        await this.callbackHandler.handleCallback(callbackQuery);
      } catch (error) {
        this.logger.error('Error handling callback query:', error);
        await this.bot.answerCallbackQuery(callbackQuery.id, {
          text: 'Something went wrong. Please try again.',
          show_alert: true,
        });
      }
    });

    // Handle new chat members (bot added to group)
    this.bot.on('new_chat_members', async (msg) => {
      const newMembers = msg.new_chat_members || [];
      const botInfo = await this.bot.getMe();

      if (newMembers.some((member) => member.id === botInfo.id)) {
        await this.sendMessage(
          msg.chat.id,
          "🤖 Hello! I'm your crypto wallet assistant. I can help you manage your wallet, check balances, send payments, and create payment links.\n\n" +
            'Send me a message to get started!',
        );
      }
    });
  }

  private async setBotCommands() {
    try {
      const commands = [
        { command: 'start', description: 'Start the bot and create wallet' },
        { command: 'help', description: 'Show help information' },
        { command: 'wallet', description: 'Show wallet information' },
        { command: 'balance', description: 'Check wallet balance' },
        { command: 'transactions', description: 'View transaction history' },
        { command: 'send', description: 'Send cryptocurrency' },
        { command: 'payment', description: 'Create payment link' },
        { command: 'settings', description: 'Bot settings' },
      ];

      await this.bot.setMyCommands(commands);
      this.logger.log('Bot commands set successfully');
    } catch (error) {
      this.logger.error('Failed to set bot commands:', error);
    }
  }

  // Public methods for sending messages
  async sendMessage(chatId: number, text: string, options?: any) {
    try {
      return await this.bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...options,
      });
    } catch (error) {
      this.logger.error(`Failed to send message to chat ${chatId}:`, error);
      throw error;
    }
  }

  async sendPhoto(chatId: number, photo: string | Buffer, options?: any) {
    try {
      return await this.bot.sendPhoto(chatId, photo, options);
    } catch (error) {
      this.logger.error(`Failed to send photo to chat ${chatId}:`, error);
      throw error;
    }
  }

  async editMessage(
    chatId: number,
    messageId: number,
    text: string,
    options?: any,
  ) {
    try {
      return await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML',
        ...options,
      });
    } catch (error) {
      this.logger.error(
        `Failed to edit message ${messageId} in chat ${chatId}:`,
        error,
      );
      throw error;
    }
  }

  async sendErrorMessage(chatId: number, errorText: string) {
    const text = `❌ <b>Error</b>\n\n${errorText}`;
    return this.sendMessage(chatId, text);
  }

  async sendSuccessMessage(chatId: number, successText: string) {
    const text = `✅ <b>Success</b>\n\n${successText}`;
    return this.sendMessage(chatId, text);
  }

  async answerCallbackQuery(callbackQueryId: string, options?: any) {
    try {
      return await this.bot.answerCallbackQuery(callbackQueryId, options);
    } catch (error) {
      this.logger.error('Failed to answer callback query:', error);
      throw error;
    }
  }

  async deleteMessage(chatId: number, messageId: number) {
    try {
      return await this.bot.deleteMessage(chatId, messageId);
    } catch (error) {
      this.logger.error(
        `Failed to delete message ${messageId} in chat ${chatId}:`,
        error,
      );
      throw error;
    }
  }

  getBotInstance(): TelegramBot {
    return this.bot;
  }
}
