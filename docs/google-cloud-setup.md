# Google Cloud Setup Guide for SocialFlow

This guide will help you set up Google Cloud credentials for the Google Sheets integration in SocialFlow.

## Step 1: Create a Google Cloud Project

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Create Project" or select an existing project
3. Enter a project name (e.g., "SocialFlow Integration")
4. Click "Create"

## Step 2: Enable Google Sheets API

1. In your Google Cloud project, go to "APIs & Services" → "Library"
2. Search for "Google Sheets API"
3. Click on "Google Sheets API" and then "Enable"
4. Also enable "Google Drive API" (needed to list spreadsheets)

## Step 3: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. If prompted, configure the OAuth consent screen:
   - Choose "External" user type
   - Fill in required fields:
     - App name: "SocialFlow"
     - User support email: your email
     - Developer contact: your email
   - Add scopes: `https://www.googleapis.com/auth/spreadsheets.readonly` and `https://www.googleapis.com/auth/drive.readonly`

4. Create OAuth 2.0 Client ID:
   - Application type: "Web application"
   - Name: "SocialFlow Web Client"
   - Authorized redirect URIs: Add your Replit URL + `/api/google/callback`
     - Example: `https://your-repl-url.replit.dev/api/google/callback`

## Step 4: Get Your Credentials

After creating the OAuth client:
1. Download the JSON file or copy the Client ID and Client Secret
2. You'll need these values:
   - `GOOGLE_CLIENT_ID`: The client ID from your OAuth credentials
   - `GOOGLE_CLIENT_SECRET`: The client secret from your OAuth credentials

## Step 5: Add to Replit Secrets

In your Replit project:
1. Go to the "Secrets" tab (lock icon in sidebar)
2. Add these environment variables:
   - Key: `GOOGLE_CLIENT_ID`, Value: your client ID
   - Key: `GOOGLE_CLIENT_SECRET`, Value: your client secret

## Testing the Integration

Once configured:
1. Restart your Replit application
2. Go to the dashboard
3. Click "Connect Google Account" in the Google Sheets import card
4. You should see the Google OAuth authorization screen

## Troubleshooting

### "Error 400: redirect_uri_mismatch"
- Make sure your redirect URI in Google Cloud Console matches exactly: `https://your-repl-url.replit.dev/api/google/callback`

### "This app isn't verified"
- For development, click "Advanced" → "Go to SocialFlow (unsafe)"
- For production, you'll need to verify your app with Google

### "Access blocked"
- Make sure you've added the correct scopes in the OAuth consent screen
- Check that both Google Sheets API and Google Drive API are enabled

## Production Considerations

For production deployment:
1. Verify your app with Google (required for public use)
2. Add your production domain to authorized domains
3. Use environment variables for credentials (never hardcode them)
4. Consider implementing proper error handling and token refresh logic

## Required Scopes

The application uses these OAuth scopes:
- `https://www.googleapis.com/auth/spreadsheets.readonly` - Read your Google Sheets
- `https://www.googleapis.com/auth/drive.readonly` - List your Google Drive files

These provide read-only access to your Google Sheets and Drive, ensuring maximum security.