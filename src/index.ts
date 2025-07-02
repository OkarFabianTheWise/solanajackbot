// src/index.ts
import TelegramBot from 'node-telegram-bot-api';
import { Connection, PublicKey } from '@solana/web3.js'; // Import Logs type
import dotenv from 'dotenv';
import * as fs from 'fs';
import { PriceService } from './services/PriceService';
import { WalletService } from './services/WalletService';
import { Config } from './types'; // Import the Config interface
import {
  calculateProbability,
  percentChance,
  formatAmountShort,
  createSocialsKeyboard,
  createMessage
} from './utils/helpers'; // Import utility functions
import { Datastream } from '@solana-tracker/data-api';
import express from 'express';

// Load environment variables
dotenv.config();

// Start Express server for Heroku

const app = express();
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Define a type for the Solana Tracker transaction data
interface SolanaTrackerTransaction {
  type: string;
  amount: number;
  solVolume: number;
  volume: number;
  wallet: string;
  // Add other properties as needed based on the actual data structure
}

class SolanaBuyBot {
  private bot: TelegramBot;
  private connection: Connection;
  private config: Config;
  private tokenMint: PublicKey;
  private isRunning: boolean = false;
  private subscriptionId: number | null = null; // To store the WebSocket subscription ID
  private processedSignatures: Set<string> = new Set(); // To keep track of processed signatures
  private priceService: PriceService;
  private walletService: WalletService;
  private dataStream: Datastream;

  constructor() {
    // Load configuration
    this.config = {
      BOT_TOKEN: process.env.BOT_TOKEN || '',
      JACKPOT_PRIVATE_KEY: process.env.JACKPOT_PRIVATE_KEY || '',
      TOKEN_ADDRESS: process.env.TOKEN_ADDRESS || '',
      CHAT_ID: process.env.CHAT_ID || '',
      USE_TESTNET: process.env.USE_TESTNET === 'true',
      RPC_ENDPOINT: 'https://api.mainnet-beta.solana.com',
      WS_ENDPOINT: process.env.WS_ENDPOINT || ''
    };

    // Validate essential configurations
    if (!this.config.BOT_TOKEN) {
      throw new Error('BOT_TOKEN is not set in environment variables.');
    }
    if (!this.config.JACKPOT_PRIVATE_KEY) {
      throw new Error('JACKPOT_PRIVATE_KEY is not set in environment variables.');
    }
    if (!this.config.TOKEN_ADDRESS) {
      throw new Error('TOKEN_ADDRESS is not set in environment variables.');
    }
    if (!this.config.CHAT_ID) {
      throw new Error('CHAT_ID is not set in environment variables.');
    }

    // Initialize Telegram bot
    this.bot = new TelegramBot(this.config.BOT_TOKEN, { polling: false });

    // Initialize Solana connection with WebSocket support
    this.connection = new Connection(this.config.RPC_ENDPOINT, 'confirmed');

    // Initialize Solana Tracker data stream
    this.dataStream = new Datastream({
      wsUrl: this.config.WS_ENDPOINT
    });

    console.log('Connecting to Solana Tracker data stream...');

    this.dataStream.on('connected', () => console.log('Connected to Solana Tracker data stream'));
    this.dataStream.on('disconnected', (type: string) => console.log(`Disconnected: ${type}`));
    this.dataStream.on('reconnecting', (attempt: number) => console.log(`Reconnecting... attempt ${attempt}`));
    this.dataStream.on('error', (err: Error) => console.error('WebSocket Error:', err));

    // Initialize token mint
    this.tokenMint = new PublicKey(this.config.TOKEN_ADDRESS);

    // Initialize services
    this.priceService = PriceService.getInstance();
    this.walletService = new WalletService(this.connection, this.config.JACKPOT_PRIVATE_KEY);

    console.log(`🚀 Solana Buy Bot initialized`);
    console.log(`📡 RPC: ${this.config.RPC_ENDPOINT}`);
    console.log(`🪙 Token: ${this.config.TOKEN_ADDRESS}`);
    console.log(`🔑 Jackpot Wallet: ${this.walletService.getJackpotAddress()}`);
  }

  /**
   * Monitor for new transactions using Solana Tracker data stream.
   */
  private monitorTransactions(): void {
    console.log('Listening for token transactions...');

    // Subscribe to token transactions
    this.dataStream.subscribe.tx.token(this.config.TOKEN_ADDRESS).on((transaction: any) => {
      if (transaction.type === 'buy') {
        // Cast the transaction to the SolanaTrackerTransaction type
        const trackerTransaction = transaction as SolanaTrackerTransaction;

        // const solVolume = trackerTransaction.solVolume;
        // const volume = trackerTransaction.volume;
        // const wallet = trackerTransaction.wallet;

        // console.log(`Buy Transaction:`);
        // console.log(`Amount: ${trackerTransaction.amount}`);
        // console.log(`  Wallet: ${wallet}`);
        // console.log(`  SOL Volume: ${solVolume}`);
        // console.log(`  USDC Volume: ${volume}`);

        // Process the transaction (e.g., send Telegram message)
        this.handleDexTrade(trackerTransaction);
      }
    });
  }

  private async handleDexTrade(transaction: SolanaTrackerTransaction): Promise<void> {
    try {
      // Extract relevant information from the transaction
      const { amount, wallet, solVolume, volume } = transaction;
      // console.log(`Processing dextrade for ${wallet} ,  SOL Volume: ${solVolume}, USDC Volume: ${volume}`);

      // Fetch SOL price
      const solPrice = 152; // this.priceService.getSolPrice();

      // Calculate USD value of the trade
      const amountInUsd = volume;

      // Ensure a minimum buy amount to trigger bot
      const MIN_BUY_USD = 100; // This can be moved to config
      if (amountInUsd < MIN_BUY_USD) {
        // console.log(`Skipping small transaction: $${amountInUsd.toFixed(2)} (below $${MIN_BUY_USD})`);
        return;
      }

      // Get jackpot information from WalletService
      const jackpotBalance = await this.walletService.getJackpotBalance();
      const jackpotValue = jackpotBalance / 2;
      const jackpotValueUsd = jackpotValue * solPrice;
      const nextJackpot = jackpotBalance / 4;
      const nextJackpotUsd = nextJackpot * solPrice;

      // Calculate winning probability using helpers
      const chance = calculateProbability(amountInUsd);
      // console.log(`Calculated chance: ${chance}% for transaction of $${amountInUsd.toFixed(2)}`);
      const lottery = percentChance(chance);
      // console.log(`Lottery result: ${lottery.result} with winning number ${lottery.winningNumber}`);

      // Prepare message
      const message = createMessage({
        amount: formatAmountShort(amount), // Use solVolume for amount
        wallet,
        result: lottery.result,
        jackpotValue,
        jackpotValueUsd,
        nextJackpot,
        nextJackpotUsd,
        solAmount: solVolume, // Use solVolume for solAmount
        amountInUsd,
        chance,
        winningNumber: lottery.winningNumber,
        potOfSamples: lottery.potOfSamples
      });

      // Send message with photo
      const isWinner = lottery.result === "🏆 WINNER 🏆";
      const mediaPath = isWinner
        ? './src/image/winnergif.mp4'
        : './src/image/losergif.mp4';

      const socialsKeyboard = createSocialsKeyboard(this.config.TOKEN_ADDRESS);

      // if (fs.existsSync(photoPath)) {
      //   await this.bot.sendPhoto(this.config.CHAT_ID, photoPath, {
      //     caption: message,
      //     parse_mode: 'HTML',
      //     reply_markup: socialsKeyboard
      //   });
      // } else {
      //   await this.bot.sendMessage(this.config.CHAT_ID, message, {
      //     parse_mode: 'HTML',
      //     disable_web_page_preview: true,
      //     reply_markup: socialsKeyboard
      //   });
      // }

      if (fs.existsSync(mediaPath)) {
        await this.bot.sendVideo(this.config.CHAT_ID, mediaPath, {
          caption: message,
          parse_mode: 'HTML',
          reply_markup: socialsKeyboard
        });
      } else {
        await this.bot.sendMessage(this.config.CHAT_ID, message, {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: socialsKeyboard
        });
      }

      // Transfer winnings if winner
      if (isWinner) {
        console.log(`🏆 Winner found! Transferring ${jackpotValue.toFixed(3)} SOL to ${wallet}`); // Use wallet for winner address
        await this.walletService.transferToWinner(jackpotValue, wallet); // Use wallet for winner address
      }
    } catch (error) {
      console.error(`Error handling DEX trade:`, error);
    }
  }

  /**
   * Start the bot
   */
  public async start(): Promise<void> {
    try {
      console.log('🚀 Starting Solana Buy Bot...');

      // Test connection
      const version = await this.connection.getVersion();
      console.log(`✅ Connected to Solana RPC: ${version['solana-core']}`);

      // Initial SOL price fetch
      // await this.priceService.getSolPriceForced();

      // Connect to Solana Tracker
      this.dataStream.connect();

      this.isRunning = true;
      this.monitorTransactions();
    } catch (error) {
      console.error('❌ Failed to start bot:', error);
      process.exit(1); // Exit if the bot cannot start
    }
  }

  /**
   * Stop the bot
   */
  public stop(): void {
    console.log('🛑 Stopping Solana Buy Bot...');
    this.isRunning = false;

    // Disconnect from Solana Tracker
    this.dataStream.disconnect();
  }
}

// Main execution
async function main() {
  const bot = new SolanaBuyBot();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Received SIGINT, shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n👋 Received SIGTERM, shutting down gracefully...');
    bot.stop();
    process.exit(0);
  });

  await bot.start();
}

// Run the bot
if (require.main === module) {
  main().catch(console.error);
}

// export default SolanaBuyBot;
