# Minimal Play-Money Coin-Flip (copy-pasteable)

This is a minimal play-money multiplayer coin-flip app (Node.js + Express + Socket.IO + SQLite).
It includes:
- Sign up / login (JWT)
- Persistent balances (users table)
- Lobby, create/join private rooms
- 2-player coin flip with server-side commit/reveal (server_seed_hash → reveal)
- Simple ledger entries for bets/wins

Run locally:
1. Install Node 18+ and npm
2. Paste files into a folder
3. cp .env.example .env and edit if desired
4. npm install
5. npm start
6. Open http://localhost:3000

Or with Docker:
- docker-compose up --build
- Open http://localhost:3000

Default credentials:
- Start by creating an account in the UI. New accounts start with 1000 credits.

Important:
- This is a learning PoC. For production you must enable HTTPS, secure JWT secret, add rate limiting, proper session controls, input sanitization, logging, monitoring, and tests.
