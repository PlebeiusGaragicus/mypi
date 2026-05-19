# Congress.gov API reference (v3)

Official docs: [api.congress.gov](https://api.congress.gov/) · [GitHub Documentation](https://github.com/LibraryOfCongress/api.congress.gov/tree/main/Documentation)

Base URL: `https://api.congress.gov/v3/` · Auth header: `x-api-key` · Format: `format=json`

## Common paths

| Goal | Path (after `/v3/`) |
|------|---------------------|
| Current congress | `congress/current` |
| List bills | `bill/{congress}` or `bill/{congress}/{type}` |
| One bill | `bill/{congress}/{type}/{number}` |
| Bill summaries | `.../summaries` |
| Bill actions | `.../actions` |
| Bill cosponsors | `.../cosponsors` |
| CRS summaries feed | `summaries/{congress}` or `summaries/{congress}/{type}` |
| Members in congress | `member/congress/{congress}` |
| Members by state | `member/{state}` or `member/{state}/{district}` |
| One member | `member/{bioguideId}` |

## Bill types (URL segment, lowercase)

| Code | Meaning |
|------|---------|
| `hr` | House bill |
| `s` | Senate bill |
| `hjres` | House joint resolution |
| `sjres` | Senate joint resolution |
| `hconres` | House concurrent resolution |
| `sconres` | Senate concurrent resolution |
| `hres` | House simple resolution |
| `sres` | Senate simple resolution |

## Query parameters

| Param | Use |
|-------|-----|
| `limit` | Page size (max 250) |
| `offset` | Start index |
| `fromDateTime` | Filter updates from (`YYYY-MM-DDT00:00:00Z`) |
| `toDateTime` | Filter updates to |
| `sort` | On summaries: `updateDate+asc` or `updateDate+desc` |

## Pagination

Responses include `pagination.count` and `pagination.next` (full URL). `congress-api --max-pages` and `congress-search --max-pages` follow `next` with a short delay between requests.

## Limits

- 5,000 requests per hour per API key
- No site-wide keyword search — use list endpoints + `--keyword` client filter, or `congress-search summaries` for CRS text
