const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const DEFAULT_CONFIG = {
  allowedNetworks: [
    'mainnet', 'sepolia', 'holesky'
  ],
  skipRoutes: ['/', '/docs', '/favicon.ico'],
  strictRoutes: ['/rasterize'],
  enableLogging: true,
  logSecurityEvents: true
};

function createUniversalValidation(config = {}) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  return (req, res, next) => {
    try {
      const errors = [];
      const params = req.body || {};
      
      if (finalConfig.enableLogging) {
        console.log(`[SECURITY] Request to ${req.path}:`, {
          params: Object.keys(params).length > 0 ? params : undefined,
          ip: req.ip,
          method: req.method
        });
      }

      // Security validation for networkName
      if (params.networkName) {
        const networkName = params.networkName;
        
        if (typeof networkName !== 'string') {
          errors.push('Network name must be a string');
        } else if (containsHTMLInjection(networkName)) {
          errors.push('Network name contains dangerous characters');
        } else if (!/^[a-zA-Z0-9-]+$/.test(networkName)) {
          errors.push('Network name contains invalid characters');
        } else if (networkName.length > 20) {
          errors.push('Network name too long');
        } else if (!finalConfig.allowedNetworks?.includes(networkName.toLowerCase())) {
          errors.push(`Unsupported network: ${networkName}`);
        }
      }

      // Security validation for contractAddress
      if (params.contractAddress) {
        const contractAddress = params.contractAddress;
        
        if (typeof contractAddress !== 'string') {
          errors.push('Contract address must be a string');
        } else if (containsHTMLInjection(contractAddress)) {
          errors.push('Contract address contains dangerous characters');
        } else if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
          errors.push('Invalid contract address format');
        }
      }

      // Security validation for tokenId
      if (params.tokenId) {
        const tokenId = params.tokenId;
        
        if (typeof tokenId !== 'string') {
          errors.push('Token ID must be a string');
        } else if (tokenId.length > 255) {
          errors.push('Token ID too long');
        } else if (!isSafeTokenOrName(tokenId)) {
          errors.push('Token ID contains dangerous or invalid characters');
          if (finalConfig.logSecurityEvents) {
            console.warn(`[SECURITY] Blocked suspicious tokenId: "${tokenId}"`);
          }
        }
      }

      // Handle validation errors
      if (errors.length > 0) {
        if (finalConfig.logSecurityEvents) {
          console.warn('[SECURITY] BLOCKED malicious request:', {
            path: req.path,
            errors,
            params,
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
        }
        
        return res.status(400).json({
          error: 'Invalid request parameters',
          details: errors,
          path: req.path
        });
      }

      // Store normalized parameters
      req.validatedParams = {
        ...params,
        networkName: params.networkName?.toLowerCase(),
        contractAddress: params.contractAddress?.toLowerCase()
      };

      next();
    } catch (error) {
      console.error('[SECURITY] Validation middleware error:', error);
      return res.status(500).json({
        error: 'Internal validation error'
      });
    }
  };
}

function containsHTMLInjection(input) {
  if (input.includes('<') || input.includes('>') || input.includes('"') || input.includes("'")) {
    return true;
  }
  
  const dangerousPatterns = [
    /<[^>]*>/,
    /javascript:/i,
    /data:.*script/i,
    /on\w+\s*=/i,
    /&lt;|&gt;|&#60;|&#62;/,
    /["'`]\s*\/\s*>/,
    /<!--/,
    /%3[Cc]/,
    /%3[Ee]/,
    /[\x00-\x1f]/,
    /\\/,
    /&#/,
    /%[0-9a-fA-F]{2}/,
  ];
  
  return dangerousPatterns.some(pattern => pattern.test(input));
}

function isSafeTokenOrName(input) {
  if (/^\d+$/.test(input)) {
    return true;
  }
  
  if (input.length > 255) {
    return false;
  }
  
  try {
    const window = new JSDOM('').window;
    const purify = DOMPurify(window);
    const sanitized = purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    
    if (sanitized !== input) {
      return false;
    }
  } catch (error) {
    return false;
  }
  
  const dangerousPatterns = [
    /[<>'"]/,
    /javascript:/i,
    /data:/i,
    /on\w+\s*=/i,
    /&#/,
    /%[0-9a-fA-F]{2}/,
    /[\x00-\x1f]/,
  ];
  
  if (dangerousPatterns.some(pattern => pattern.test(input))) {
    return false;
  }
  
  return true;
}

module.exports = {
  createUniversalValidation,
  ValidationConfigs: {
    production: {
      allowedNetworks: ['mainnet', 'sepolia', 'holesky'],
      enableLogging: true,
      logSecurityEvents: true,
      strictRoutes: ['/rasterize']
    }
  }
};