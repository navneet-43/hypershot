# SocialFlow Keep-Alive System

## Problem
Replit servers go to sleep after periods of inactivity, causing scheduled posts to be delayed by minutes or hours.

## Current Solution (Implemented)

### Internal Keep-Alive (Automatic)
- **Health pings**: Every 15 seconds to `/api/health`
- **Status checks**: Every 20 seconds to `/api/scheduling-status`
- **Background activity**: Every 10 seconds (CPU + I/O activity)

### External Monitoring Options

#### Option 1: Open keep-alive-monitor.html
1. Open the file `keep-alive-monitor.html` in your browser
2. Keep the tab open - it pings every 1 minute
3. This acts as external monitoring

#### Option 2: Set up UptimeRobot (Recommended for Production)
1. Go to https://uptimerobot.com (free account)
2. Create a new monitor:
   - **URL**: `https://your-replit-domain.replit.dev/api/health`
   - **Type**: HTTP(s)
   - **Interval**: 1 minute
3. This will ping your server every minute from external servers

#### Option 3: Use Cron-Job.org
1. Go to https://cron-job.org
2. Create a new cron job:
   - **URL**: `https://your-replit-domain.replit.dev/api/health`
   - **Schedule**: Every 1 minute

## System Effectiveness
- **Before**: Posts delayed 67 minutes on average (up to 213 minutes)
- **After**: Test post published within 0.2 minutes of scheduled time

## Monitoring System Health
Check the Activities section in your dashboard for:
- ✅ "Post published" (on time)
- 🚨 "Overdue post published (X minutes late)" (delays detected)
- 🔄 "System gap detected" (server restart events)

## Recovery Mechanism
Even if the server sleeps, the system will:
1. Detect overdue posts within 15 seconds of restart
2. Publish them immediately with delay tracking
3. Log the delay for monitoring

This ensures no posts are permanently lost, only delayed.