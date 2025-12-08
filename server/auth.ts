import passport from 'passport';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import { Request, Response, NextFunction } from 'express';
import { storage } from './storage';
import { User } from '@shared/schema';

interface FacebookProfile {
  id: string;
  displayName: string;
  emails?: Array<{value: string}>;
}

// Set up Facebook authentication strategy
export function setupAuth() {
  // Dynamically determine the callback URL based on environment
  const getCallbackURL = () => {
    // Check for custom APP_URL first (set this in Render environment)
    if (process.env.APP_URL) {
      const callbackURL = `${process.env.APP_URL}/auth/facebook/callback`;
      console.log(`🔧 Facebook OAuth Callback URL (APP_URL): ${callbackURL}`);
      return callbackURL;
    }
    
    // Check for Render's external URL
    if (process.env.RENDER_EXTERNAL_URL) {
      const callbackURL = `${process.env.RENDER_EXTERNAL_URL}/auth/facebook/callback`;
      console.log(`🔧 Facebook OAuth Callback URL (Render): ${callbackURL}`);
      return callbackURL;
    }
    
    // Check for Replit domains
    const replitDomains = process.env.REPLIT_DOMAINS;
    if (replitDomains) {
      const domains = replitDomains.split(',');
      const callbackURL = `https://${domains[0]}/auth/facebook/callback`;
      console.log(`🔧 Facebook OAuth Callback URL (Replit): ${callbackURL}`);
      return callbackURL;
    }
    
    // Fallback to localhost for local development
    const port = process.env.PORT || 3000;
    const fallbackURL = `http://localhost:${port}/auth/facebook/callback`;
    console.log(`🔧 Facebook OAuth Callback URL (localhost fallback): ${fallbackURL}`);
    return fallbackURL;
  };

  passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID || '',
    clientSecret: process.env.FACEBOOK_APP_SECRET || '',
    callbackURL: getCallbackURL(),
    profileFields: ['id', 'displayName', 'email'],
    scope: [
      'pages_manage_posts', 
      'pages_read_engagement', 
      'pages_manage_metadata', 
      'pages_show_list', 
      'business_management',
      'instagram_basic',
      'instagram_content_publish',
      'instagram_manage_insights'
    ]
  }, async (accessToken: string, refreshToken: string, profile: FacebookProfile, done: Function) => {
    try {
      // Exchange for long-lived token first
      const { exchangeForLongLivedToken } = await import('./services/facebookTokenService');
      const longLivedToken = await exchangeForLongLivedToken(accessToken);
      const tokenToStore = longLivedToken || accessToken;
      
      // Check if user exists in OLD database (for backwards compatibility)
      let user = await storage.getUserByFacebookId(profile.id);
      
      if (!user) {
        // Create a new user with Facebook profile info in OLD table
        // This maintains backward compatibility with existing data
        user = await storage.createUser({
          username: profile.displayName || `fb_${profile.id}`,
          email: profile.emails?.[0]?.value || `${profile.id}@facebook.com`,
          facebookId: profile.id,
          facebookToken: tokenToStore
        });
      } else {
        // Update the user's Facebook token
        await storage.updateUser(user.id, {
          facebookToken: tokenToStore
        });
      }
      
      // Use Hootsuite-style token refresh approach
      const { HootsuiteStyleFacebookService } = await import('./services/hootsuiteStyleFacebookService');
      await HootsuiteStyleFacebookService.refreshUserPageTokens(user.id, tokenToStore);
      
      // Discover and connect Instagram Business accounts linked to Facebook Pages
      try {
        console.log('🔍 Starting Instagram account auto-discovery...');
        const { InstagramService } = await import('./services/instagramService');
        const igResult = await InstagramService.getInstagramAccountsFromPages(tokenToStore);
        
        console.log('📸 Instagram discovery result:', JSON.stringify(igResult, null, 2));
        
        if (igResult.success && igResult.accounts && igResult.accounts.length > 0) {
          console.log(`📸 Found ${igResult.accounts.length} Instagram accounts`);
          for (const igAccount of igResult.accounts) {
            // Check if Instagram account already exists
            const existingAccounts = await storage.getInstagramAccounts(user.id);
            const exists = existingAccounts.find(acc => acc.businessAccountId === igAccount.id);
            
            if (!exists) {
              await storage.createInstagramAccount({
                userId: user.id,
                username: igAccount.username,
                businessAccountId: igAccount.id,
                connectedPageId: '',
                accessToken: tokenToStore,
                profilePictureUrl: igAccount.profile_picture_url,
                followersCount: igAccount.followers_count || 0,
                isActive: true
              });
              console.log(`✅ Auto-discovered Instagram account: @${igAccount.username}`);
            } else {
              console.log(`📸 Instagram account @${igAccount.username} already exists, skipping`);
            }
          }
        } else {
          console.log('⚠️ No Instagram accounts found or discovery failed:', igResult.error || 'No accounts linked');
        }
      } catch (igError) {
        console.error('❌ Error auto-discovering Instagram accounts:', igError);
        // Don't fail the login if Instagram discovery fails
      }
      
      // IMPORTANT: Store user in request for callback handler, but don't create a session
      // The callback handler will manually link accounts to platform user
      return done(null, user);
    } catch (error) {
      return done(error as Error);
    }
  }));

  // NOTE: Serialize/deserialize disabled because we manage platform user sessions manually
  // Passport OAuth is only used for connecting Facebook pages, not for authentication
  passport.serializeUser((user: any, done) => {
    // Don't serialize - we don't want Passport to manage sessions
    done(null, false);
  });

  passport.deserializeUser(async (id: number, done) => {
    // Don't deserialize - platform user sessions are managed separately
    done(null, false);
  });
}

// Middleware to check if user is authenticated
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Unauthorized' });
}

interface FacebookPageData {
  id: string;
  name: string;
  access_token: string;
}

interface FacebookPagesResponse {
  data?: FacebookPageData[];
  error?: {
    message: string;
    type: string;
    code: number;
  };
}

// Function to fetch user's Facebook pages
export async function fetchUserPages(userId: number, accessToken: string): Promise<FacebookPageData[]> {
  try {
    const response = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`);
    const data = await response.json() as FacebookPagesResponse;
    
    if (data.error) {
      console.error('Error fetching Facebook pages:', data.error);
      return [];
    }
    
    if (data.data && Array.isArray(data.data)) {
      // Process each Facebook page
      for (const page of data.data) {
        // Check if the page already exists in our database
        const existingAccount = await storage.getFacebookAccountByPageId(page.id);
        
        if (!existingAccount) {
          // Create a new account with the page data
          await storage.createFacebookAccount({
            userId,
            name: page.name,
            pageId: page.id,
            accessToken: page.access_token,
            isActive: true
          });
        } else if (existingAccount.userId === userId) {
          // Update the existing account
          await storage.updateFacebookAccount(existingAccount.id, {
            accessToken: page.access_token,
            isActive: true
          });
        }
      }
      
      // Return the pages data
      return data.data;
    }
    
    return [];
  } catch (error) {
    console.error('Error processing Facebook pages:', error);
    return [];
  }
}

// Function to get user's Facebook pages (can be used by API routes)
export async function getUserPages(userId: number) {
  try {
    const accounts = await storage.getFacebookAccounts(userId);
    return accounts;
  } catch (error) {
    console.error('Error getting user Facebook pages:', error);
    return [];
  }
}