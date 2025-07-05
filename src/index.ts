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
  createMessage,
  createHoldersKeyboard,
  createHoldersMessage
} from './utils/helpers'; // Import utility functions
import { Datastream } from '@solana-tracker/data-api';
import express from 'express';
import fetch from 'node-fetch';
import { HolderInfo } from './types';
import { fetchTokenHolders } from './utils/holders-fetch';

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
  priceUsd: number;
  solVolume: number;
  volume: number;
  wallet: string;
  signature?: string; // <-- Add here
  txHash?: string;
  // Add other properties as needed based on the actual data structure
}

export class SolanaBuyBot {
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

        // priceUSD
        const priceUsd: number = trackerTransaction.priceUsd; // Assuming volume is in USD
        const marketCap: number = 1000000000 * priceUsd;

        // send request to https://fee-harvester-a945e42c10b3.herokuapp.com/notification?marketCap=31000 using express
        const notificationUrl = `https://fee-harvester-a945e42c10b3.herokuapp.com/notification?marketCap=${marketCap}`;
        fetch(notificationUrl)
          .then((response: { json: () => any; }) => response.json())
          .then((data: any) => {
            console.log(`Notification sent successfully: ${JSON.stringify(data)}`);
          })
          .catch((error: any) => {
            console.error(`Error sending notification: ${error}`);
          });

        // Process the transaction (e.g., send Telegram message)
        this.handleDexTrade(trackerTransaction);
      }
    });
  }

  private async handleDexTrade(transaction: SolanaTrackerTransaction): Promise<void> {
  try {
    // Extract relevant information from the transaction
    const { amount, wallet, solVolume, volume } = transaction;

    // Fetch SOL price
    const solPrice = 152; // this.priceService.getSolPrice();

    // Calculate USD value of the trade
    const amountInUsd = volume;

    // Ensure a minimum buy amount to trigger bot
    const MIN_BUY_USD = 100; // This can be moved to config
    if (amountInUsd < MIN_BUY_USD) {
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
    const lottery = percentChance(chance);

    const isWinner = lottery.result === "🏆 WINNER 🏆";

    const socialsKeyboard = createSocialsKeyboard(this.config.TOKEN_ADDRESS);

    if (isWinner) {
      // 1. Transfer winnings and get payout transaction hash
      console.log(`🏆 Winner found! Transferring ${jackpotValue.toFixed(3)} SOL to ${wallet}`);
      const payoutTxHash = await this.walletService.transferToWinner(jackpotValue, wallet) || '';

      // 2. Prepare winner message with payout hash
      const winnerMessage = createMessage({
        amount: formatAmountShort(amount),
        wallet,
        result: lottery.result,
        jackpotValue,
        jackpotValueUsd,
        nextJackpot,
        nextJackpotUsd,
        solAmount: solVolume,
        amountInUsd,
        chance,
        winningNumber: lottery.winningNumber,
        potOfSamples: lottery.potOfSamples,
        isWinner: true,
        txHash: payoutTxHash // <-- Use payout hash here!
      });

      // 3. Send winner gif/video first, then message
      const winnerMediaPath = './src/image/winnergif.mp4';
      if (fs.existsSync(winnerMediaPath)) {
        await this.bot.sendVideo(this.config.CHAT_ID, winnerMediaPath);
      }
      await this.bot.sendMessage(this.config.CHAT_ID, winnerMessage, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: socialsKeyboard
      });

    } else {
      // Prepare loser message (no txHash)
      const loserMessage = createMessage({
        amount: formatAmountShort(amount),
        wallet,
        result: lottery.result,
        jackpotValue,
        jackpotValueUsd,
        nextJackpot,
        nextJackpotUsd,
        solAmount: solVolume,
        amountInUsd,
        chance,
        winningNumber: lottery.winningNumber,
        potOfSamples: lottery.potOfSamples,
        isWinner: false
      });

      // Send loser gif/video first, then message
      const loserMediaPath = './src/image/losergif.mp4';
      if (fs.existsSync(loserMediaPath)) {
        await this.bot.sendVideo(this.config.CHAT_ID, loserMediaPath);
      }
      await this.bot.sendMessage(this.config.CHAT_ID, loserMessage, {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: socialsKeyboard
      });
    }
  } catch (error) {
    console.error(`Error handling DEX trade:`, error);
  }
}

  public async sendHoldersUI(chatId: string, holders: HolderInfo[]) {
  const holdersMediaPath = './src/image/winnergif.mp4';
  const winner = holders[0]; // Pick the winner (later, randomize this)
  const caption = createHoldersMessage(winner!);

  if (fs.existsSync(holdersMediaPath)) {
    await this.bot.sendVideo(chatId, holdersMediaPath, {
      caption,
      parse_mode: 'HTML',
      reply_markup: createHoldersKeyboard()
    });
  } else {
    await this.bot.sendMessage(chatId, caption, {
      parse_mode: 'HTML',
      reply_markup: createHoldersKeyboard()
    });
  }
}

  /**
   * Announce a random holder winner.
   * This function fetches token holders, picks a random one,
   * calculates their balance in SOL and USD, and sends a message.
   */
  public async announceRandomHolderWinner() {
    // const mint = this.config.TOKEN_ADDRESS;
    const mint = "FkzKwUfshdZN5kjq83h5XGPzsTmQcJvm7s7vRUPVMwk2";
    const holders = await fetchTokenHolders(mint);

    // Exclude addresses
    const excludedAddresses = [
      "11111111111111111111111111111111", // Example: Solana's "dead" address
      // this.config.TOKEN_ADDRESS,
      mint
      // ...add more as needed
    ];

    // Filter by minimum balance (example: 20,000,000,000,000 lamports = 20,000 tokens if 9 decimals)
    const minBalance = 20000000000000;
    const eligible = holders.filter(
      h => Number(h.amount) >= minBalance && !excludedAddresses.includes(h.owner)
    );

    if (!eligible.length) {
      await this.bot.sendMessage(this.config.CHAT_ID, 'No eligible holders found.');
      return;
    }

    // Pick a random winner
    const winnerRaw = eligible[Math.floor(Math.random() * eligible.length)]!;

    // Fetch SOL price
    const solPrice = await this.priceService.getSolPrice();

    // Get jackpot balance and value
    const jackpotBalance = await this.walletService.getJackpotBalance();
    const jackpotValue = jackpotBalance / 2;
    const jackpotValueUsd = jackpotValue * solPrice;

    // Winner's token balance (assuming 9 decimals)
    const winnerBalance = Number(winnerRaw.amount) / 1e9;
    const winnerBalanceUsd = winnerBalance * solPrice;

    // Transfer jackpot to winner and get tx hash
    const payoutTxHash = await this.walletService.transferToWinner(jackpotValue, winnerRaw.owner) || '';

    // Prepare winner info for UI
    const winner: HolderInfo = {
      rank: 1,
      wallet: winnerRaw.owner,
      balance: winnerBalance,
      balanceUsd: winnerBalanceUsd,
      txHash: payoutTxHash,
      wonAmount: jackpotValue,
      wonUsd: jackpotValueUsd,
      tokenSymbol: 'BB',
      wonSymbol: 'SOL'
    };

    await this.sendHoldersUI(this.config.CHAT_ID, [winner]);
}

  // Example: Add a command handler (if you use polling)
  public setupCommands() {
    this.bot.onText(/\/holders/, async (msg) => {
      const chatId = msg.chat.id;
      // Fetch holders data here (replace with real data)
      const holders: HolderInfo[] = [
        {
          rank: 1,
          wallet: '7Gk...9s2Q',
          balance: 90883.38,
          balanceUsd: 5622.3,
          txHash: 'EXAMPLETXHASH1',
          wonAmount: 0.738,
          wonUsd: 1839.85,
          tokenSymbol: 'BB',
          wonSymbol: 'SOL'
        }
        // ...more holders
      ];
      await this.sendHoldersUI(chatId.toString(), holders);
    });
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
