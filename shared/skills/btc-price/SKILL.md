---
name: btc-price
description: Fetch the current Bitcoin price using public REST APIs. No API key required.
disable-model-invocation: false
---

# Bitcoin Price Check

Use these public endpoints to get the current BTC price. All are free, no authentication needed.

## CoinGecko (USD, EUR, GBP, etc.)

```sh
curl -s 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur,gbp' | python3 -m json.tool
```

Returns:

```json
{
    "bitcoin": {
        "usd": 84321.0,
        "eur": 78100.0,
        "gbp": 66500.0
    }
}
```

## CoinDesk (USD only, includes 24h details)

```sh
curl -s 'https://api.coindesk.com/v1/bpi/currentprice/USD.json' | python3 -c "
import sys, json
data = json.load(sys.stdin)
rate = data['bpi']['USD']['rate']
print(f'BTC/USD: {rate}')
"
```

## Compact one-liner (CoinGecko)

```sh
curl -s 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd' | python3 -c "import sys,json; print(f\"BTC: ${json.load(sys.stdin)['bitcoin']['usd']:,.2f} USD\")"
```

## Multiple coins at once

```sh
curl -s 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,monero&vs_currencies=usd' | python3 -m json.tool
```
