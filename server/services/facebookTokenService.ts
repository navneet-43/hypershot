import fetch from 'node-fetch';
import { storage } from '../storage';

interface FacebookTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface FacebookLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Exchange short-lived token for long-lived token
 */
export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<string | null> {
  try {
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    
    if (!appId || !appSecret) {
      console.error('Facebook app credentials not found');
      return null;
    }
    
    const url = `https://graph.facebook.com/v16.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;
    
    const response = await fetch(url);
    const data = await response.json() as FacebookLongLivedTokenResponse;
    
    if (!response.ok || !data.access_token) {
      console.error('Failed to exchange token:', data);
      return null;
    }
    
    return data.access_token;
  } catch (error) {
    console.error('Error exchanging token:', error);
    return null;
  }
}

/**
 * Get page access token from user access token
 */
export async function getPageAccessToken(userAccessToken: string, pageId: string): Promise<string | null> {
  try {
    const url = `https://graph.facebook.com/v16.0/${pageId}?fields=access_token&access_token=${userAccessToken}`;
    
    const response = await fetch(url);
    const data = await response.json() as any;
    
    if (!response.ok || !data.access_token) {
      console.error('Failed to get page token:', data);
      return null;
    }
    
    return data.access_token;
  } catch (error) {
    console.error('Error getting page token:', error);
    return null;
  }
}

/**
 * Refresh all Facebook account tokens for a user
 */
export async function refreshUserFacebookTokens(userId: number, newUserToken: string): Promise<void> {
  try {
    // Get long-lived user token
    const longLivedUserToken = await exchangeForLongLivedToken(newUserToken);
    if (!longLivedUserToken) {
      console.error('Failed to get long-lived user token');
      return;
    }
    
    // Get user's Facebook accounts
    const accounts = await storage.getFacebookAccounts(userId);
    
    // Update each account with new page token
    for (const account of accounts) {
      try {
        const newPageToken = await getPageAccessToken(longLivedUserToken, account.pageId);
        if (newPageToken) {
          await storage.updateFacebookAccount(account.id, {
            accessToken: newPageToken
          });
          console.log(`Updated token for page ${account.name}`);
        } else {
          console.error(`Failed to refresh token for page ${account.name}`);
        }
      } catch (error) {
        console.error(`Error refreshing token for page ${account.name}:`, error);
      }
    }
    
    // Update user's Facebook token
    await storage.updateUser(userId, {
      facebookToken: longLivedUserToken
    });
    
    console.log(`Successfully refreshed tokens for user ${userId}`);
  } catch (error) {
    console.error('Error refreshing user Facebook tokens:', error);
  }
}

/**
 * Validate a Facebook access token
 */
export async function validateFacebookToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`https://graph.facebook.com/v16.0/me?access_token=${accessToken}`);
    const data = await response.json() as any;
    
    return response.ok && !data.error;
  } catch (error) {
    console.error('Error validating token:', error);
    return false;
  }
}

/**
 * Test if a page token can publish posts
 */
export async function testPagePublishPermissions(pageToken: string, pageId: string): Promise<boolean> {
  try {
    // Test by checking page permissions
    const response = await fetch(`https://graph.facebook.com/v16.0/${pageId}/permissions?access_token=${pageToken}`);
    const data = await response.json() as any;
    
    if (!response.ok) {
      return false;
    }
    
    // Check if we have publish permissions
    const permissions = data.data || [];
    const hasPublishPermission = permissions.some((perm: any) => 
      perm.permission === 'MANAGE' && perm.status === 'granted'
    );
    
    return hasPublishPermission;
  } catch (error) {
    console.error('Error testing publish permissions:', error);
    return false;
  }
}