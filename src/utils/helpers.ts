// src/utils/helpers.ts
import TelegramBot from 'node-telegram-bot-api';
import { ParsedTransactionWithMeta } from '@solana/web3.js';
import { BuyEventData } from '../types';

/**
 * Calculate win probability based on USD amount
 */
export function calculateProbability(value: number): number {
  try {
    if (value > 97 && value < 200) return 1;
    if (value > 201 && value < 300) return 2;
    if (value > 301 && value < 400) return 3;
    if (value > 401 && value < 500) return 4;
    if (value > 501 && value < 600) return 5;
    if (value > 601 && value < 700) return 6;
    if (value > 701 && value < 800) return 7;
    if (value > 801 && value < 900) return 8;
    if (value > 901 && value < 1000) return 9;
    if (value >= 1000) return 10;
    return 2; // Default chance for smaller buys
  } catch (error) {
    console.error('Error in calculateProbability:', error);
    return 3;
  }
}

/**
 * Generate unique random numbers for lottery (1-100)
 */
export function generateUniqueRandomNumbers(count: number): number[] {
  try {
    const numbers = new Set<number>();
    while (numbers.size < count && numbers.size < 100) { // Limit to 100 possible numbers
      numbers.add(Math.floor(Math.random() * 100) + 1);
    }
    return Array.from(numbers).sort((a, b) => a - b); // Sort for consistent display
  } catch (error) {
    console.error('Error in generateUniqueRandomNumbers:', error);
    return [];
  }
}

/**
 * Check if player wins jackpot
 */
export function percentChance(percent: number): { result: string; winningNumber: number; potOfSamples: number[] } {
  try {
    const potOfSamples = generateUniqueRandomNumbers(percent);
    const winningNumber = Math.floor(Math.random() * 100) + 1;
    const result = potOfSamples.includes(winningNumber) ? "🏆 WINNER 🏆" : "🚫 You are not a winner";

    return { result, winningNumber, potOfSamples };
  } catch (error) {
    console.error('Error in percentChance:', error);
    return { result: "🚫 You are not a winner", winningNumber: 0, potOfSamples: [] };
  }
}

/**
 * Format large numbers with suffixes (e.g., 1.2m, 50k)
 */
export function formatAmountShort(amount: number): string {
  try {
    if (amount >= 1_000_000_000) {
      return `${(amount / 1_000_000_000).toFixed(1)}b`;
    } else if (amount >= 1_000_000) {
      return `${(amount / 1_000_000).toFixed(1)}m`;
    } else if (amount >= 1_000) {
      return `${(amount / 1_000).toFixed(0)}k`;
    } else {
      return amount.toFixed(1);
    }
  } catch (error) {
    console.error('Error formatting amount:', error);
    return amount.toString();
  }
}

/**
 * Create social media keyboard markup for Telegram
 */
export function createSocialsKeyboard(tokenAddress: string): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🌐 Website', url: 'https://www.blokbet.fun/' }, // Replace with actual project website
        { text: '🐦 Twitter', url: 'https://x.com/blokbet_sol' } // Replace with actual project Twitter
      ],
      [
        { text: '💬 Telegram', url: 'https://t.me/example' }, // Replace with actual project Telegram
        { text: '📊 Chart', url: 'https://dexscreener.com/solana/' + tokenAddress }
      ]
    ]
  };
}

/**
 * Create formatted message for Telegram
 */
export function createMessage(data: BuyEventData): string {
  // format data.wallet to 5 characters
  const formattedWallet = data.wallet.slice(0, 5) + '...' + data.wallet.slice(-5);
  return `🚀 New Play! <b>${data.amount} BlockBet tokens</b> were bought!\n
<b>${data.result}</b>
<b>👷 Player: <a href="https://solscan.io/account/${data.wallet}" target="_blank">${formattedWallet}</a></b>\n
🎰 Jackpot value: <b>${data.jackpotValue.toFixed(3)} SOL ($${data.jackpotValueUsd.toFixed(2)})</b>
⏳ Next jackpot: <b>${data.nextJackpot.toFixed(3)} SOL ($${data.nextJackpotUsd.toFixed(1)})</b>\n
💳 Buy amount: <b>${data.solAmount.toFixed(3)} SOL ($${data.amountInUsd.toFixed(1)})</b>
📊 Probability of win: <b>${data.chance}%</b>\n
🥏 <u>Winning Num: ${data.winningNumber}</u>
🎲 Pot: <b>[${data.potOfSamples.join(', ')}]</b>`;
}

/**
 * Find token transfers in a parsed transaction for a specific token mint.
 * This is a simplified example; robust parsing might require more complex logic
 * depending on how transfers are structured in different transaction types.
 */
export function findTokenTransfers(transaction: ParsedTransactionWithMeta, tokenAddress: string): any[] {
  const transfers: any[] = [];

  try {
    // Check for "parsed" instructions within innerInstructions, which are common for SPL token transfers
    if (transaction.meta?.innerInstructions) {
      for (const innerInstruction of transaction.meta.innerInstructions) {
        for (const instruction of innerInstruction.instructions) {
          if ('parsed' in instruction && instruction.program === 'spl-token') {
            const parsed = instruction.parsed;
            if (parsed.type === 'transfer' && parsed.info.mint === tokenAddress) {
              transfers.push({
                amount: parseFloat(parsed.info.amount),
                from: parsed.info.source,
                to: parsed.info.destination,
                authority: parsed.info.authority // This is typically the buyer/sender in a buy
              });
            } else if (parsed.type === 'transferChecked' && parsed.info.mint === tokenAddress) {
              // Handle transferChecked if it's used
              transfers.push({
                amount: parseFloat(parsed.info.tokenAmount.amount), // Use tokenAmount for transferChecked
                from: parsed.info.source,
                to: parsed.info.destination,
                authority: parsed.info.authority
              });
            }
          }
        }
      }
    }

    // Also check for top-level instructions if they are direct SPL transfers
    if (transaction.transaction.message.instructions) {
      for (const instruction of transaction.transaction.message.instructions) {
        if ('parsed' in instruction && instruction.program === 'spl-token') {
          const parsed = instruction.parsed;
          if (parsed.type === 'transfer' && parsed.info.mint === tokenAddress) {
            transfers.push({
              amount: parseFloat(parsed.info.amount),
              from: parsed.info.source,
              to: parsed.info.destination,
              authority: parsed.info.authority
            });
          } else if (parsed.type === 'transferChecked' && parsed.info.mint === tokenAddress) {
            transfers.push({
              amount: parseFloat(parsed.info.tokenAmount.amount),
              from: parsed.info.source,
              to: parsed.info.destination,
              authority: parsed.info.authority
            });
          }
        }
      }
    }
  } catch (error) {
    console.error('Error finding token transfers:', error);
  }
  return transfers;
}
