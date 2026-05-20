---
name: btc-price
description: Fetch the current Bitcoin price. Use for BTC spot quotes and quick price checks.
disable-model-invocation: false
---

# Bitcoin Price

This skill is **path-promoted**: in Pi agent sessions this skill’s `scripts/` directory is on your **PATH**. Run **`btc-price`** by basename only (do not call `python3` with paths into this skill).

The CLI uses CoinGecko’s public API. No authentication is required.

## Commands

```bash
btc-price
btc-price --vs usd,eur,gbp
btc-price --json
```

Default output is a single line, for example: `BTC: $77,397.00 USD`.

## Raw API examples

Use these when you need a provider other than CoinGecko or want to inspect the full response.

### CoinGecko (multi-currency JSON)

```sh
curl -s 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp' | python3 -m json.tool
```

### CoinDesk (USD only, includes 24h details)

```sh
curl -s 'https://api.coindesk.com/v1/bpi/currentprice/USD.json' | python3 -c "
import sys, json
data = json.load(sys.stdin)
rate = data['bpi']['USD']['rate']
print(f'BTC/USD: {rate}')
"
```

### Multiple coins (CoinGecko)

```sh
curl -s 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,monero&vs_currencies=usd' | python3 -m json.tool
```
