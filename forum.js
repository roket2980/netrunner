// Simple Hacker Terminal Forum: Single-file Node.js Server
// Usage: node forum.js
const express = require('express');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'forum_data.json');
const PORT = process.env.PORT || 4000;

// Data loading/saving helpers
function loadData() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { threads: [], posts: [] };
  }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Ensure data file exists
if (!fs.existsSync(DATA_FILE)) saveData({ threads: [], posts: [] });

const app = express();
app.use(express.json());

// --- API ENDPOINTS ---

// Get all threads
app.get('/api/threads', (req, res) => {
  const data = loadData();
  res.json(data.threads);
});

// Create a new thread
app.post('/api/threads', (req, res) => {
  const { title, author } = req.body;
  if (!title || !author) return res.status(400).json({ error: 'Missing title or author' });
  const data = loadData();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const thread = { id, title, author, created: new Date().toISOString() };
  data.threads.push(thread);
  saveData(data);
  res.json({ id });
});

// Get posts for a thread
app.get('/api/threads/:threadId/posts', (req, res) => {
  const data = loadData();
  const posts = data.posts.filter(p => p.threadId === req.params.threadId);
  res.json(posts);
});

// Add post to thread
app.post('/api/threads/:threadId/posts', (req, res) => {
  const { content, author } = req.body;
  if (!content || !author) return res.status(400).json({ error: 'Missing content or author' });
  const data = loadData();
  const post = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2,7),
    threadId: req.params.threadId,
    content, author,
    created: new Date().toISOString()
  };
  data.posts.push(post);
  saveData(data);
  res.json({ ok: true });
});

// --- FRONTEND (serves index.html) ---
const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Hax0r Terminal Forum</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body {
      background: #111;
      color: #33ff33;
      font-family: monospace;
      margin: 0;
      min-height: 100vh;
    }
    .terminal-box {
      background: #111;
      color: #33ff33;
      border: 2px solid #33ff33;
      border-radius: 6px;
      max-width: 700px;
      margin: 40px auto;
      padding: 28px;
      box-shadow: 0 0 24px #000a;
    }
    h2, h3 {
      margin-top: 0;
      color: #39ff14;
      text-shadow: 0 0 6px #094;
    }
    ul {
      padding-left: 1.3em;
    }
    li {
      margin-bottom: 6px;
    }
    input, textarea, button {
      background: #111;
      color: #33ff33;
      border: 1px solid #33ff33;
      font-family: monospace;
      font-size: 1em;
      border-radius: 2px;
      outline: none;
    }
    input, textarea {
      padding: 3px 6px;
    }
    textarea {
      min-height: 42px;
      width: 90%;
      margin-top: 4px;
      resize: vertical;
    }
    button {
      padding: 4px 10px;
      margin-left: 10px;
      cursor: pointer;
      transition: background 0.15s;
    }
    button:hover {
      background: #333;
    }
    .thread-link {
      cursor: pointer;
      text-decoration: underline;
      color: #6f6;
    }
    .thread-link:hover {
      color: #fff;
      background: #222;
    }
    .post-author {
      color: #c3ffb6;
      font-weight: bold;
      margin-right: 6px;
    }
    .post-date {
      color: #098;
      font-size: 10px;
      margin-left: 10px;
    }
    .back-btn {
      margin-bottom: 14px;
      margin-top: 0;
      display: inline-block;
    }
    .label {
      color: #0ff;
      margin-bottom: 4px;
      font-size: 0.95em;
      display: block;
    }
    @media (max-width: 730px) {
      .terminal-box { max-width: 98vw; padding: 3vw;}
    }
  </style>
</head>
<body>
  <div class="terminal-box" id="app">
    <!-- Rendered by JS -->
    <noscript>
      <b>Enable JavaScript for the forum to work!</b>
    </noscript>
  </div>
  <script>
    // --- FORUM LOGIC BELOW ---

    // == API ENDPOINT ==
    const API = "";
    // "" means same origin (works when served from the same server)

    // == MAIN UI LOGIC ==
    let state = {
      threads: [],
      posts: [],
      selected: null,
      author: localStorage.haxorAuthor || "anon",
      loading: true
    };

    // Helper: Format date
    function fmtDate(dt) {
      return new Date(dt).toLocaleString();
    }

    // Helper: escape HTML
    function esc(s) {
      return (""+s).replace(/[&<>"]/g, c => (
        { "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c]
      ));
    }

    // Set state and re-render
    function setState(patch) {
      Object.assign(state, patch);
      render();
    }

    async function load() {
      setState({loading:true});
      try {
        const t = await fetch(API + "/api/threads").then(r => r.json());
        setState({threads: t, loading:false});
      } catch (e) {
        setState({loading:false});
        alert("Failed to load forum data.");
      }
    }

    async function loadPosts(threadId) {
      try {
        const p = await fetch(API + "/api/threads/" + threadId + "/posts").then(r => r.json());
        setState({posts: p});
      } catch {}
    }

    async function addThread(title, author) {
      if (!title.trim()) return;
      await fetch(API + "/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, author })
      });
      await load();
    }

    async function addPost(threadId, content, author) {
      if (!content.trim()) return;
      await fetch(API + "/api/threads/" + threadId + "/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, author })
      });
      await loadPosts(threadId);
    }

    // == RENDERING ==
    function render() {
      const app = document.getElementById("app");
      if (state.loading) {
        app.innerHTML = "<h2>_Hax0r Forum v1.0_</h2><p>Loading...</p>";
        return;
      }
      if (state.selected) {
        // Show thread view
        const thread = state.threads.find(t => t.id === state.selected);
        if (!thread) { setState({selected:null}); return; }
        app.innerHTML = \`
          <button class="back-btn" onclick="window.forumBack()">&lt; Back</button>
          <h3>[${esc(thread.author)}] ${esc(thread.title)}</h3>
          <ul id="thread-posts"></ul>
          <form onsubmit="window.forumReply();return false;">
            <span class="label">Reply as:</span>
            <input id="reply-author" value="${esc(state.author)}" style="width:80px"
              oninput="window.forumSetAuthor(this.value)">
            <textarea id="reply-content" placeholder="Type your reply..."></textarea>
            <button type="submit">+ Reply</button>
          </form>
        \`;
        // Load posts and render them
        loadPosts(thread.id).then(() => {
          const posts = state.posts;
          document.getElementById("thread-posts").innerHTML =
            posts.map(p => \`
              <li>
                <span class="post-author">[${esc(p.author)}]</span>
                ${esc(p.content)}
                <span class="post-date">${fmtDate(p.created)}</span>
              </li>
            \`).join("");
        });
        setTimeout(() => { document.getElementById("reply-content")?.focus(); }, 1);
      } else {
        // Show thread list
        app.innerHTML = \`
          <h2>_Hax0r Forum v1.0_</h2>
          <span class="label">User:</span>
          <input id="user-author" value="${esc(state.author)}" style="width:100px"
            oninput="window.forumSetAuthor(this.value)">
          <h3>Threads</h3>
          <ul>
            \${state.threads.map(t => \`
              <li>
                <span class="thread-link" onclick="window.forumOpen('\${t.id}')">
                  [\${esc(t.author)}] \${esc(t.title)}
                </span>
                <span class="post-date">\${fmtDate(t.created)}</span>
              </li>
            \`).join("") || "<li>No threads yet.</li>"}
          </ul>
          <form onsubmit="window.forumNewThread();return false;">
            <input id="thread-title" placeholder="New thread title" style="width:70%">
            <button type="submit">+ New Thread</button>
          </form>
          <div style="margin-top:36px;font-size:12px;color:#888;">
            <b>Tip:</b> Share this page URL with your friends. Everyone sees the same forum.
          </div>
        \`;
        setTimeout(() => { document.getElementById("thread-title")?.focus(); }, 1);
      }
    }

    // == EVENT HANDLERS (exposed globally) ==
    window.forumOpen = function(id) {
      setState({selected: id});
    };
    window.forumBack = function() {
      setState({selected: null, posts: []});
    };
    window.forumSetAuthor = function(val) {
      state.author = val.replace(/[^a-zA-Z0-9_.-]/g, "").slice(0,20) || "anon";
      localStorage.haxorAuthor = state.author;
      render();
    };
    window.forumNewThread = async function() {
      const title = document.getElementById("thread-title").value;
      await addThread(title, state.author);
      document.getElementById("thread-title").value = "";
      render();
    };
    window.forumReply = async function() {
      const content = document.getElementById("reply-content").value;
      await addPost(state.selected, content, state.author);
      document.getElementById("reply-content").value = "";
      render();
    };

    // -- INITIALIZE --
    load();
  </script>
</body>
</html>
`;

app.get('/', (req, res) => res.send(html));

// Serve static files if needed (e.g. favicon)
app.use(express.static(__dirname));

// Start server
app.listen(PORT, () => {
  console.log(`Forum running at http://localhost:${PORT}/`);
  console.log(`Share this address on your LAN or deploy to make it public!`);
});
