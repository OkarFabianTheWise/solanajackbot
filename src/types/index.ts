// src/types/index.ts
export interface Config {
  BOT_TOKEN: string;
  JACKPOT_PRIVATE_KEY: string;
  TOKEN_ADDRESS: string;
  CHAT_ID: string;
  USE_TESTNET: boolean;
  RPC_ENDPOINT: string;
  WS_ENDPOINT: string;
}

export interface BuyEventData {
  amount: string;
  wallet: string;
  result: string;
  jackpotValue: number;
  jackpotValueUsd: number;
  nextJackpot: number;
  nextJackpotUsd: number;
  solAmount: number;
  amountInUsd: number;
  chance: number;
  winningNumber: number;
  potOfSamples: number[];
  isWinner?: boolean;   // <-- add this
  txHash?: string;
}