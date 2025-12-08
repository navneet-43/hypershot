# Facebook Reels via CSV Import Guide

## What are Facebook Reels?
Facebook Reels are short, vertical videos (15-90 seconds) designed for mobile viewing. They're Facebook's equivalent to TikTok videos and Instagram Reels.

## CSV Format for Reels

Your CSV should include these columns:

| Column | Required | Description | Example |
|--------|----------|-------------|---------|
| content | Yes | Caption/description for the Reel | "Check out this amazing dance!" |
| media_url | Yes | URL to your video file | Google Drive, YouTube, or direct video URL |
| media_type | Yes | Must be "reel" | reel |
| scheduled_for | Yes | When to publish | 2025-08-05 20:30 |
| account | Yes | Facebook page name | Alright Tamil |
| labels | Optional | Custom tracking labels | dance,viral,trending |

## Example CSV Row for Reel:
```csv
content,media_url,media_type,scheduled_for,account,labels
"Amazing dance moves! 💃 #viral #dance",https://drive.google.com/file/d/YOUR_FILE_ID/view,reel,"2025-08-05 20:30","Alright Tamil","dance,viral"
```

## Reel Requirements

### Video Specifications:
- **Duration**: 15-90 seconds (optimal: 15-30 seconds)
- **Aspect Ratio**: 9:16 (vertical) or 1:1 (square)
- **Resolution**: Minimum 720x1280 (HD preferred)
- **File Size**: Up to 1.75GB (smaller files upload faster)
- **Format**: MP4 recommended

### Content Guidelines:
- **Vertical videos** perform best
- **High-quality visuals** and clear audio
- **Engaging first 3 seconds** to capture attention
- **Trending audio/music** increases reach
- **Clear, readable text** if using overlays

## Supported Video Sources

### 1. Google Drive Videos
```csv
media_url,media_type
https://drive.google.com/file/d/1ABC123.../view,reel
```
- Set sharing to "Anyone with the link can view"
- Supports videos up to 1.75GB
- Automatically downloads and uploads to Facebook

### 2. YouTube Videos (Shorts)
```csv
media_url,media_type
https://youtu.be/dQw4w9WgXcQ,reel
```
- Automatically extracts as high-quality video
- Preserves original quality
- Works with YouTube Shorts

### 3. Direct Video URLs
```csv
media_url,media_type
https://example.com/video.mp4,reel
```
- Must be publicly accessible
- Direct download links work best

## Facebook Reel Features

When posted as "reel" type, videos get:
- **Enhanced discoverability** in Facebook Reels feed
- **Mobile-optimized display** with full-screen viewing
- **Reels-specific engagement** (likes, shares, comments)
- **Algorithm boost** for trending content
- **Cross-platform sharing** (can appear on Instagram if linked)

## Tips for Successful Reels

### Content Strategy:
1. **Hook viewers** in first 3 seconds
2. **Use trending sounds** or popular music
3. **Add captions** for accessibility
4. **Include relevant hashtags** in description
5. **Post consistently** for better reach

### Technical Tips:
1. **Film vertically** (9:16 aspect ratio)
2. **Good lighting** improves engagement
3. **Stable footage** (use tripod if needed)
4. **Clear audio** is crucial
5. **Keep file sizes reasonable** for faster upload

## Custom Labels for Reels

Use labels to track Reel performance:
```csv
labels
"reel,dance,viral,trending,music"
```

These appear in Meta Insights for detailed analytics:
- View duration
- Completion rates
- Engagement metrics
- Audience demographics

## Processing Pipeline

When you upload a Reel via CSV:

1. **Content Detection**: System identifies it as a Reel
2. **Video Download**: Gets video from Google Drive/YouTube
3. **Format Optimization**: Ensures Facebook compatibility
4. **Reel Upload**: Posts using Facebook's Reels API
5. **Tracking**: Adds custom labels for analytics

## Example Complete CSV:

```csv
content,media_url,media_type,scheduled_for,account,labels,language
"Dance challenge! Who can do this? 💃 #dancechallenge #viral",https://drive.google.com/file/d/1ABC123.../view,reel,"2025-08-05 20:30","Alright Tamil","dance,challenge,viral","en"
"Cooking hack you need to try! 🍳 #cookinghacks #food",https://youtu.be/xyz789,reel,"2025-08-05 21:00","Alright Tamil","cooking,food,tips","en"
"Behind the scenes magic ✨ #bts #content",https://drive.google.com/file/d/1DEF456.../view,reel,"2025-08-05 21:30","Alright Tamil","bts,content,creator","en"
```

## Monitoring Reel Performance

After posting, check:
- **View count** and **completion rate**
- **Engagement rate** (likes, comments, shares)
- **Reach and impressions** in Meta Insights
- **Custom label performance** for content categories

The system handles all technical aspects - you just need to provide good vertical video content and engaging captions!