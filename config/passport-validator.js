/**
 * OAuth Provider Credentials Validation Module
 *
 * This module validates that all required OAuth credentials are present
 * before initializing the passport strategies.
 */

const REQUIRED_CREDENTIALS = {
  facebook: {
    required: ['FACEBOOK_ID', 'FACEBOOK_SECRET'],
    optional: [],
  },
  github: {
    required: ['GITHUB_ID', 'GITHUB_SECRET'],
    optional: [],
  },
  x: {
    required: ['X_KEY', 'X_SECRET'],
    optional: [],
  },
  google: {
    required: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    optional: [],
  },
  linkedin: {
    required: ['LINKEDIN_ID', 'LINKEDIN_SECRET'],
    optional: [],
  },
  microsoft: {
    required: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    optional: [],
  },
  twitch: {
    required: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
    optional: [],
  },
  tumblr: {
    required: ['TUMBLR_KEY', 'TUMBLR_SECRET'],
    optional: [],
  },
  steam: {
    required: ['STEAM_KEY'],
    optional: [],
  },
  quickbooks: {
    required: ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET'],
    optional: [],
  },
  trakt: {
    required: ['TRAKT_ID', 'TRAKT_SECRET'],
    optional: [],
  },
  discord: {
    required: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
    optional: [],
  },
};

/**
 * Validate all OAuth credentials
 * @returns {Object} Validation results with status and missing credentials
 */
function validateOAuthCredentials() {
  const results = {
    valid: true,
    configuredProviders: [],
    missingCredentials: {},
    errors: [],
  };

  // Check BASE_URL is set (required for all OAuth callbacks)
  if (!process.env.BASE_URL) {
    results.valid = false;
    results.errors.push('BASE_URL environment variable is required for all OAuth providers');
  }

  // Validate each provider's credentials
  for (const [provider, config] of Object.entries(REQUIRED_CREDENTIALS)) {
    const missing = [];
    const found = [];

    // Check required credentials
    for (const credential of config.required) {
      if (!process.env[credential]) {
        missing.push(credential);
      } else {
        found.push(credential);
      }
    }

    // Check optional credentials (if they exist, they should have values)
    for (const credential of config.optional) {
      if (process.env[credential] && process.env[credential].trim() === '') {
        missing.push(credential);
      } else if (process.env[credential]) {
        found.push(credential);
      }
    }

    if (missing.length === 0 && found.length > 0) {
      results.configuredProviders.push(provider);
    } else if (missing.length > 0 && found.length > 0) {
      // Some credentials missing, some present - partial configuration
      results.valid = false;
      results.missingCredentials[provider] = missing;
      results.errors.push(`Provider '${provider}' is partially configured. Missing: ${missing.join(', ')}`);
    } else if (missing.length > 0 && found.length === 0) {
      // No credentials found for this provider
      results.missingCredentials[provider] = missing;
      // Not marking as invalid since some providers may be intentionally disabled
    }
  }

  return results;
}

/**
 * Ensure provider credentials are available at runtime
 * @param {string} providerName - The name of the OAuth provider
 * @returns {Object} Validation result with status and missing credentials
 */
function ensureProviderCredentials(providerName) {
  const credentialMap = {
    facebook: ['FACEBOOK_ID', 'FACEBOOK_SECRET'],
    github: ['GITHUB_ID', 'GITHUB_SECRET'],
    x: ['X_KEY', 'X_SECRET'],
    google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    linkedin: ['LINKEDIN_ID', 'LINKEDIN_SECRET'],
    microsoft: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
    twitch: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
    tumblr: ['TUMBLR_KEY', 'TUMBLR_SECRET'],
    steam: ['STEAM_KEY'],
    quickbooks: ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET'],
    trakt: ['TRAKT_ID', 'TRAKT_SECRET'],
    discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'],
  };

  const credentials = credentialMap[providerName];
  if (!credentials) {
    return { valid: false, error: `Unknown provider: ${providerName}` };
  }

  const missing = credentials.filter((cred) => !process.env[cred]);
  if (missing.length > 0) {
    return {
      valid: false,
      missing: missing,
      error: `Provider '${providerName}' is missing credentials: ${missing.join(', ')}`,
    };
  }

  return { valid: true };
}

/**
 * Log the current OAuth configuration status
 */
function logOAuthStatus() {
  const results = validateOAuthCredentials();

  console.log('\n🔐 OAuth Configuration Status:');
  console.log('═'.repeat(40));

  if (results.configuredProviders.length > 0) {
    console.log(`✅ Fully configured providers: ${results.configuredProviders.join(', ')}`);
  } else {
    console.log('⚠️  No OAuth providers are fully configured.');
  }

  if (Object.keys(results.missingCredentials).length > 0) {
    console.log('\n⚠️  Missing credentials for providers:');
    for (const [provider, missing] of Object.entries(results.missingCredentials)) {
      console.log(`   - ${provider}: ${missing.join(', ')}`);
    }
  }

  if (results.errors.length > 0) {
    console.log('\n❌ Errors:');
    results.errors.forEach((err) => console.log(`   - ${err}`));
  }

  console.log(`${'═'.repeat(40) }\n`);

  return results;
}

module.exports = {
  validateOAuthCredentials,
  ensureProviderCredentials,
  logOAuthStatus,
  REQUIRED_CREDENTIALS,
};
