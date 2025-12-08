# 🚀 Social Publisher - Local Development Setup Guide

This guide will help you run the Social Publisher application on your local Mac for Instagram Reels scheduling and future development.

---

## 📋 Prerequisites

### 1. Install Node.js (v20 or higher)

```bash
# Using Homebrew (recommended)
brew install node@20

# Verify installation
node --version  # Should show v20.x.x or higher
npm --version
```

### 2. Install PostgreSQL

You have two options:

**Option A: Cloud Database (Recommended - Easiest)**
- Sign up for free at [Neon](https://neon.tech) 
- Create a new project and database
- Copy the connection string

**Option B: Local PostgreSQL**
```bash
# Install via Homebrew
brew install postgresql@15
brew services start postgresql@15

# Create database
createdb social_publisher
```

---

## ⚙️ Setup Steps

### Step 1: Install Dependencies

```bash
cd /Users/navneetsingh/Desktop/SocialPublisher
npm install
```

### Step 2: Create Environment File

```bash
# Copy the example file
cp env.example.txt .env
```

Then edit `.env` with your actual values. Here's what's **REQUIRED**:

| Variable | Required | Description | Where to Get It |
|----------|----------|-------------|-----------------|
| `DATABASE_URL` | ✅ Yes | PostgreSQL connection string | Neon dashboard or local setup |
| `SESSION_SECRET` | ✅ Yes | Random secret string | Generate any random string |
| `FACEBOOK_APP_ID` | ✅ For Instagram | Facebook App ID | [Meta Developer Portal](https://developers.facebook.com/apps/) |
| `FACEBOOK_APP_SECRET` | ✅ For Instagram | Facebook App Secret | Same as above |

### Step 3: Configure Facebook App for Instagram

To schedule Instagram Reels, you need a Facebook/Meta App:

1. Go to [Meta for Developers](https://developers.facebook.com/apps/)
2. Create a new app or use existing one
3. Add **Instagram Graph API** product
4. Configure OAuth settings:
   - **Valid OAuth Redirect URI**: `http://localhost:5000/auth/facebook/callback`
   - **App Domains**: `localhost`

5. Required Permissions (request in App Review if needed):
   - `instagram_basic`
   - `instagram_content_publish`
   - `instagram_manage_insights`
   - `pages_read_engagement`
   - `pages_show_list`
   - `business_management`

### Step 4: Push Database Schema

```bash
npm run db:push
```

This creates all necessary tables in your database.

### Step 5: Start the Application

```bash
# Development mode (with hot reload)
npm run dev
```

The app will be available at: **http://localhost:5000**

---

## 🔐 Default Login Credentials

On first startup, a default admin account is created:

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | `Rusk@123` |
| Email | `socialplus@ruskmedia.com` |

⚠️ **Change these credentials after first login for security!**

---

## 🔧 Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run db:push` | Push schema changes to database |
| `npm run check` | TypeScript type checking |

---

## 📱 Connecting Instagram Business Account

1. Log into the app with admin credentials
2. Go to **Instagram Accounts** section
3. Click **Connect Instagram**
4. Authorize with Facebook (Instagram must be connected to a Facebook Page)
5. Your Instagram Business accounts will be auto-discovered

---

## 🎬 Scheduling Instagram Reels

1. Go to **All Posts** or **Publishing Calendar**
2. Click **Create Post**
3. Select your Instagram account
4. Choose **Reel** as media type
5. Upload your video (must meet Instagram requirements):
   - Duration: 3 seconds to 15 minutes
   - Aspect ratio: 9:16 recommended
   - Format: MP4, MOV
6. Add caption and schedule time
7. Save the post

---

## 🐛 Troubleshooting

### Database Connection Error
```
Error: DATABASE_URL must be set
```
**Solution**: Ensure `.env` file exists and `DATABASE_URL` is set correctly.

### Facebook OAuth Error
```
Error: Facebook App ID/Secret not configured
```
**Solution**: Add `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` to your `.env` file.

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::5000
```
**Solution**: Kill the process using port 5000:
```bash
lsof -ti:5000 | xargs kill -9
```

### Instagram Publishing Fails
- Ensure your Instagram account is a **Business** or **Creator** account
- The Instagram account must be connected to a **Facebook Page**
- Your Facebook App must have the required permissions approved

---

## 📁 Project Structure

```
SocialPublisher/
├── client/           # React frontend
│   ├── src/
│   │   ├── components/   # UI components
│   │   ├── pages/        # Page components
│   │   └── services/     # API services
├── server/           # Express backend
│   ├── routes/       # API routes
│   ├── services/     # Business logic
│   └── utils/        # Utility functions
├── shared/           # Shared types and schema
└── docs/             # Documentation
```

---

## 🔄 Making Changes

### Frontend Changes
- Edit files in `client/src/`
- Hot reload will automatically refresh

### Backend Changes  
- Edit files in `server/`
- Server restarts automatically in dev mode

### Database Schema Changes
1. Edit `shared/schema.ts`
2. Run `npm run db:push`

---

## 📞 Support

If you encounter issues:
1. Check the terminal for error messages
2. Review the browser console (F12 → Console)
3. Verify all environment variables are set correctly
4. Ensure PostgreSQL is running (if using local)

---

## 🚫 What NOT to Commit

These files contain sensitive data and should never be committed:
- `.env` (contains secrets)
- `cookies.txt`
- Any files with access tokens

---

Happy scheduling! 🎉

