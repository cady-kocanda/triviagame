const socket = io();

// UI elements
const hostNameEl = document.getElementById('hostName');
const createRoomBtn = document.getElementById('createRoom');
const playerNameEl = document.getElementById('playerName');
const roomIdEl = document.getElementById('roomId');
const joinRoomBtn = document.getElementById('joinRoom');
const roomInfo = document.getElementById('roomInfo');
const myRoomIdEl = document.getElementById('myRoomId');
const playersList = document.getElementById('playersList');
const startGameBtn = document.getElementById('startGame');
const linkArea = document.getElementById('linkArea');
const gameOverActions = document.getElementById('gameOverActions');
const backHomeBtn = document.getElementById('backHome');

const lobby = document.getElementById('lobby');
const gameDiv = document.getElementById('game');
const qtitle = document.getElementById('qtitle');
const choicesDiv = document.getElementById('choices');
const timerEl = document.getElementById('timer');
const statusEl = document.getElementById('status');
const scoreboardEl = document.getElementById('scoreboard');

let myRoomId = null;
let isHost = false;
let myName = null;
let currentQuestionDeadline = null;
let localTimerInterval = null;

createRoomBtn.onclick = () => {
  myName = hostNameEl.value || 'Host';
  socket.emit('create_room', { name: myName });
};

joinRoomBtn.onclick = () => {
  const rid = roomIdEl.value.trim();
  if (!rid) return alert('Enter room ID');
  myName = playerNameEl.value || 'Player';
  socket.emit('join_room', { roomId: rid, name: myName });
  myRoomId = rid;
  isHost = false;
  showRoomInfo();
};

startGameBtn.onclick = () => {
  if (!myRoomId) return;
  socket.emit('start_game', { roomId: myRoomId });
};

socket.on('room_created', ({ roomId }) => {
  myRoomId = roomId;
  isHost = true;
  showRoomInfo();
  // server sends a LAN-accessible link when possible
  // fall back to location.origin if link isn't provided
  linkArea.innerHTML = `Share this link: <code>${location.origin}?room=${roomId}</code>`;
});

socket.on('room_created', ({ roomId, link }) => {
  // update with server-provided link (prefers LAN IP)
  linkArea.innerHTML = `Share this link: <code>${link || (location.origin + '?room=' + roomId)}</code>`;
});

socket.on('player_list', ({ players }) => {
  playersList.innerHTML = players.map(p => `<li>${p.name} — ${p.score}</li>`).join('');
});

socket.on('game_started', ({ total }) => {
  lobby.classList.add('hidden');
  gameDiv.classList.remove('hidden');
  statusEl.textContent = 'Game started';
});

socket.on('question', ({ index, total, question, choices, duration }) => {
  qtitle.textContent = `Q${index}/${total}: ${decodeHtml(question)}`;
  choicesDiv.innerHTML = '';
  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'choice';
    btn.innerHTML = decodeHtml(c);
    btn.onclick = () => submitAnswer(c, btn);
    choicesDiv.appendChild(btn);
  });
  // set local timer display
  const start = Date.now();
  currentQuestionDeadline = start + duration * 1000;
  if (localTimerInterval) clearInterval(localTimerInterval);
  localTimerInterval = setInterval(() => {
    const remainMs = currentQuestionDeadline - Date.now();
    const remain = Math.max(0, Math.ceil(remainMs / 1000));
    timerEl.textContent = `Time left: ${remain}s`;
    if (remain <= 0) clearInterval(localTimerInterval);
  }, 200);
  statusEl.textContent = '';
});

socket.on('answer_received', () => {
  statusEl.textContent = 'Answer received';
});

socket.on('answer_rejected', ({ reason }) => {
  statusEl.textContent = `Answer rejected: ${reason}`;
});

socket.on('reveal', ({ correctAnswer, scoreboard }) => {
  statusEl.textContent = `Correct: ${decodeHtml(correctAnswer)}`;
  scoreboardEl.innerHTML = '<h3>Scoreboard</h3>' + scoreboard.map(s => `<div>${s.name}: ${s.score}</div>`).join('');
});

socket.on('game_over', ({ rankings }) => {
  statusEl.textContent = 'Game over';
  scoreboardEl.innerHTML = '<h3>Final Rankings</h3>' + rankings.map(r => `<div>${r.name}: ${r.score}</div>`).join('');
  // show action to go back home
  gameOverActions.classList.remove('hidden');
  backHomeBtn.focus();
});

socket.on('error_message', ({ message }) => {
  alert(message);
});

function submitAnswer(answer, btnEl) {
  if (!myRoomId) return;
  socket.emit('submit_answer', { roomId: myRoomId, answer });
  // disable buttons
  Array.from(choicesDiv.querySelectorAll('button')).forEach(b => b.disabled = true);
  btnEl.style.background = '#ddd';
}

function showRoomInfo() {
  lobby.querySelector('#create').classList.add('hidden');
  lobby.querySelector('#join').classList.add('hidden');
  roomInfo.classList.remove('hidden');
  myRoomIdEl.textContent = myRoomId;
  if (!isHost) startGameBtn.style.display = 'none';
}

backHomeBtn.onclick = () => {
  // reset UI to lobby
  gameDiv.classList.add('hidden');
  lobby.classList.remove('hidden');
  roomInfo.classList.add('hidden');
  // reset scoreboard and status
  scoreboardEl.innerHTML = '';
  statusEl.textContent = '';
  gameOverActions.classList.add('hidden');
  // clear local state
  myRoomId = null;
  isHost = false;
};

function decodeHtml(html) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

// Auto-join if ?room= in URL
(function autoJoin() {
  const params = new URLSearchParams(location.search);
  const rid = params.get('room');
  if (rid) {
    roomIdEl.value = rid;
  }
})();
