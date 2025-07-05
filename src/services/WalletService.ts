// src/services/WalletService.ts
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import bs58 from 'bs58';

export class WalletService {
  private connection: Connection;
  private jackpotKeypair: Keypair;
  private holdersJackpotKeypair: Keypair;

  constructor(connection: Connection, privateKey: string, holdersPrivateKey: string) {
    this.connection = connection;

    try {
      // Decode private key from base58 or array format
      let privateKeyBytes: Uint8Array;
      let holdersPrivateKeyBytes: Uint8Array;

      // Process main jackpot private key
      if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
        // Array format: [1,2,3,...]
        const keyArray = JSON.parse(privateKey);
        privateKeyBytes = new Uint8Array(keyArray);
      } else {
        // Base58 format
        privateKeyBytes = bs58.decode(privateKey);
      }

      // Process holders jackpot private key
      if (holdersPrivateKey.startsWith('[') && holdersPrivateKey.endsWith(']')) {
        // Array format: [1,2,3,...]
        const keyArray = JSON.parse(holdersPrivateKey);
        holdersPrivateKeyBytes = new Uint8Array(keyArray);
      } else {
        // Base58 format
        holdersPrivateKeyBytes = bs58.decode(holdersPrivateKey);
      }

      this.jackpotKeypair = Keypair.fromSecretKey(privateKeyBytes);
      this.holdersJackpotKeypair = Keypair.fromSecretKey(holdersPrivateKeyBytes);
      
      console.log(`🔑 Jackpot wallet: ${this.jackpotKeypair.publicKey.toString()}`);
      console.log(`🔑 Holders jackpot wallet: ${this.holdersJackpotKeypair.publicKey.toString()}`);
    } catch (error) {
      console.error('❌ Failed to load jackpot wallets:', error);
      throw new Error('Invalid private key format. Ensure both keys are base58 or array string.');
    }
  }

  /**
   * Get jackpot wallet balance in SOL
   */
  public async getJackpotBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.jackpotKeypair.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting jackpot balance:', error);
      return 0;
    }
  }

  /**
   * Get holder's jackpot wallet balance in SOL
   */
  public async getHoldersJackpotBalance(): Promise<number> {
    try {
      const balance = await this.connection.getBalance(this.holdersJackpotKeypair.publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      console.error('Error getting jackpot balance:', error);
      return 0;
    }
  }

  /**
   * Get jackpot wallet address
   */
  public getJackpotAddress(): string {
    return this.jackpotKeypair.publicKey.toString();
  }

  /**
   * Get holders jackpot wallet address
   */
  public getHoldersJackpotAddress(): string {
    return this.holdersJackpotKeypair.publicKey.toString();
  }

  /**
   * Transfer SOL to winner
   * @param amount The amount of SOL to transfer.
   * @param winnerAddress The public key string of the winner.
   * @returns The transaction signature if successful, otherwise null.
   */
  public async transferToWinner(amount: number, winnerAddress: string): Promise<string | null> {
    try {
      if (!WalletService.isValidSolanaAddress(winnerAddress)) {
        console.error(`❌ Invalid winner address: ${winnerAddress}`);
        return null;
      }
      const winnerPubkey = new PublicKey(winnerAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Check if we have enough balance
      const currentBalance = await this.getJackpotBalance();
      if (currentBalance < amount) {
        console.error(`❌ Insufficient balance in jackpot wallet: ${currentBalance.toFixed(5)} SOL (needed: ${amount.toFixed(5)} SOL)`);
        return null;
      }

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.jackpotKeypair.publicKey,
          toPubkey: winnerPubkey,
          lamports: lamports,
        })
      );

      // Get recent blockhash and set fee payer
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.jackpotKeypair.publicKey;

      // Sign and send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.jackpotKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed', // Check simulation before sending
        }
      );

      console.log(`✅ Transfer successful: ${signature}`);
      console.log(`💰 Sent ${amount.toFixed(5)} SOL to ${winnerAddress}`);

      return signature;
    } catch (error) {
      console.error('🚨 Transfer error:', error);
      // More detailed error logging for common Solana issues
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          console.error('Hint: Jackpot wallet has insufficient SOL for the transfer + transaction fee.');
        } else if (error.message.includes('Transaction simulation failed')) {
          console.error('Hint: Transaction simulation failed, check network or recipient address.');
        }
      }
      return null;
    }
  }

  /**
   * Transfer SOL to holder winner from holders jackpot
   * @param amount The amount of SOL to transfer.
   * @param winnerAddress The public key string of the winner.
   * @returns The transaction signature if successful, otherwise null.
   */
  public async transferToHolderWinner(amount: number, winnerAddress: string): Promise<string | null> {
    try {
      if (!WalletService.isValidSolanaAddress(winnerAddress)) {
        console.error(`❌ Invalid winner address: ${winnerAddress}`);
        return null;
      }
      const winnerPubkey = new PublicKey(winnerAddress);
      const lamports = Math.floor(amount * LAMPORTS_PER_SOL);

      // Check if we have enough balance in holders jackpot
      const currentBalance = await this.getHoldersJackpotBalance();
      if (currentBalance < amount) {
        console.error(`❌ Insufficient balance in holders jackpot wallet: ${currentBalance.toFixed(5)} SOL (needed: ${amount.toFixed(5)} SOL)`);
        return null;
      }

      // Create transfer transaction
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.holdersJackpotKeypair.publicKey,
          toPubkey: winnerPubkey,
          lamports: lamports,
        })
      );

      // Get recent blockhash and set fee payer
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = this.holdersJackpotKeypair.publicKey;

      // Sign and send transaction
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.holdersJackpotKeypair],
        {
          commitment: 'confirmed',
          preflightCommitment: 'confirmed', // Check simulation before sending
        }
      );

      console.log(`✅ Holders transfer successful: ${signature}`);
      console.log(`💰 Sent ${amount.toFixed(5)} SOL to ${winnerAddress} from holders jackpot`);

      return signature;
    } catch (error) {
      console.error('🚨 Holders transfer error:', error);
      // More detailed error logging for common Solana issues
      if (error instanceof Error) {
        if (error.message.includes('insufficient funds')) {
          console.error('Hint: Holders jackpot wallet has insufficient SOL for the transfer + transaction fee.');
        } else if (error.message.includes('Transaction simulation failed')) {
          console.error('Hint: Transaction simulation failed, check network or recipient address.');
        }
      }
      return null;
    }
  }

  /**
   * Estimate transaction fee (useful for advanced scenarios)
   */
  public async estimateTransferFee(): Promise<number> {
    try {
      // Create a dummy transaction to estimate fee
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.jackpotKeypair.publicKey,
          toPubkey: this.jackpotKeypair.publicKey, // Self transfer for estimation
          lamports: LAMPORTS_PER_SOL, // Dummy amount
        })
      );
      const fee = await this.connection.getFeeForMessage(
        transaction.compileMessage(),
        'confirmed'
      );
      return fee.value ? fee.value / LAMPORTS_PER_SOL : 0.000005; // Fallback fee
    } catch (error) {
      console.error('Error estimating fee:', error);
      return 0.000005; // Default Solana transaction fee
    }
  }

  /**
   * Validate if an address is a valid Solana public key
   */
  public static isValidSolanaAddress(address: string): boolean {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
}