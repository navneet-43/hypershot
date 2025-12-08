import { db } from '../db';
import { snapchatAccounts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

/**
 * Snapchat OAuth Service for Marketing API / Public Profile API
 * 
 * IMPORTANT: This uses the Marketing API OAuth flow, NOT Login Kit!
 * 
 * PREREQUISITES:
 * 1. Create OAuth app via Business Dashboard at ads.snapchat.com (NOT Developer Portal)
 * 2. Go to Business Dashboard → Business Details → OAuth Apps
 * 3. Get OAuth Client ID and Secret from there
 * 4. Request allowlist access for Public Profile API from Snapchat (send client_id to your Snap contact)
 * 5. Set up environment variables:
 *    - SNAPCHAT_CLIENT_ID
 *    - SNAPCHAT_CLIENT_SECRET
 *    - SNAPCHAT_REDIRECT_URI (optional - auto-detected from domain)
 * 
 * DO NOT use the Developer Portal (kit.snapchat.com) - those credentials won't work!
 */

export class SnapchatOAuthService {
  // Snapchat Marketing API OAuth endpoints
  private static readonly AUTH_URL = 'https://accounts.snapchat.com/login/oauth2/authorize';
  private static readonly TOKEN_URL = 'https://accounts.snapchat.com/login/oauth2/access_token';
  private static readonly API_BASE_URL = 'https://adsapi.snapchat.com';
  
  // Marketing API scopes - both profile and marketing API access
  private static readonly SCOPE = 'snapchat-marketing-api snapchat-profile-api';

  /**
   * Generate a secure random state parameter for CSRF protection
   */
  private static generateState(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  /**
   * Get the OAuth authorization URL for Snapchat Marketing API
   */
  static getAuthorizationUrl(state: string): string {
    const clientId = process.env.SNAPCHAT_CLIENT_ID;
    const redirectUri = process.env.SNAPCHAT_REDIRECT_URI || this.getDefaultRedirectUri();
    
    if (!clientId) {
      throw new Error('SNAPCHAT_CLIENT_ID environment variable is not set');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: this.SCOPE,
      state: state,
    });

    const authUrl = `${this.AUTH_URL}?${params.toString()}`;

    console.log('[Snapchat OAuth] Marketing API Authorization URL:', {
      auth_url: this.AUTH_URL,
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: this.SCOPE,
      state: state,
      full_url: authUrl,
    });

    return authUrl;
  }

  /**
   * Get default redirect URI based on environment
   */
  private static getDefaultRedirectUri(): string {
    const domain = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN;
    if (domain) {
      return `https://${domain}/auth/snapchat/callback`;
    }
    return 'http://localhost:5000/auth/snapchat/callback';
  }

  /**
   * Exchange authorization code for access token
   */
  static async exchangeCodeForToken(code: string, state: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  }> {
    const clientId = process.env.SNAPCHAT_CLIENT_ID;
    const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;
    const redirectUri = process.env.SNAPCHAT_REDIRECT_URI || this.getDefaultRedirectUri();

    if (!clientId || !clientSecret) {
      throw new Error('Snapchat OAuth credentials not configured');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    });

    console.log('[Snapchat OAuth] Token exchange request to:', this.TOKEN_URL);

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body,
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Snapchat token exchange failed:', errorData);
      throw new Error(`Failed to exchange code for token: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    
    console.log('[Snapchat OAuth] Token exchange successful, scope:', data.scope);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const clientId = process.env.SNAPCHAT_CLIENT_ID;
    const clientSecret = process.env.SNAPCHAT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Snapchat OAuth credentials not configured');
    }

    const response = await fetch(this.TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Snapchat token refresh failed:', errorData);
      throw new Error(`Failed to refresh token: ${response.status}`);
    }

    const data = await response.json();
    
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: data.expires_in,
    };
  }

  /**
   * Get authenticated user's info from Marketing API
   */
  static async getUserProfile(accessToken: string): Promise<{
    externalId: string;
    displayName: string;
    email?: string;
    organizationId?: string;
  }> {
    console.log('[Snapchat OAuth] Fetching user profile from:', `${this.API_BASE_URL}/v1/me`);
    
    const response = await fetch(`${this.API_BASE_URL}/v1/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const responseText = await response.text();
    console.log('[Snapchat OAuth] User profile response status:', response.status);
    console.log('[Snapchat OAuth] User profile response:', responseText);

    if (!response.ok) {
      console.error('Failed to get Snapchat user profile:', responseText);
      throw new Error(`Failed to get user profile: ${response.status}`);
    }

    const data = JSON.parse(responseText);
    const me = data.me || data;
    
    return {
      externalId: me.id || me.organization_id || `snap_${Date.now()}`,
      displayName: me.display_name || me.snapchat_username || me.email || 'Snapchat User',
      email: me.email,
      organizationId: me.organization_id,
    };
  }

  /**
   * Get user's public profiles for content publishing
   */
  static async getPublicProfiles(accessToken: string): Promise<Array<{
    id: string;
    displayName: string;
    snapUserName?: string;
    category?: string;
  }>> {
    try {
      const response = await fetch(`${this.API_BASE_URL}/v1/me/public_profiles`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.log('Snapchat public profiles not available:', errorData);
        return [];
      }

      const data = await response.json();
      console.log('[Snapchat OAuth] Public profiles response:', JSON.stringify(data, null, 2));
      
      return (data.public_profiles || []).map((item: any) => {
        const profile = item.public_profile || item;
        return {
          id: profile.id,
          displayName: profile.display_name,
          snapUserName: profile.snap_user_name,
          category: profile.category,
        };
      });
    } catch (error) {
      console.error('Error fetching public profiles:', error);
      return [];
    }
  }

  /**
   * Save or update Snapchat account
   */
  static async saveAccount(params: {
    platformUserId: number;
    displayName: string;
    externalId: string;
    profileId: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    profilePictureUrl?: string;
  }) {
    const tokenExpiresAt = new Date(Date.now() + params.expiresIn * 1000);

    const existing = await db
      .select()
      .from(snapchatAccounts)
      .where(eq(snapchatAccounts.externalId, params.externalId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(snapchatAccounts)
        .set({
          displayName: params.displayName,
          profileId: params.profileId,
          accessToken: params.accessToken,
          refreshToken: params.refreshToken,
          tokenExpiresAt,
          profilePictureUrl: params.profilePictureUrl,
          isActive: true,
        })
        .where(eq(snapchatAccounts.externalId, params.externalId));

      return existing[0];
    }

    const [newAccount] = await db
      .insert(snapchatAccounts)
      .values({
        platformUserId: params.platformUserId,
        displayName: params.displayName,
        externalId: params.externalId,
        profileId: params.profileId,
        accessToken: params.accessToken,
        refreshToken: params.refreshToken,
        tokenExpiresAt,
        profilePictureUrl: params.profilePictureUrl,
        isActive: true,
      })
      .returning();

    return newAccount;
  }

  /**
   * Get all Snapchat accounts for a user
   */
  static async getAccountsForUser(platformUserId: number) {
    return await db
      .select()
      .from(snapchatAccounts)
      .where(
        and(
          eq(snapchatAccounts.platformUserId, platformUserId),
          eq(snapchatAccounts.isActive, true)
        )
      );
  }

  /**
   * Get a single Snapchat account by ID
   */
  static async getAccountById(accountId: number) {
    const accounts = await db
      .select()
      .from(snapchatAccounts)
      .where(eq(snapchatAccounts.id, accountId))
      .limit(1);
    
    return accounts[0] || null;
  }

  /**
   * Delete (deactivate) a Snapchat account
   */
  static async deleteAccount(accountId: number) {
    await db
      .update(snapchatAccounts)
      .set({ isActive: false })
      .where(eq(snapchatAccounts.id, accountId));
  }

  /**
   * Check if token needs refresh and refresh if necessary
   */
  static async ensureValidToken(account: typeof snapchatAccounts.$inferSelect): Promise<string> {
    const now = new Date();
    const expiresAt = account.tokenExpiresAt;
    
    if (expiresAt && expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      if (!account.refreshToken) {
        throw new Error('Token expired and no refresh token available');
      }

      console.log('🔄 Refreshing Snapchat access token...');
      const refreshed = await this.refreshAccessToken(account.refreshToken);
      
      await db
        .update(snapchatAccounts)
        .set({
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken,
          tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        })
        .where(eq(snapchatAccounts.id, account.id));

      return refreshed.accessToken;
    }

    return account.accessToken;
  }
}
