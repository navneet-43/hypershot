# Google Drive Sharing Guide for CSV Import

When importing videos/images from Google Drive via CSV, you need to ensure proper sharing permissions to avoid "access restricted" errors.

## Quick Fix Steps

### 1. Open Your Google Drive File
- Go to your Google Drive file
- Right-click on the file

### 2. Change Sharing Settings
- Click **"Share"** or **"Get link"**
- Click on **"Restricted"** dropdown
- Select **"Anyone with the link can view"**
- Click **"Done"**

### 3. Use the Correct Link Format
Make sure your CSV contains the shareable link, not the edit link:

**✅ Correct format:**
```
https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view?usp=sharing
```

**❌ Wrong format (edit link):**
```
https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
```

## Common Error Messages & Solutions

### "Access Restricted File"
- **Cause**: File sharing is set to "Restricted" 
- **Solution**: Change to "Anyone with the link can view"

### "File Requires Authentication"
- **Cause**: File requires Google login to access
- **Solution**: Enable public sharing as described above

### "File Not Found"
- **Cause**: Wrong URL or file was deleted
- **Solution**: Check the URL is correct and file exists

## Testing Your Link

Before importing via CSV, test your Google Drive link:
1. Open an incognito/private browser window
2. Paste your Google Drive link
3. You should be able to view/download without logging in

If it asks for login, the sharing permissions are not set correctly.

## File Size Limits

- **Images**: Up to 50MB
- **Videos**: Up to 1.75GB 
- Larger files may timeout during download

## Supported File Types

- **Images**: JPG, PNG, GIF, WebP
- **Videos**: MP4, MOV, AVI, MKV, WebM

For best results, use MP4 format for videos and JPG/PNG for images.