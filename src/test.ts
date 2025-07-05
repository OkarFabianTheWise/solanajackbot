import { SolanaBuyBot } from './index';

// Make sure these are set to your real values or use dotenv
process.env.BOT_TOKEN = '';
process.env.CHAT_ID = '';
process.env.JACKPOT_PRIVATE_KEY = '';
process.env.USE_TESTNET = 'true';
process.env.RPC_ENDPOINT = 'https://api.devnet.solana.com';
process.env.WS_ENDPOINT = 'wss://api.devnet.solana.com';

async function main() {
  const bot = new SolanaBuyBot();

  // Example holders array for sendHoldersUI
  const holders = [{
    rank: 1,
    wallet: 'holder1',
    balance: 100,
    balanceUsd: 1000,
    txHash: 'FAKE_TX_HASH',
    wonAmount: 5,
    wonUsd: 500,
    tokenSymbol: 'BB',
    wonSymbol: 'SOL'
  }];

  // This will send a real message/video to your Telegram chat
  await bot.sendHoldersUI(process.env.CHAT_ID!, holders);

  // Or, to test the full winner announcement flow:
  // await bot.announceRandomHolderWinner();
}

// async function main() {
//   const bot = new SolanaBuyBot();

//   // To test the full winner announcement flow:
//   await bot.announceRandomHolderWinner();
// }

main().catch(console.error);