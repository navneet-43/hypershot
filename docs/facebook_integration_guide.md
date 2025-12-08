# Facebook Integration Technical Guide

This document provides a comprehensive guide to the Facebook integration implemented in our social media publishing automation tool. It covers the OAuth flow, required permissions, API endpoints, and implementation details.

## Setup Requirements

### Facebook Developer Account Setup

1. Create a Facebook Developer account at [developers.facebook.com](https://developers.facebook.com/)
2. Create a new app with the "Business" type
3. Add the "Facebook Login" product to your app
4. Configure OAuth settings:
   - Add Valid OAuth Redirect URIs (example: `https://your-app-domain.com/auth/facebook/callback`)
   - Add your app domain to App Domains
   - Add your site URL to Website settings

### Required App Permissions

The application requires the following permissions:
- `email`: Basic profile information
- `pages_show_list`: To view the list of pages the user manages
- `pages_manage_posts`: To create and publish posts on behalf of pages
- `pages_read_engagement`: To read engagement metrics for posts

### Environment Variables

The following environment variables must be set:
- `FACEBOOK_APP_ID`: Your Facebook App ID
- `FACEBOOK_APP_SECRET`: Your Facebook App Secret
- `SESSION_SECRET`: A secure random string for session encryption

## OAuth Authentication Flow

### 1. Authentication Request (Frontend)

The process begins when a user clicks the "Login with Facebook" button:

```jsx
// LoginButton.tsx
<Button 
  onClick={() => window.location.href = '/auth/facebook'}
  className="flex items-center gap-2 bg-[#1877F2] hover:bg-[#0C63D4]"
>
  <SiFacebook className="w-4 h-4" />
  <span>Login with Facebook</span>
</Button>
```

### 2. Server OAuth Endpoint

The server handles the authentication request:

```typescript
// routes.ts
app.get('/auth/facebook', 
  passport.authenticate('facebook', { 
    scope: ['email', 'pages_show_list', 'pages_manage_posts', 'pages_read_engagement']
  })
);
```

### 3. Facebook OAuth Callback

After the user authenticates with Facebook, the callback endpoint receives the tokens:

```typescript
// routes.ts
app.get('/auth/facebook/callback', 
  passport.authenticate('facebook', { 
    failureRedirect: '/login-error',
    successRedirect: '/facebook-accounts'
  })
);
```

### 4. Passport Strategy

The Facebook authentication strategy is configured in `auth.ts`:

```typescript
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID || '',
  clientSecret: process.env.FACEBOOK_APP_SECRET || '',
  callbackURL: `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co/auth/facebook/callback`,
  profileFields: ['id', 'displayName', 'email'],
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Check if user exists in database
    let user = await storage.getUserByFacebookId(profile.id);
    
    if (!user) {
      // If user doesn't exist, check if there's a user with the same email
      const email = profile.emails?.[0]?.value;
      
      if (email) {
        user = await storage.getUserByUsername(email);
      }
      
      if (!user) {
        // Create a new user if we couldn't find one
        user = await storage.createUser({
          username: email || `facebook_${profile.id}`,
          email: email || '',
          password: null,
          fullName: profile.displayName,
          facebookId: profile.id,
          facebookToken: accessToken
        });
      } else {
        // Update existing user with Facebook info
        user = await storage.updateUser(user.id, {
          facebookId: profile.id,
          facebookToken: accessToken
        });
      }
    } else {
      // Update the Facebook token for existing user
      user = await storage.updateUser(user.id, {
        facebookToken: accessToken
      });
    }
    
    // Fetch and sync user's Facebook pages
    await fetchUserPages(user.id, accessToken);
    
    // Complete authentication
    return done(null, user);
  } catch (error) {
    return done(error as Error);
  }
}));
```

### 5. Session Handling

Passport session serialization and deserialization:

```typescript
// auth.ts
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await storage.getUser(id);
    done(null, user);
  } catch (error) {
    done(error);
  }
});
```

## Facebook Page Access

After authentication, the system automatically fetches and syncs the user's Facebook pages.

### Fetching User Pages

```typescript
// auth.ts
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
```

### Page Synchronization Endpoint

A dedicated endpoint that syncs the user's pages on demand:

```typescript
// routes.ts
app.get('/api/facebook-pages/sync', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = await authenticateUser(req, res);
    
    if (user.facebookToken) {
      const pages = await fetchUserPages(user.id, user.facebookToken);
      res.json({ 
        success: true, 
        message: `Successfully synced ${pages.length} Facebook pages`,
        pages 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: "You are not connected to Facebook. Please connect your Facebook account first." 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Error syncing Facebook pages", 
      error: (error as Error).message 
    });
  }
});
```

## Post Publishing Flow

### Creating a Post

When a post is created, it is stored in the database with a status of "scheduled" or "draft":

```typescript
const newPost = await storage.createPost({
  userId: user.id,
  accountId: postData.accountId,
  content: postData.content,
  link: postData.link || null,
  mediaUrl: mediaUrl || null,
  labels: postData.labels || null,
  language: postData.language || null,
  scheduledFor: scheduledDate,
  status: "scheduled"
});
```

### Publishing a Post

At the scheduled time, a background job publishes the post to Facebook:

```typescript
async function publishPostToFacebook(postId: number) {
  try {
    const post = await storage.getPost(postId);
    if (!post || post.status !== "scheduled") return;
    
    const account = await storage.getFacebookAccount(post.accountId);
    if (!account || !account.isActive) return;
    
    // Prepare the post data
    const postData: any = {
      message: post.content
    };
    
    if (post.link) {
      postData.link = post.link;
    }
    
    if (post.mediaUrl) {
      // If there's a media URL, determine if it's a photo or video
      if (post.mediaUrl.match(/\.(jpeg|jpg|gif|png)$/i)) {
        postData.url = post.mediaUrl;
        const endpoint = `https://graph.facebook.com/v18.0/${account.pageId}/photos`;
        await postToFacebook(endpoint, account.accessToken, postData);
      } else {
        // Video upload requires a different approach
        postData.file_url = post.mediaUrl;
        const endpoint = `https://graph.facebook.com/v18.0/${account.pageId}/videos`;
        await postToFacebook(endpoint, account.accessToken, postData);
      }
    } else {
      // Simple text post
      const endpoint = `https://graph.facebook.com/v18.0/${account.pageId}/feed`;
      await postToFacebook(endpoint, account.accessToken, postData);
    }
    
    // Update post status to published
    await storage.updatePost(postId, {
      status: "published",
      publishedAt: new Date()
    });
    
    // Log activity
    await storage.createActivity({
      userId: post.userId,
      type: "post_published",
      description: `Published post to ${account.name}`,
      metadata: { postId }
    });
    
  } catch (error) {
    console.error(`Error publishing post ${postId}:`, error);
    await storage.updatePost(postId, {
      status: "error",
      errorMessage: (error as Error).message
    });
    
    await storage.createActivity({
      userId: post.userId,
      type: "post_error",
      description: `Failed to publish post: ${(error as Error).message}`,
      metadata: { postId }
    });
  }
}
```

### Scheduling Posts

The system uses node-schedule to trigger post publishing at the scheduled time:

```typescript
// Schedule the post for publishing
const job = schedule.scheduleJob(scheduledDate, () => {
  publishPostToFacebook(newPost.id);
});

// Store the job reference for possible cancellation/rescheduling
scheduledJobs.set(newPost.id.toString(), job);
```

## Data Models

### Facebook Account Model

```typescript
export const facebookAccounts = pgTable("facebook_accounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  name: text("name").notNull(),
  pageId: text("page_id").notNull(),
  accessToken: text("access_token").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const facebookAccountsRelations = relations(facebookAccounts, ({ one, many }) => ({
  user: one(users, {
    fields: [facebookAccounts.userId],
    references: [users.id],
  }),
  posts: many(posts),
}));
```

## Error Handling

### Unauthorized Access

If a user is not authenticated, the isAuthenticated middleware redirects them:

```typescript
export function isAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}
```

### Facebook API Errors

The system handles various Facebook API errors:

```typescript
if (data.error) {
  // Handle specific error cases
  if (data.error.code === 190) {
    // Invalid or expired token
    await storage.updateUser(userId, { facebookToken: null });
    console.error('Facebook token expired or invalid. User must reconnect.');
  } else if (data.error.code === 4) {
    // App-level throttling
    console.error('Rate limit exceeded. Implementing backoff.');
    // Implement exponential backoff
  }
  
  throw new Error(`Facebook API error: ${data.error.message}`);
}
```

## UI Components

### Login Button

```jsx
export default function LoginButton({ 
  size = "default", 
  variant = "default" 
}: LoginButtonProps) {
  // Check if user is already logged in
  const { data: authStatus } = useQuery({
    queryKey: ['/api/auth/status'],
    refetchOnWindowFocus: true
  });

  const isLoggedIn = authStatus?.isLoggedIn;
  
  const handleLogout = async () => {
    // Call logout endpoint
    await fetch('/api/auth/logout');
    // Refresh the page to reset the auth state
    window.location.href = '/';
  };
  
  if (isLoggedIn) {
    return (
      <Button 
        size={size} 
        variant="outline" 
        onClick={handleLogout}
      >
        Logout
      </Button>
    );
  }
  
  return (
    <Button 
      size={size} 
      variant={variant}
      onClick={() => window.location.href = '/auth/facebook'}
      className="flex items-center gap-2 bg-[#1877F2] hover:bg-[#0C63D4]"
    >
      <SiFacebook className="w-4 h-4" />
      <span>Login with Facebook</span>
    </Button>
  );
}
```

### OAuth Configuration Instructions

A component that helps users understand how to configure their Facebook App:

```jsx
export default function FacebookOAuthInstructions() {
  const [appDomain, setAppDomain] = useState("");
  const [siteUrl, setSiteUrl] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  useEffect(() => {
    // Get the current hostname
    const host = window.location.host;
    const protocol = window.location.protocol;
    const domain = host.split('.').slice(-2).join('.');
    
    // Generate URLs for Facebook configuration
    setAppDomain(domain);
    setSiteUrl(`${protocol}//${host}`);
    setRedirectUri(`${protocol}//${host}/auth/facebook/callback`);
  }, []);

  return (
    <Alert className="my-4 border-blue-600">
      <AlertTitle className="text-lg font-semibold">Facebook App Configuration</AlertTitle>
      <AlertDescription>
        <p className="mt-2 mb-3">
          Before Facebook OAuth login works correctly, you need to add the following values to your Facebook App settings:
        </p>
        
        <div className="space-y-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-md">
          <div>
            <span className="font-semibold">App Domain:</span> 
            <code className="ml-2 p-1 bg-gray-200 dark:bg-gray-700 rounded">{appDomain}</code>
          </div>
          
          <div>
            <span className="font-semibold">Site URL:</span> 
            <code className="ml-2 p-1 bg-gray-200 dark:bg-gray-700 rounded">{siteUrl}</code>
          </div>
          
          <div>
            <span className="font-semibold">Valid OAuth Redirect URI:</span> 
            <code className="ml-2 p-1 bg-gray-200 dark:bg-gray-700 rounded">{redirectUri}</code>
          </div>
        </div>
        
        <div className="mt-3 mb-1">
          <span className="font-semibold">Required Permissions:</span>
          <ul className="list-disc list-inside ml-2 mt-1">
            <li>email</li>
            <li>pages_show_list</li>
            <li>pages_manage_posts</li>
            <li>pages_read_engagement</li>
          </ul>
        </div>
        
        <Button 
          variant="link" 
          className="p-0 h-auto mt-2 text-blue-600 dark:text-blue-400"
          onClick={() => window.open("https://developers.facebook.com/apps/", "_blank")}
        >
          Go to Facebook Developers
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

## Common Issues and Troubleshooting

### 1. Invalid OAuth Redirect URI

**Problem:** Facebook error "Can't load URL: The domain of this URL isn't included in the app's domains."

**Solution:**
1. Go to Facebook Developers > Your App > Facebook Login > Settings
2. Add the correct domain to "App Domains" in Basic Settings
3. Add the full OAuth callback URL to "Valid OAuth Redirect URIs"
4. Make sure the protocol (http/https) matches exactly

### 2. Missing Permissions

**Problem:** Unable to access pages or publish posts despite successful login.

**Solution:**
1. Ensure all required permissions are requested in the authentication request
2. Check if permissions were approved by the user during login
3. Verify the app review status if needed for extended permissions

### 3. Token Expiration

**Problem:** Posts fail to publish after some time.

**Solution:**
1. Page tokens are long-lived but can expire
2. Implement token refresh logic or prompt users to reconnect
3. Store token expiration time and check before using

### 4. Rate Limiting

**Problem:** API requests fail with rate limit errors.

**Solution:**
1. Implement exponential backoff for retries
2. Batch requests when possible
3. Cache responses where appropriate
4. Monitor usage and spread requests over time

## Best Practices

1. **Token Security**
   - Never expose access tokens in client-side code
   - Store tokens securely in the database
   - Use HTTPS for all API requests

2. **Error Handling**
   - Implement comprehensive error handling for all API calls
   - Provide clear feedback to users when things go wrong
   - Log detailed error information for debugging

3. **User Experience**
   - Provide clear instructions for Facebook app configuration
   - Show connection status and expiration information
   - Make reconnection process simple and intuitive

4. **Publishing Strategy**
   - Implement retry logic for failed publications
   - Provide detailed error messages about publishing failures
   - Allow rescheduling of failed posts

## Resources

- [Facebook Graph API Documentation](https://developers.facebook.com/docs/graph-api/)
- [Facebook Login Documentation](https://developers.facebook.com/docs/facebook-login/)
- [Pages API Documentation](https://developers.facebook.com/docs/pages-api/)
- [Facebook Marketing API](https://developers.facebook.com/docs/marketing-apis/)