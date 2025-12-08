# Facebook Reels API Permissions Setup Guide

## Overview
To use the Facebook Reels API for publishing Reels to your Facebook pages, you need specific permissions and setup. This guide walks you through the complete process.

## Prerequisites
- Facebook Business account
- Facebook Developer account
- Admin access to your Facebook pages
- Valid Facebook app with proper permissions

## Required API Permissions

Your Facebook app needs these permissions:
- `pages_show_list` - To access page list
- `pages_read_engagement` - To read page engagement data
- `pages_manage_posts` - To publish content to pages

## Step-by-Step Setup

### 1. Facebook Developer Console Setup

1. **Go to Facebook Developer Console**
   - Visit: https://developers.facebook.com/
   - Login with your Facebook account

2. **Select Your App**
   - Choose your existing app or create a new one
   - Navigate to "App Settings" > "Basic"

3. **Add App Domains**
   - Add your domain (e.g., `your-app.replit.dev`)
   - Save changes

### 2. Page Permissions Setup

1. **Business Manager Setup**
   - Go to: https://business.facebook.com/
   - Select your business account
   - Navigate to "Business Settings"

2. **Add Your Page**
   - Go to "Accounts" > "Pages"
   - Add your Facebook page to business manager
   - Assign yourself as admin

3. **App Integration**
   - Go to "Business Settings" > "Data Sources" > "Apps"
   - Add your Facebook app
   - Grant necessary permissions

### 3. Page Access Token Configuration

1. **Generate Page Access Token**
   - In Developer Console, go to "Tools" > "Graph API Explorer"
   - Select your app and page
   - Request permissions: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`
   - Generate token

2. **Test Page Permissions**
   ```bash
   curl -X GET "https://graph.facebook.com/v23.0/me/accounts?access_token=YOUR_USER_TOKEN"
   ```

### 4. Reels-Specific Requirements

1. **Page Verification**
   - Your page must be verified for business use
   - Complete page verification process if needed

2. **Content Publishing Tools**
   - On your Facebook page, check "Publishing Tools"
   - Ensure "Reels" section is available
   - If not available, your page may need additional verification

3. **API Version**
   - Use Facebook Graph API v23.0 or later
   - Reels API has improved support in newer versions

## Testing Reels Permissions

### Test API Call
```bash
# Test if page can create Reels
curl -X POST "https://graph.facebook.com/v23.0/YOUR_PAGE_ID/video_reels" \
     -H "Content-Type: application/json" \
     -d '{
           "upload_phase":"start",
           "access_token":"YOUR_PAGE_ACCESS_TOKEN"
         }'
```

### Expected Responses

**Success Response:**
```json
{
  "video_id": "1234567890",
  "upload_url": "https://rupload.facebook.com/video-upload/1234567890"
}
```

**Permission Error:**
```json
{
  "error": {
    "message": "User not authorized to perform this request",
    "type": "NotAuthorizedError",
    "code": 200
  }
}
```

## Common Issues and Solutions

### 1. "NotAuthorizedError"
**Problem:** Page doesn't have Reels permissions
**Solution:** 
- Verify page in Business Manager
- Check if Reels is available for your page type
- Contact Facebook support if needed

### 2. "Invalid Access Token"
**Problem:** Token doesn't have required permissions
**Solution:**
- Regenerate page access token with correct permissions
- Ensure token is for the specific page, not user token

### 3. "Upload Failed"
**Problem:** Video doesn't meet Reels specifications
**Solution:**
- Check video format (MP4, 9:16 aspect ratio)
- Ensure duration is 3-90 seconds
- Verify resolution (minimum 540x960, recommended 1080x1920)

## Video Requirements for Reels

| Property | Specification |
|----------|---------------|
| Format | MP4 (recommended) |
| Aspect Ratio | 9:16 |
| Resolution | 1080x1920 (recommended), minimum 540x960 |
| Duration | 3-90 seconds |
| Frame Rate | 24-60 fps |
| Audio | AAC, 48kHz, stereo |

## Rate Limits

- **Reels Publishing:** 30 API-published Reels per 24-hour period
- **Regular Videos:** Different limits apply
- Plan your publishing schedule accordingly

## Troubleshooting

### Enable Debug Mode
Add this to your API calls for detailed error information:
```
&debug=all&format=json&suppress_http_code=1
```

### Check Page Insights
- Go to your page insights
- Check if Reels metrics are available
- This indicates Reels functionality is enabled

### Contact Facebook Support
If permissions issues persist:
1. Document your use case
2. Provide page ID and app ID
3. Submit support ticket through Developer Console

## Our System's Fallback Strategy

Our application automatically handles permission issues:

1. **Attempts Reel Upload:** Tries to upload as Reel first
2. **Detects Authorization Error:** Catches "NotAuthorizedError"
3. **Automatic Fallback:** Uploads as regular video instead
4. **User Notification:** Provides guidance on enabling Reels permissions

This ensures your content always publishes successfully, even without Reels permissions.

## Next Steps

1. Follow this guide to enable Reels permissions
2. Test with our application
3. If successful, you'll see Reels published directly
4. If fallback is used, content uploads as regular video

For technical support with our application, refer to the main documentation or contact support.