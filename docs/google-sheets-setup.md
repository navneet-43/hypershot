# Google Sheets API Setup Guide

This guide will help you set up Google Sheets API access for importing content into SocialFlow.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" and then "New Project"
3. Enter a project name (e.g., "SocialFlow Integration")
4. Click "Create"

## Step 2: Enable Google Sheets API

1. In your Google Cloud project, go to "APIs & Services" > "Library"
2. Search for "Google Sheets API"
3. Click on "Google Sheets API" and click "Enable"

## Step 3: Create Credentials

### Option A: Service Account (Recommended for server applications)

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "Service Account"
3. Enter a name (e.g., "SocialFlow Sheets Access")
4. Click "Create and Continue"
5. Skip roles for now and click "Continue"
6. Click "Done"
7. Click on the created service account
8. Go to "Keys" tab > "Add Key" > "Create new key"
9. Choose "JSON" format and click "Create"
10. Save the downloaded JSON file securely

### Option B: OAuth 2.0 (For user-based access)

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. If prompted, configure the consent screen first
4. Choose "Web application"
5. Add authorized redirect URIs if needed
6. Click "Create"
7. Save the Client ID and Client Secret

## Step 4: Share Your Google Sheet

If using Service Account:
1. Open your Google Sheet
2. Click "Share"
3. Add the service account email (found in the JSON file)
4. Give "Editor" or "Viewer" permissions

## Step 5: Get Your Spreadsheet ID

Your spreadsheet ID is in the URL:
```
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
```

Copy the SPREADSHEET_ID part.

## Step 6: Generate Access Token

### For Service Account:
Use the downloaded JSON file to generate an access token programmatically.

### For OAuth 2.0:
1. Use Google OAuth Playground: https://developers.google.com/oauthplayground/
2. In "Step 1", select "Google Sheets API v4"
3. Click "Authorize APIs"
4. In "Step 2", click "Exchange authorization code for tokens"
5. Copy the "Access token"

## Expected Sheet Format

Your Google Sheet should have these columns:
- **Content** (required): The post content/message
- **MediaURL**: Link to image/video (Google Drive links work)
- **MediaType**: photo, video, or none
- **Language**: en, es, fr, etc.
- **Labels**: Comma-separated custom labels
- **ScheduledFor**: Date/time for scheduling (YYYY-MM-DD HH:MM format)
- **Link**: Optional link to include in post

## Example Sheet Data

| Content | MediaURL | MediaType | Language | Labels | ScheduledFor | Link |
|---------|----------|-----------|----------|---------|--------------|------|
| Check out our new product! | https://drive.google.com/file/d/abc123 | photo | en | product,launch | 2024-06-15 14:00 | https://example.com |
| ¡Nuevo producto disponible! | https://drive.google.com/file/d/def456 | photo | es | producto,lanzamiento | 2024-06-15 16:00 | https://example.com |

## Troubleshooting

- **403 Forbidden**: Check if the API is enabled and credentials are correct
- **404 Not Found**: Verify the spreadsheet ID and sharing permissions
- **400 Bad Request**: Check the sheet name and range format
- **No data found**: Ensure the sheet has content and the range is correct

## Security Notes

- Keep your credentials secure and never commit them to version control
- Use environment variables or secure storage for API keys
- Regularly rotate access tokens and credentials
- Limit permissions to only what's needed