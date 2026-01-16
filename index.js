const express = require('express');
const http = require('http');
const path = require('path');
const fetch = require('node-fetch');
const { Server } = require('socket.io');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

function getLocalExternalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // prefer IPv4, non-internal addresses
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return null;
}

const HOST_IP = getLocalExternalIp() || 'localhost';

// If a built React client exists at /client/dist, serve it (production build) first
const clientDist = path.join(__dirname, 'client', 'dist');
try {
  const fs = require('fs');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // serve index.html for any unmatched route (client-side routing)
    app.get('*', (req, res) => {
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  } else {
    // Fall back to the older public folder for static assets during development
    app.use(express.static(path.join(__dirname, 'public')));
  }
} catch (err) {
  console.warn('Could not check for client dist:', err.message);
  app.use(express.static(path.join(__dirname, 'public')));
}

// In-memory store for demo. For production, replace with Redis.
const games = {}; // roomId -> game state

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function fetchQuestions(amount = 10) {
  // Use Open Trivia DB for questions. We request multiple choice (type=multiple).
  const url = `https://opentdb.com/api.php?amount=${amount}&type=multiple`;
  const res = await fetch(url);
  const j = await res.json();
  // Normalize format
  return j.results.map((q) => ({
    question: q.question,
    correct_answer: q.correct_answer,
    incorrect_answers: q.incorrect_answers,
    all_answers: shuffle([q.correct_answer, ...q.incorrect_answers])
  }));
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGame(hostSocket, hostName, hostAvatar) {
  const roomId = makeRoomId();
  const game = {
    roomId,
    hostId: hostSocket.id,
    players: {}, // socketId -> {name, score, avatar}
    questions: [],
    currentIndex: -1,
    questionStart: null,
    answers: {}, // socketId -> {answer, timeMs}
    timerHandle: null
  };
  game.players[hostSocket.id] = { name: hostName, score: 0, avatar: hostAvatar || null };
  games[roomId] = game;
  return game;
}

function endGame(roomId) {
  const g = games[roomId];
  if (!g) return;
  // broadcast final rankings
  const rankings = Object.entries(g.players).map(([id, p]) => ({ id, name: p.name, score: p.score }))
    .sort((a, b) => b.score - a.score);
  io.to(roomId).emit('game_over', { rankings });
  // cleanup
  if (g.timerHandle) clearTimeout(g.timerHandle);
  delete games[roomId];
}

function endQuestion(roomId) {
  const g = games[roomId];
  if (!g) return;
  const q = g.questions[g.currentIndex];
  const correct = q.correct_answer;

  // Calculate scores
  const scoreboard = [];
  for (const [sockId, player] of Object.entries(g.players)) {
    const submitted = g.answers[sockId];
    if (submitted && submitted.answer === correct) {
      const elapsed = (submitted.timeMs - g.questionStart) / 1000.0;
      const remaining = Math.max(0, 15 - Math.floor(elapsed));
      const bonus = remaining * 10;
      const points = 500 + bonus;
      player.score += points;
    }
    scoreboard.push({ name: player.name, score: player.score });
  }

  // Reveal correct answer and updated scoreboard
  io.to(roomId).emit('reveal', { correctAnswer: correct, scoreboard });

  // prepare next question or finish
  g.answers = {};
  g.questionStart = null;
  g.timerHandle = null;

  if (g.currentIndex + 1 >= g.questions.length) {
    // game over after short delay
    setTimeout(() => endGame(roomId), 1500);
  } else {
    // short delay then next
    setTimeout(() => nextQuestion(roomId), 2000);
  }
}

function nextQuestion(roomId) {
  const g = games[roomId];
  if (!g) return;
  g.currentIndex += 1;
  const q = g.questions[g.currentIndex];
  g.answers = {};
  g.questionStart = Date.now();

  // Send question to room
  io.to(roomId).emit('question', { index: g.currentIndex + 1, total: g.questions.length, question: q.question, choices: q.all_answers, duration: 15 });

  // Start server-side timer
  g.timerHandle = setTimeout(() => {
    endQuestion(roomId);
  }, 15000);
}

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('create_room', async ({ name, avatar }) => {
    const game = createGame(socket, name || 'Host', avatar || null);
    socket.join(game.roomId);
  // include a LAN-accessible link (uses machine's local IP when available)
  const link = `http://${HOST_IP}:${PORT}/?room=${game.roomId}`;
    io.to(socket.id).emit('room_created', { roomId: game.roomId, link });
  });

  socket.on('join_room', ({ roomId, name, avatar }) => {
    const g = games[roomId];
    if (!g) {
      io.to(socket.id).emit('error_message', { message: 'Room not found' });
      return;
    }
    g.players[socket.id] = { name: name || 'Player', score: 0, avatar: avatar || null };
    socket.join(roomId);
    io.to(roomId).emit('player_list', { players: Object.values(g.players).map(p => ({ name: p.name, score: p.score, avatar: p.avatar })) });
  });

  socket.on('start_game', async ({ roomId }) => {
    const g = games[roomId];
    if (!g) return;
    if (g.hostId !== socket.id) return;
    // Fetch questions
    try {
      const qs = await fetchQuestions(10);
      g.questions = qs;
      g.currentIndex = -1;
      io.to(roomId).emit('game_started', { total: qs.length });
      nextQuestion(roomId);
    } catch (err) {
      console.error('failed fetching questions', err);
      io.to(roomId).emit('error_message', { message: 'Failed to fetch questions' });
    }
  });

  socket.on('submit_answer', ({ roomId, answer }) => {
    const g = games[roomId];
    if (!g || g.questionStart == null) return;
    const now = Date.now();
    const elapsed = (now - g.questionStart) / 1000.0;
    if (elapsed > 15) {
      // Too late
      io.to(socket.id).emit('answer_rejected', { reason: 'timeout' });
      return;
    }
    // accept first answer only
    if (!g.answers[socket.id]) {
      g.answers[socket.id] = { answer, timeMs: now };
      io.to(socket.id).emit('answer_received');
    }
  });

  socket.on('leave_room', ({ roomId }) => {
    const g = games[roomId];
    if (!g) return;
    delete g.players[socket.id];
    socket.leave(roomId);
    io.to(roomId).emit('player_list', { players: Object.values(g.players).map(p => ({ name: p.name, score: p.score })) });
    if (Object.keys(g.players).length === 0) {
      // cleanup
      if (g.timerHandle) clearTimeout(g.timerHandle);
      delete games[roomId];
    }
  });

  socket.on('disconnect', () => {
    // remove from any games
    for (const [roomId, g] of Object.entries(games)) {
      if (g.players[socket.id]) {
        delete g.players[socket.id];
        io.to(roomId).emit('player_list', { players: Object.values(g.players).map(p => ({ name: p.name, score: p.score })) });
        if (Object.keys(g.players).length === 0) {
          if (g.timerHandle) clearTimeout(g.timerHandle);
          delete games[roomId];
        }
      }
    }
  });
});

server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
