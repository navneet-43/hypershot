#!/bin/bash

# HyperShot Firebase Deployment Script
# =====================================

set -e

echo "🚀 HyperShot Deployment Script"
echo "=============================="
echo ""

# Check if logged into Firebase
if ! firebase login:list &>/dev/null; then
    echo "❌ Not logged into Firebase. Please run:"
    echo "   firebase login --reauth"
    exit 1
fi

# Check if project is set
PROJECT_ID=$(firebase use 2>/dev/null | grep -o 'hypershot-[a-z0-9-]*' || echo "")
if [ -z "$PROJECT_ID" ]; then
    echo "❌ No Firebase project selected. Please run:"
    echo "   firebase use <your-project-id>"
    echo ""
    echo "Or create a new project:"
    echo "   firebase projects:create hypershot-app"
    exit 1
fi

echo "📦 Using Firebase project: $PROJECT_ID"
echo ""

# Build the project
echo "🔨 Building project..."
npm run build

# Deploy to Firebase Hosting (frontend only for now)
echo ""
echo "🌐 Deploying frontend to Firebase Hosting..."
firebase deploy --only hosting

echo ""
echo "✅ Frontend deployed successfully!"
echo ""
echo "📋 Next steps for backend deployment:"
echo "1. Set up a cloud PostgreSQL database (Neon/Supabase)"
echo "2. Deploy backend to Cloud Run:"
echo "   gcloud run deploy hypershot-api \\"
echo "     --source . \\"
echo "     --region asia-south1 \\"
echo "     --allow-unauthenticated \\"
echo "     --set-env-vars DATABASE_URL=<your-db-url>"
echo ""

