import { Injectable, Logger } from '@nestjs/common';
import { createOffchainClient, ChainName } from '@thenamespace/offchain-manager';

@Injectable()
export class NamespaceService {
  private readonly logger = new Logger(NamespaceService.name);
  private client: any;

  constructor() {
    this.client = createOffchainClient({
      mode: 'mainnet',
      timeout: 5000,
      defaultApiKey: process.env.NAMESPACE_API_KEY || "ns-7692607f-f522-476f-9fe7-5fd535e0a900",
    });
  }

  async createUserSubdomain(
    username: string,
    walletAddress: string,
    userDetails?: { firstName?: string; lastName?: string }
  ): Promise<string> {
    try {
      const PARENT_NAME = 'obversecc.eth';

      // Sanitize username for ENS compatibility
      const sanitizedLabel = this.sanitizeUsername(username);
      const subdomain = `${sanitizedLabel}.${PARENT_NAME}`;

      // Check if subdomain is available
      const availability = await this.client.isSubnameAvailable(subdomain);
      if (!availability.isAvailable) {
        // Try with a random suffix if not available
        const randomSuffix = Math.floor(Math.random() * 10000);
        const fallbackLabel = `${sanitizedLabel}${randomSuffix}`;
        const fallbackSubdomain = `${fallbackLabel}.${PARENT_NAME}`;

        const fallbackAvailability = await this.client.isSubnameAvailable(fallbackSubdomain);
        if (!fallbackAvailability.isAvailable) {
          throw new Error('Unable to create a unique subdomain');
        }

        return await this.createSubname(fallbackLabel, walletAddress, userDetails);
      }

      return await this.createSubname(sanitizedLabel, walletAddress, userDetails);
    } catch (error) {
      this.logger.error('Error creating user subdomain:', error);
      throw error;
    }
  }

  private async createSubname(
    label: string,
    walletAddress: string,
    userDetails?: { firstName?: string; lastName?: string }
  ): Promise<string> {
    const PARENT_NAME = 'obversecc.eth';
    const subdomain = `${label}.${PARENT_NAME}`;

    try {
      await this.client.createSubname({
        label: label,
        parentName: PARENT_NAME,
        texts: [
          { key: 'name', value: userDetails?.firstName || label },
          { key: 'url', value: 'https://www.obverse.cc' },
          { key: 'avatar', value: `https://api.dicebear.com/7.x/personas/svg?seed=${label}` },
          ...(userDetails?.lastName ? [{ key: 'lastName', value: userDetails.lastName }] : []),
        ],
        addresses: [
          { chain: ChainName.Ethereum, value: walletAddress },
          { chain: ChainName.Base, value: walletAddress },
        ],
        owner: walletAddress,
        metadata: [
          { key: 'createdBy', value: 'obverse-telegram-bot' },
          { key: 'walletAddress', value: walletAddress },
          { key: 'timestamp', value: new Date().toISOString() },
        ],
      });

      this.logger.log(`Successfully created subdomain: ${subdomain} for wallet: ${walletAddress}`);
      return subdomain;
    } catch (error) {
      this.logger.error(`Error creating subname ${subdomain}:`, error);
      throw error;
    }
  }

  private sanitizeUsername(username: string): string {
    if (!username) {
      return `user${Math.floor(Math.random() * 10000)}`;
    }

    // Convert to lowercase and remove special characters
    let sanitized = username.toLowerCase()
      .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric characters
      .slice(0, 20); // Limit length

    // Ensure it starts with a letter
    if (!/^[a-z]/.test(sanitized)) {
      sanitized = `u${sanitized}`;
    }

    // Ensure minimum length
    if (sanitized.length < 3) {
      sanitized = `${sanitized}user${Math.floor(Math.random() * 1000)}`;
    }

    return sanitized;
  }

  async getSubdomainInfo(subdomain: string): Promise<any> {
    try {
      // Using the client to fetch subname information
      const subnames = await this.client.getFilteredSubnames({
        name: subdomain.split('.').slice(-2).join('.'), // Get parent domain
        owner: '', // We'll filter client-side
      });

      const targetSubname = subnames.find(sub =>
        sub.name === subdomain || `${sub.label}.${sub.parentName}` === subdomain
      );

      return targetSubname || null;
    } catch (error) {
      this.logger.error('Error fetching subdomain info:', error);
      return null;
    }
  }

  async isSubdomainAvailable(subdomain: string): Promise<boolean> {
    try {
      const availability = await this.client.isSubnameAvailable(subdomain);
      return availability.isAvailable;
    } catch (error) {
      this.logger.error('Error checking subdomain availability:', error);
      return false;
    }
  }
}