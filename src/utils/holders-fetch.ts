import fetch from "node-fetch";

const API_KEY = process.env.API_KEY;
const url = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;

export interface RawHolder {
  owner: string;
  amount: string;
}

export async function fetchTokenHolders(mint: string): Promise<RawHolder[]> {
  let page = 1;
  const holders: RawHolder[] = [];

  while (true) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "getTokenAccounts",
        id: "helius-test",
        params: { page, limit: 1000, displayOptions: {}, mint }
      }),
    });

    const data = (await response.json()) as {
      result?: { token_accounts: { owner: string; amount: string }[] }
    };
    if (!data.result || data.result.token_accounts.length === 0) break;

    data.result.token_accounts.forEach((account) => {
      holders.push({ owner: account.owner, amount: account.amount });
    });

    page++;
  }
  return holders;
}