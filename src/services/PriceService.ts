// src/services/PriceService.ts
import axios from 'axios';

export class PriceService {
  private static instance: PriceService;
  private solPrice: number = 100; // Fallback price
  private lastUpdate: number = 0;
  private readonly UPDATE_INTERVAL = 60000; // 1 minute

  private constructor() {}

  public static getInstance(): PriceService {
    if (!PriceService.instance) {
      PriceService.instance = new PriceService();
    }
    return PriceService.instance;
  }

  /**
   * Get current SOL price in USD
   * Returns cached price if recently updated.
   */
  public async getSolPrice(): Promise<number> {
    const now = Date.now();

    // Return cached price if recently updated
    if (now - this.lastUpdate < this.UPDATE_INTERVAL) {
      return this.solPrice;
    }

    try {
      await this.updateSolPrice();
    } catch (error) {
      console.warn('Failed to update SOL price, using cached value:', error);
    }
    return this.solPrice;
  }

  /**
   * Update SOL price from CoinGecko API
   */
  private async updateSolPrice(): Promise<void> {
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
        { timeout: 5000 }
      );
      if (response.data?.solana?.usd) {
        this.solPrice = response.data.solana.usd;
        this.lastUpdate = Date.now();
        console.log(`💰 Updated SOL price: $${this.solPrice}`);
      }
    } catch (error) {
      console.error('Error fetching SOL price:', error);
      throw error;
    }
  }

  /**
   * Get price with forced update (bypasses cache)
   */
  public async getSolPriceForced(): Promise<number> {
    await this.updateSolPrice();
    return this.solPrice;
  }
}