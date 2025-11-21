(async () => {
  const api = (path, opts = {}) => fetch('/api' + path, opts).then(r => r.json());
  let token = localStorage.getItem('token') || null;
  let me = null;
  const socket = io({ auth: { token } });

  const el = (id) => document.getElementById(id);

  function setAuth(user, t) {
    me = user;
    token = t;
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
    document.querySelector('#auth-forms').style.display = t ? 'none' : 'block';
    document.querySelector('#me').style.display = t ? 'block' : 'none';
    document.querySelector('#lobby').style.display = t ? 'block' : 'none';
    el('me-username').innerText = user ? user.username : '';
    el('me-balance').innerText = user ? user.balance : '';
    socket.auth = { token };
    socket.connect();
    loadRooms();
  }

  // signup/login
  el('btn-signup').onclick = async () => {
    const username = el('su-username').value.trim();
    const password = el('su-password').value;
    const res = await api('/signup', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ username, password }) });
    if (res.error) return alert(res.error);
    setAuth(res.user, res.token);
  };

  el('btn-login').onclick = async () => {
    const username = el('li-username').value.trim();
    const password = el('li-password').value;
    const res = await api('/login', { method: 'POST', headers: { 'content-type':'application/json' }, body: JSON.stringify({ username, password }) });
    if (res.error) return alert(res.error);
    setAuth(res.user, res.token);
  };

  el('btn-logout').onclick = () => {
    setAuth(null, null);
    socket.disconnect();
  };

  el('btn-create').onclick = async () => {
    const bet = parseInt(el('bet-amount').value || '100', 10);
    const res = await api('/rooms', { method: 'POST', headers: { 'content-type':'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ bet }) });
    if (res.error) return alert(res.error);
    loadRooms();
  };

  el('btn-join').onclick = async () => {
    const roomId = el('room-id').innerText;
    const res = await api('/rooms/' + roomId + '/join', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
    if (res.error) return alert(res.error);
    socket.emit('join_room', { roomId });
    loadRoom(roomId);
  };

  el('btn-confirm').onclick = async () => {
    const roomId = el('room-id').innerText;
    socket.emit('confirm_start', { roomId });
  };

  async function loadProfile() {
    if (!token) return;
    const res = await api('/me', { headers: { Authorization: 'Bearer ' + token } });
    if (res.user) setAuth(res.user, token);
    else setAuth(null, null);
  }

  async function loadRooms() {
    if (!token) return;
    const res = await api('/rooms', { headers: { Authorization: 'Bearer ' + token } });
    const roomsEl = el('rooms');
    roomsEl.innerHTML = '';
    res.rooms.forEach(r => {
      const d = document.createElement('div');
      d.className = 'room';
      d.innerHTML = `<div>Game ${r.id}</div><div>Type: ${r.type}</div><div>Bet: ${r.bet}</div><div>Players: ${r.player_count}</div>
        <button data-id="${r.id}" class="btn-open">Open</button>`;
      roomsEl.appendChild(d);
    });
    document.querySelectorAll('.btn-open').forEach(b => {
      b.onclick = () => {
        const id = b.getAttribute('data-id');
        socket.emit('join_room', { roomId: id });
        loadRoom(id);
      };
    });
  }

  async function loadRoom(id) {
    const res = await api('/rooms/' + id, { headers: { Authorization: 'Bearer ' + token } });
    if (res.error) return alert(res.error);
    el('room-area').style.display = 'block';
    el('room-id').innerText = id;
    const players = res.players;
    el('room-players').innerHTML = players.map(p => `<div>${p.username} ${p.confirmed ? '(confirmed)' : ''}</div>`).join('');
    el('game-log').innerText = '';
    socket.emit('join_room', { roomId: id });
  }

  // socket events
  socket.on('connect', () => {
    //console.log('connected');
  });
  socket.on('disconnect', () => {
    //console.log('disconnected');
  });
  socket.on('lobby_update', () => loadRooms());
  socket.on('room_state', (data) => {
    if (!data) return;
    if (data.players) el('room-players').innerHTML = data.players.map(p => `<div>${p.username} ${p.confirmed ? '(confirmed)' : ''}</div>`).join('');
  });
  socket.on('game_start', (d) => {
    el('game-log').innerText += `Game started. server_seed_hash: ${d.server_seed_hash}\n`;
  });
  socket.on('game_end', (d) => {
    el('game-log').innerText += `Game end. Winner: ${d.winnerUserId}. Payout: ${d.payout}. outcomeBit: ${d.outcomeBit}\n`;
    el('game-log').innerText += `server_seed_reveal: ${d.server_seed_reveal}\n`;
    // refresh profile balances
    setTimeout(loadProfile, 300);
    loadRooms();
  });
  socket.on('game_canceled', (d) => {
    alert('Game canceled: ' + (d.reason || 'unknown'));
    loadRooms();
  });

  // init
  if (token) await loadProfile();
  else setAuth(null, null);

  // refresh rooms every 5s
  setInterval(() => { if (token) loadRooms(); }, 5000);
})();
