# Trivia Game

<img width="929" height="514" alt="Screenshot 2026-02-18 at 7 15 03 PM" src="https://github.com/user-attachments/assets/c06d7e26-78f4-41ad-8f71-3e19c7699e91" />


This is a minimal multiplayer trivia demo using Node/Express and Socket.io.

Features implemented:
- Create a room and share the Room ID
- Join a room with a display name
- Host can start a 10-question game (questions fetched from Open Trivia DB)
- Server runs a 15-second timer per question (server-authoritative)
- Server validates submission time and calculates scores using speed bonus
- Live scoreboard and final rankings

How to run locally:

1. Install dependencies

```bash
cd /Users/cadykocanda/Development/triviagame
npm install
```

2. Start the server

```bash
npm start
```

3. Open http://localhost:3000 in multiple browser windows/tabs. Create a room, copy the Room ID or share the link, join from other windows, and start the game.

Notes and next steps:
- This demo uses in-memory game state. For production, use Redis for active game state and MongoDB for persistent data.
- The frontend is a lightweight, plain-HTML/JS client for quick testing. You can replace it with React or Next.js easily: the client protocol is socket events.
- Add authentication, persistent user stats, and reconnection handling for robustness.
