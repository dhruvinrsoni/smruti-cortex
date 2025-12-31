/**
 * extractor.ts
 * Runs in page context as a content script. Extracts metadata and posts it to background.
 */

/* eslint-disable no-inner-declarations */
// ^ Functions intentionally nested inside conditional blocks to guard against double-injection

declare const browser: any;

// Check if URL should skip extraction (sensitive sites)
function isSensitiveUrl(url: string): boolean {
  const lowerUrl = url.toLowerCase();
  const hostname = new URL(url).hostname.toLowerCase();
  
  // Check against built-in patterns
  const SENSITIVE_PATTERNS = [
    'bank', 'banking', 'onlinebanking',
    'login', 'signin', 'signup', 'auth', 'authenticate', 'sso', 'oauth',
    '1password', 'lastpass', 'bitwarden', 'dashlane', 'keepass',
    'paypal', 'stripe', 'square', 'payment',
    'creditcard', 'debitcard', 'account/security', 'account/password',
  ];
  
  const SENSITIVE_DOMAINS = [
    'chase.com', 'bankofamerica.com', 'wellsfargo.com', 'citi.com', 'usbank.com',
    'capitalone.com', 'pnc.com', 'tdbank.com', 'ally.com',
    '1password.com', 'lastpass.com', 'bitwarden.com', 'dashlane.com', 'keeper.com',
    'paypal.com', 'stripe.com', 'square.com',
    'coinbase.com', 'binance.com', 'kraken.com',
  ];
  
  // Check patterns in URL
  for (const pattern of SENSITIVE_PATTERNS) {
    if (lowerUrl.includes(pattern)) {
      return true;
    }
  }
  
  // Check exact domain matches
  for (const domain of SENSITIVE_DOMAINS) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      return true;
    }
  }
  
  // Check user-defined blacklist (loaded from storage)
  // Note: This is checked asynchronously below
  return false;
}

// Only run in top-level frames
if ((window as any).top !== window) {
  // skip if inside iframe
  // console.log('[SmrutiCortex] extractor: iframe - skipping');
} else {
  (async function runExtractor() {
    try {
      const url = location.href;
      const runtime = (typeof browser !== 'undefined') ? browser.runtime : (typeof chrome !== 'undefined' ? chrome.runtime : null);
      
      // Check built-in sensitive site patterns first
      if (isSensitiveUrl(url)) {
        // console.log('[SmrutiCortex] Skipping sensitive URL:', url);
        return;
      }
      
      // Check user-defined blacklist from settings
      if (runtime && runtime.sendMessage) {
        try {
          // Request settings to check user blacklist
          const response = await new Promise<any>((resolve) => {
            runtime.sendMessage({ type: 'GET_SETTINGS' }, resolve);
          });
          
          if (response && response.settings && response.settings.sensitiveUrlBlacklist) {
            const blacklist: string[] = response.settings.sensitiveUrlBlacklist;
            const lowerUrl = url.toLowerCase();
            const hostname = new URL(url).hostname.toLowerCase();
            
            for (const pattern of blacklist) {
              const lowerPattern = pattern.toLowerCase().trim();
              if (!lowerPattern) {continue;}
              
              // Check if pattern matches URL or hostname
              if (lowerUrl.includes(lowerPattern) || hostname.includes(lowerPattern)) {
                // console.log('[SmrutiCortex] Skipping user-blacklisted URL:', url, 'pattern:', pattern);
                return;
              }
            }
          }
        } catch (err) {
          // If settings check fails, continue with extraction (fail open)
        }
      }
      const title = document.title || '';
      const canonicalEl = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
      const canonical = canonicalEl?.href || null;

      function getMeta(name: string) {
        const el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
        return el?.content ?? null;
      }

      function getMetaProperty(prop: string) {
        const el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
        return el?.content ?? null;
      }

      const metaDescription = getMeta('description') || getMetaProperty('og:description') || '';
      const metaKeywordsRaw = getMeta('keywords') || '';
      const metaKeywords = metaKeywordsRaw ? metaKeywordsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

      const ogTitle = getMetaProperty('og:title') || '';
      const ogImage = getMetaProperty('og:image') || '';

      // Build meta payload
      const payload = {
        url,
        title: ogTitle || title,
        canonical,
        metaDescription,
        metaKeywords,
        ogImage
      };

      // send to background (runtime already declared above)
      if (runtime && runtime.sendMessage) {
        runtime.sendMessage({ type: 'METADATA_CAPTURE', payload }, () => {
          // optional callback; ignore errors
        });
      }
    } catch (err) {
      // swallow errors inside page
    }
  })();
}