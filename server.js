const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const { nanoid } = require('nanoid');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

dotenv.config();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const DB_FILE = process.env.DB_FILE || './data/db.sqlite';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Init DB
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');

// Create tables if not exist
db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  balance INTEGER DEFAULT 1000,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  change_amount INTEGER,
  type TEXT,
  meta TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  type TEXT,
  bet INTEGER,
  status TEXT,
  server_seed TEXT,
  server_seed_hash TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  finished_at INTEGER
)`).run();

db.prepare(`CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  game_id TEXT,
  user_id TEXT,
  confirmed INTEGER DEFAULT 0,
  result TEXT
)`).run();

// Helper funcs
function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth) return res.status(401).json({ error: 'missing auth' });
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) return res.status(401).json({ error: 'invalid auth format' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// API routes
app.post('/api/signup', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(400).json({ error: 'username taken' });
  const id = nanoid();
  const password_hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (id, username, password_hash, balance) VALUES (?, ?, ?, ?)').run(id, username, password_hash, 1000);
  const user = { id, username };
  const token = createToken(user);
  res.json({ token, user });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const user = db.prepare('SELECT id, username, password_hash, balance FROM users WHERE username = ?').get(username);
  if (!user) return res.status(400).json({ error: 'invalid credentials' });
  if (!bcrypt.compareSync(password, user.password_hash)) return res.status(400).json({ error: 'invalid credentials' });
  const token = createToken(user);
  res.json({ token, user: { id: user.id, username: user.username, balance: user.balance } });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// List open games
app.get('/api/rooms', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT g.id, g.type, g.bet, g.status, g.server_seed_hash,
    (SELECT COUNT(*) FROM players p WHERE p.game_id = g.id) as player_count
    FROM games g WHERE g.status != 'finished' ORDER BY g.created_at DESC`).all();
  res.json({ rooms: rows });
});

// Create a room
app.post('/api/rooms', authMiddleware, (req, res) => {
  const { type = 'coinflip', bet = 100, private = true } = req.body || {};
  // check user balance
  const me = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(req.user.id);
  if (!me) return res.status(400).json({ error: 'user not found' });
  if (me.balance < bet) return res.status(400).json({ error: 'insufficient balance' });

  const gameId = nanoid();
  // create game and add creator as player
  const server_seed = crypto.randomBytes(32).toString('hex');
  const server_seed_hash = crypto.createHash('sha256').update(server_seed + gameId).digest('hex');

  const insertGame = db.prepare('INSERT INTO games (id, type, bet, status, server_seed, server_seed_hash) VALUES (?, ?, ?, ?, ?, ?)');
  const insertPlayer = db.prepare('INSERT INTO players (id, game_id, user_id, confirmed) VALUES (?, ?, ?, ?)');
  const gameTxn = db.transaction(() => {
    insertGame.run(gameId, type, bet, 'open', server_seed, server_seed_hash);
    insertPlayer.run(nanoid(), gameId, req.user.id, 0);
  });
  gameTxn();

  // broadcast lobby update
  io.emit('lobby_update');
  res.json({ gameId });
});

// Join a room
app.post('/api/rooms/:id/join', authMiddleware, (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ? AND status != "finished"').get(req.params.id);
  if (!game) return res.status(404).json({ error: 'game not found' });

  const existing = db.prepare('SELECT id FROM players WHERE game_id = ? AND user_id = ?').get(game.id, req.user.id);
  if (existing) return res.status(400).json({ error: 'already in room' });

  const me = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(req.user.id);
  if (me.balance < game.bet) return res.status(400).json({ error: 'insufficient balance' });

  db.prepare('INSERT INTO players (id, game_id, user_id, confirmed) VALUES (?, ?, ?, ?)').run(nanoid(), game.id, req.user.id, 0);
  io.to(game.id).emit('room_update', { gameId: game.id });
  io.emit('lobby_update');
  res.json({ ok: true });
});

// Simple endpoint to get room state
app.get('/api/rooms/:id', authMiddleware, (req, res) => {
  const game = db.prepare('SELECT id, type, bet, status, server_seed_hash FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).json({ error: 'game not found' });
  const players = db.prepare('SELECT p.user_id, u.username, p.confirmed FROM players p JOIN users u ON u.id = p.user_id WHERE p.game_id = ?').all(req.params.id);
  res.json({ game, players });
});

// Socket.IO logic
io.on('connection', (socket) => {
  // simple token auth on connection query
  const token = socket.handshake.auth && socket.handshake.auth.token;
  let uid = null;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      uid = payload.id;
      socket.user = payload;
    } catch (err) {}
  }

  socket.on('join_room', (data) => {
    const { roomId } = data || {};
    if (!roomId) return;
    socket.join(roomId);
    // send latest room state
    const game = db.prepare('SELECT id, type, bet, status, server_seed_hash FROM games WHERE id = ?').get(roomId);
    const players = db.prepare('SELECT p.user_id, u.username, p.confirmed FROM players p JOIN users u ON u.id = p.user_id WHERE p.game_id = ?').all(roomId);
    socket.emit('room_state', { game, players });
  });

  socket.on('leave_room', (data) => {
    if (data && data.roomId) socket.leave(data.roomId);
  });

  // confirm participation and start when both confirmed
  socket.on('confirm_start', async (data) => {
    const { roomId } = data || {};
    if (!uid) { socket.emit('error_msg', { message: 'not authenticated' }); return; }
    const player = db.prepare('SELECT id, game_id, user_id, confirmed FROM players WHERE game_id = ? AND user_id = ?').get(roomId, uid);
    if (!player) { socket.emit('error_msg', { message: 'not in room' }); return; }

    // mark confirmed
    db.prepare('UPDATE players SET confirmed = 1 WHERE id = ?').run(player.id);

    // re-check players
    const players = db.prepare('SELECT p.id, p.user_id, u.username, p.confirmed FROM players p JOIN users u ON u.id = p.user_id WHERE p.game_id = ?').all(roomId);
    io.to(roomId).emit('room_state', { players });

    // if two players and all confirmed => start
    if (players.length === 2 && players.every(p => p.confirmed)) {
      // fetch game
      const game = db.prepare('SELECT * FROM games WHERE id = ?').get(roomId);
      if (!game || game.status === 'finished' || game.status === 'running') return;

      // atomic resolution: lock via transaction
      const resolveTxn = db.transaction(() => {
        // re-fetch balances FOR UPDATE is implicit in SQLite single-writer
        const p1 = players[0];
        const p2 = players[1];

        const u1 = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(p1.user_id);
        const u2 = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(p2.user_id);

        // simple check
        if (u1.balance < game.bet || u2.balance < game.bet) {
          // cancel game
          db.prepare('UPDATE games SET status = ? WHERE id = ?').run('canceled', roomId);
          io.to(roomId).emit('game_canceled', { reason: 'insufficient balance' });
          return;
        }

        // take bets (deduct)
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(game.bet, u1.id);
        db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(game.bet, u2.id);
        db.prepare('INSERT INTO ledger (id, user_id, change_amount, type, meta) VALUES (?, ?, ?, ?, ?)').run(nanoid(), u1.id, -game.bet, 'bet', JSON.stringify({ game: roomId }));
        db.prepare('INSERT INTO ledger (id, user_id, change_amount, type, meta) VALUES (?, ?, ?, ?, ?)').run(nanoid(), u2.id, -game.bet, 'bet', JSON.stringify({ game: roomId }));

        // set status running
        db.prepare('UPDATE games SET status = ? WHERE id = ?').run('running', roomId);
      });

      resolveTxn();

      // publish start event with server_seed_hash
      const gameLatest = db.prepare('SELECT id, server_seed_hash FROM games WHERE id = ?').get(roomId);
      io.to(roomId).emit('game_start', { gameId: roomId, server_seed_hash: gameLatest.server_seed_hash });

      // small delay to simulate real play then resolve
      setTimeout(() => {
        const gameDet = db.prepare('SELECT * FROM games WHERE id = ?').get(roomId);
        if (!gameDet) return;

        // deterministic outcome from server_seed + gameId (client_seed omitted for simplicity)
        const h = crypto.createHash('sha256').update(gameDet.server_seed + roomId).digest('hex');
        // pick outcome: even/odd of last byte bit
        const outcomeBit = parseInt(h.slice(-2), 16) % 2; // 0 or 1
        // player order deterministic: players[0] = heads(0), players[1] = tails(1)
        const winner = players[outcomeBit]; // winner object

        // payout: winner gets both bets (2 * bet)
        const payout = gameDet.bet * 2;
        const payoutTxn = db.transaction(() => {
          db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(payout, winner.user_id);
          db.prepare('INSERT INTO ledger (id, user_id, change_amount, type, meta) VALUES (?, ?, ?, ?, ?)').run(nanoid(), winner.user_id, payout, 'win', JSON.stringify({ game: roomId, outcomeBit }));
          db.prepare('UPDATE games SET status = ?, finished_at = strftime(\'%s\',\'now\') WHERE id = ?').run('finished', roomId);
          // record player results
          players.forEach(p => {
            const result = (p.user_id === winner.user_id) ? 'win' : 'lose';
            db.prepare('UPDATE players SET result = ? WHERE id = ?').run(result, p.id);
          });
        });
        payoutTxn();

        // broadcast result and reveal seed
        io.to(roomId).emit('game_end', {
          gameId: roomId,
          winnerUserId: winner.user_id,
          payout,
          server_seed_reveal: gameDet.server_seed,
          server_seed_hash: gameDet.server_seed_hash,
          outcomeBit,
        });

        // update lobby
        io.emit('lobby_update');
      }, 800); // short delay
    }
  });

  socket.on('disconnect', () => {
    // nothing special
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Server running at http://${HOST}:${PORT}`);
});
