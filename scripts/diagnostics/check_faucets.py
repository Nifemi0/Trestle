import urllib.request, urllib.error, re, json
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
URLS = [
  # Arbitrum Sepolia specific
  "https://faucet.triangleplatform.com/arbitrum/sepolia",
  "https://www.alchemy.com/faucets/arbitrum-sepolia",
  "https://faucets.chain.link/arbitrum-sepolia",
  "https://faucet.quicknode.com/arbitrum/sepolia",
  "https://stakely.io/faucet/arbitrum-sepolia",
  "https://bwarelabs.com/faucets/arbitrum-sepolia",
  "https://www.l2faucet.com/arbitrum",
  "https://powfaucet.com/arbitrum-sepolia",
  # other remote-chain options (Hyperlane core is live on all of these)
  "https://console.optimism.io/faucet",
  "https://www.alchemy.com/faucets/base-sepolia",
  "https://faucet.quicknode.com/binance-smart-chain/bnb-testnet",
  "https://faucet.botchain.ai/basic",
]

def probe(u):
    try:
        req = urllib.request.Request(u, headers={"User-Agent": UA, "Accept": "text/html"})
        r = urllib.request.urlopen(req, timeout=25)
        html = r.read(120000).decode("utf-8", "ignore")
        low = html.lower()
        flags = []
        for k in ("captcha", "recaptcha", "hcaptcha", "cloudflare turnstile", "connect wallet",
                  "sign in", "log in", "github", "alchemy account", "discord", "twitter"):
            if k in low:
                flags.append(k)
        title = re.search(r"<title[^>]*>(.*?)</title>", html, re.S | re.I)
        return f"HTTP {r.status} | title={ (title.group(1).strip()[:60] if title else '-') } | auth-ish: {', '.join(flags[:5]) or 'none seen'}"
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}"
    except Exception as e:
        return f"ERR {type(e).__name__}: {e}"

for u in URLS:
    print(f"{u}\n    {probe(u)}\n")
