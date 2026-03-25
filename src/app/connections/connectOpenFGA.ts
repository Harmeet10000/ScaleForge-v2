import { CredentialsMethod, OpenFgaClient, ClientConfiguration } from '@openfga/sdk';

/**
 * Singleton instance to prevent multiple client initializations
 */
let instance: OpenFgaClient | null = null;

const createConfig = (): ClientConfiguration => {
  // Validate critical environment variables early
  const {
    OPENFGA_API_URL,
    OPENFGA_STORE_ID,
    OPENFGA_MODEL_ID,
    OPENFGA_API_TOKEN_ISSUER,
    OPENFGA_API_AUDIENCE,
    AUTH0_CLIENT_ID,
    AUTH0_CLIENT_SECRET
  } = process.env;

  if (!OPENFGA_API_URL || !OPENFGA_STORE_ID) {
    throw new Error('Missing critical OpenFGA configuration in environment variables.');
  }

  return {
    apiUrl: OPENFGA_API_URL,
    storeId: OPENFGA_STORE_ID,
    authorizationModelId: OPENFGA_MODEL_ID, // Optional: Can be overridden per call
    credentials: {
      method: CredentialsMethod.ClientCredentials,
      config: {
        apiTokenIssuer: OPENFGA_API_TOKEN_ISSUER!,
        apiAudience: OPENFGA_API_AUDIENCE!,
        clientId: AUTH0_CLIENT_ID!,
        clientSecret: AUTH0_CLIENT_SECRET!
      }
    }
  };
};

/**
 * Returns the existing OpenFGA client or initializes a new one.
 */
export const getFgaClient = (): OpenFgaClient => {
  if (!instance) {
    instance = new OpenFgaClient(createConfig());
  }
  return instance;
};

// Export the initialized singleton for immediate use
export const fgaClient = getFgaClient();
