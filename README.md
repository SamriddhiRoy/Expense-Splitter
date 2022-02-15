# Real-Time Expense Splitter

A small, fast web app where a group can add shared expenses and immediately see real-time balances and an auto-calculated set of payments that minimizes transfers. Updates are synced live via WebSockets.

## Tech Stack

- Frontend: React (Vite, TypeScript), Tailwind CSS 
- Backend: Node.js, Express, Socket.IO

## Getting Started

Prerequisites:
- Node.js 18+

### 1) Install dependencies

```bash
# From repo root
cd client && npm install
cd ../server && npm install
```

### 2) Run the backend

```bash
cd server
npm run dev  # or: npm start
```

The server listens on `http://localhost:3001`.

### 3) Run the frontend

```bash
cd client
npm run dev
```

The app runs on `http://localhost:5173`.

## Features

- Create or join a group by ID
- Add members and expenses
- Live updates across all connected clients
- Optimal settlement calculation (greedy pairing of largest creditor/debtor)

## Notes

- This demo uses an in-memory store (data resets on server restart).
- Tailwind v4 is enabled by importing `@import "tailwindcss";` in `client/src/index.css`.


