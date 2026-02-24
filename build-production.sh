#!/bin/bash
# Script de build pour production avec les bonnes variables d'environnement
# À exécuter sur le serveur Sénégal

echo "🚀 Building CodeOnline EDI for production (Senegal server)..."
echo "📍 Server: https://dev.codeonline-edi.net"
echo ""

# Vérifier que le fichier .env existe
if [ ! -f .env ]; then
    echo "⚠️  Warning: .env file not found!"
    echo "Creating .env with default values..."
    echo "VITE_API_BASE_URL=https://dev.codeonline-edi.net" > .env
fi

# Afficher le contenu du .env
echo "📄 Current .env configuration:"
cat .env
echo ""

# Exporter les variables d'environnement pour le build
export VITE_API_BASE_URL=https://dev.codeonline-edi.net

echo "🔧 Environment variables for build:"
echo "   VITE_API_BASE_URL=$VITE_API_BASE_URL"
echo ""

# Nettoyer les anciens builds
echo "🧹 Cleaning old build..."
rm -rf dist

# Installer les dépendances si nécessaire
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Build avec Vite
echo "🏗️  Building application..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build completed successfully!"
    echo ""
    echo "📂 Build output in: ./dist"
    echo ""
    echo "🔍 Verifying build configuration..."
    
    # Vérifier que les variables d'environnement sont bien injectées
    if grep -r "localhost:5000" dist/ 2>/dev/null; then
        echo "⚠️  WARNING: Found localhost:5000 references in build!"
        echo "   The environment variable may not have been injected correctly."
    else
        echo "✅ No localhost references found in build"
    fi
    
    if grep -r "dev.codeonline-edi.net" dist/ 2>/dev/null; then
        echo "✅ Found production URL in build"
    fi
    
    echo ""
    echo "📋 Next steps:"
    echo "   1. Copy dist/ folder to your web server"
    echo "   2. Configure nginx/apache to serve the static files"
    echo "   3. Ensure backend is running on https://dev.codeonline-edi.net:5000"
    echo ""
else
    echo ""
    echo "❌ Build failed!"
    exit 1
fi
