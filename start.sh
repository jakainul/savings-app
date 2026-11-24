#!/bin/bash

echo "🚀 Starting Savings Master..."
echo "================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm first."
    exit 1
fi

echo "✅ Node.js and npm are installed"

# Check if .env file exists in backend
if [ ! -f "backend/.env" ]; then
    echo "⚠️  WARNING: backend/.env file not found!"
    echo "📝 Creating .env file from .env.example..."
    cp backend/.env.example backend/.env
    echo ""
    echo "⚠️  IMPORTANT: You need to add your Eulerpool API key!"
    echo "   1. Open backend/.env in a text editor"
    echo "   2. Replace 'YOUR_KEY' with your actual API key"
    echo "   3. Get a free API key at: https://eulerpool.com/developers"
    echo ""
    read -p "Press Enter to continue after you've added your API key..."
fi

# Install dependencies if node_modules don't exist
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install
    cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install
    cd ..
fi

echo "🔧 Starting backend server..."
(cd backend && npm start) &
BACKEND_PID=$!

echo "⏳ Waiting for backend to start..."
sleep 3

echo "🎨 Starting frontend server..."
(cd frontend && npm start) &
FRONTEND_PID=$!

echo ""
echo "🎉 Savings Master is starting!"
echo "================================"
echo "Backend:  http://localhost:5001"
echo "Frontend: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"

# Cleanup function
cleanup() {
    echo ""
    echo "🛑 Shutting down Savings Master..."
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo "✅ Servers stopped. Goodbye!"
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup INT TERM

# Wait for processes
wait