import React, { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

export default function App() {
  // Simple avatar color map
  function avatarColor(key) {
    switch (key) {
      case 'rose': return 'linear-gradient(135deg,#ff9a9e,#fecfef)'
      case 'teal': return 'linear-gradient(135deg,#7ee8fa,#80ff72)'
      case 'violet': return 'linear-gradient(135deg,#c3a6ff,#ff9fd6)'
      case 'amber': return 'linear-gradient(135deg,#ffd89b,#19547b)'
      case 'pink': return 'linear-gradient(135deg,#ff6a88,#ffb199)'
      default: return '#ccc'
    }
  }
  const [socket, setSocket] = useState(null)
  const [view, setView] = useState('lobby') // lobby, room, game
  const [isHost, setIsHost] = useState(false)
  const [roomId, setRoomId] = useState('')
  const [name, setName] = useState('')
  const [players, setPlayers] = useState([])
  const [link, setLink] = useState('')
  const [avatar, setAvatar] = useState('rose')
  const [prefilledRoom, setPrefilledRoom] = useState(false)
  const [question, setQuestion] = useState(null)
  const [choices, setChoices] = useState([])
  const [timer, setTimer] = useState(0)
  const [duration, setDuration] = useState(15)
  const [status, setStatus] = useState('')
  const [scoreboard, setScoreboard] = useState([])
  const [totalQuestions, setTotalQuestions] = useState(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [selected, setSelected] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => {
    // connect to same origin socket (works over LAN when served by backend)
    const s = io()
    setSocket(s)

    s.on('connect', () => console.log('connected', s.id))

    s.on('room_created', ({ roomId: rid, link: lnk }) => {
      setRoomId(rid)
      setIsHost(true)
      setLink(lnk || `${location.origin}?room=${rid}`)
      setView('room')
    })

    s.on('player_list', ({ players: pls }) => setPlayers(pls))

    s.on('game_started', ({ total }) => {
      setTotalQuestions(total)
      setView('game')
      setStatus('Game started')
      setSubmitted(false)
      setSelected(null)
    })

    s.on('question', ({ index, total, question: q, choices: ch, duration: dur }) => {
      setCurrentIndex(index)
      setQuestion(q)
      setChoices(ch)
      setDuration(dur || 15)
      setTimer(dur || 15)
      setStatus('')
      setSubmitted(false)
      setSelected(null)
      // client countdown
      if (timerRef.current) clearInterval(timerRef.current)
      const deadline = Date.now() + (dur || 15) * 1000
      timerRef.current = setInterval(() => {
        const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
        setTimer(remain)
        if (remain <= 0) clearInterval(timerRef.current)
      }, 200)
    })

    s.on('answer_received', () => setStatus('Answer received'))
    s.on('answer_rejected', ({ reason }) => setStatus('Answer rejected: ' + reason))

    s.on('reveal', ({ correctAnswer, scoreboard: sb }) => {
      setStatus('Correct: ' + decodeHtml(correctAnswer))
      setScoreboard(sb)
    })

    s.on('game_over', ({ rankings }) => {
      setStatus('Game over')
      setScoreboard(rankings)
      setView('game')
    })

    s.on('error_message', ({ message }) => alert(message))

    // auto-fill room from URL if present
    const params = new URLSearchParams(location.search)
    const rid = params.get('room')
    if (rid) {
      setRoomId(rid.toUpperCase())
      setPrefilledRoom(true)
    }

    return () => s.disconnect()
  }, [])

  function decodeHtml(html) {
    const txt = document.createElement('textarea')
    txt.innerHTML = html
    return txt.value
  }

  function createRoom() {
    if (!name) setName('Host')
  socket.emit('create_room', { name: name || 'Host', avatar })
  }

  function joinRoom() {
    if (!roomId) return alert('Enter room ID')
  socket.emit('join_room', { roomId, name: name || 'Player', avatar })
    setIsHost(false)
    setView('room')
  }

  function startGame() {
    socket.emit('start_game', { roomId })
  }

  function submitAnswer(answer) {
    if (submitted) return
    socket.emit('submit_answer', { roomId, answer })
    setSubmitted(true)
    setSelected(answer)
    setStatus('Answer submitted')
  }

  function backHome() {
    setView('lobby')
    setRoomId('')
    setPlayers([])
    setLink('')
    setQuestion(null)
    setChoices([])
    setScoreboard([])
    setStatus('')
    setSubmitted(false)
    setSelected(null)
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
      setStatus('Link copied to clipboard')
      setTimeout(() => setStatus(''), 2000)
    } catch (e) {
      setStatus('Failed to copy')
    }
  }

  // Beautiful lobby
  if (view === 'lobby') {
    // If a room code was provided in the URL, show a focused join-only card
    if (prefilledRoom) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-500 via-indigo-600 to-purple-700 p-6">
          <div className="w-full max-w-md bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-lg">
            <h1 className="text-3xl font-extrabold text-white mb-4">Join Room {roomId}</h1>
            <input className="w-full p-3 rounded mb-3 text-black" placeholder="Your display name" value={name} onChange={e=>setName(e.target.value)} />
            <div className="mb-3">
              <div className="text-sm text-white/80 mb-2">Pick an avatar</div>
              <div className="flex gap-2">
                {['rose','teal','violet','amber','pink'].map(a => (
                  <button key={a} onClick={()=>setAvatar(a)} className={`w-10 h-10 rounded-full ${avatar===a? 'ring-4 ring-white/60':''}`} style={{background: avatarColor(a)}} aria-label={a} />
                ))}
              </div>
            </div>
            <button className="w-full py-3 bg-indigo-400 rounded font-semibold hover:bg-indigo-500 transition" onClick={joinRoom}>Join Room</button>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-500 via-indigo-600 to-purple-700 p-6">
        <div className="w-full max-w-4xl bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-lg">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-4xl font-extrabold text-white">Trivia Royale</h1>
            <div className="text-sm text-white/80">Multiplayer • Server-timed • Fast paced</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white/20 p-5 rounded-lg">
              <h2 className="text-lg font-semibold text-white mb-3">Create a Room</h2>
              <input className="w-full p-3 rounded mb-3 text-black" placeholder="Your display name" value={name} onChange={e=>setName(e.target.value)} />
              <div className="mb-3">
                <div className="text-sm text-white/80 mb-2">Pick an avatar</div>
                <div className="flex gap-2">
                  {['rose','teal','violet','amber','pink'].map(a => (
                    <button key={a} onClick={()=>setAvatar(a)} className={`w-10 h-10 rounded-full ${avatar===a? 'ring-4 ring-white/60':''}`} style={{background: avatarColor(a)}} aria-label={a} />
                  ))}
                </div>
              </div>
              <button className="w-full py-3 bg-emerald-400 rounded font-semibold hover:bg-emerald-500 transition" onClick={createRoom}>Create Room</button>
            </div>

            <div className="bg-white/20 p-5 rounded-lg">
              <h2 className="text-lg font-semibold text-white mb-3">Join a Room</h2>
              <input className="w-full p-3 rounded mb-3 text-black uppercase" placeholder="Room ID" value={roomId} onChange={e=>setRoomId(e.target.value)} />
              <button className="w-full py-3 bg-indigo-400 rounded font-semibold hover:bg-indigo-500 transition" onClick={joinRoom}>Join Room</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Room waiting
  if (view === 'room') {
    return (
      <div className="min-h-screen p-8 bg-gray-50 flex items-start justify-center">
        <div className="w-full max-w-3xl bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold">Room <span className="text-indigo-600">{roomId}</span></h3>
              {isHost && <div className="text-sm text-gray-500">You are the host</div>}
            </div>
            <div className="flex items-center gap-3">
              {link && <div className="text-sm text-gray-600 break-all"><code className="bg-gray-100 px-2 py-1 rounded">{link}</code></div>}
              {link && <button className="px-3 py-2 bg-slate-100 rounded" onClick={copyLink}>Copy</button>}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-semibold">Players</h4>
              <ul className="mt-2 space-y-2">
                {players.map((p,i)=> (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-white" style={{background: avatarColor(p.avatar || 'rose')}}>{p.name?.[0]||'?'}</div>
                    <div>{p.name} <span className="ml-2 text-sm text-gray-500">{p.score}</span></div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="font-semibold">Game Controls</h4>
              <div className="mt-4">
                {isHost ? <button className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700" onClick={startGame}>Start Game</button> : <div className="text-gray-500">Waiting for host to start the game</div>}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Game view
  const pct = Math.max(0, Math.min(100, Math.round((timer / duration) * 100)))
  return (
    <div className="min-h-screen p-8 bg-gradient-to-b from-gray-100 to-white">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-500">Question {currentIndex} / {totalQuestions}</div>
              <h2 className="text-2xl font-bold mt-1">{question ? decodeHtml(question) : 'Loading...'}</h2>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Time</div>
              <div className="text-2xl font-mono font-semibold">{timer}s</div>
            </div>
          </div>

          <div className="mt-4 h-3 bg-gray-200 rounded overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-400 via-yellow-300 to-red-400 transition-all" style={{ width: `${pct}%` }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            {choices.map((c,i)=> {
              const decoded = decodeHtml(c)
              const isSelected = selected === c
              return (
                <button key={i} onClick={()=>submitAnswer(c)} disabled={submitted} className={`p-4 text-left rounded-lg transition-shadow ${submitted ? (isSelected ? 'bg-indigo-100 border-indigo-400 border' : 'bg-gray-50 opacity-70') : 'bg-white hover:shadow-md'}`}>
                  {decoded}
                </button>
              )
            })}
          </div>

          <div className="mt-6 flex items-start justify-between">
            <div>
              <div className="text-sm text-gray-600">{status}</div>
              <div className="mt-3">
                <h4 className="font-semibold">Scoreboard</h4>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {scoreboard.map((s,i)=>(
                    <div key={i} className="p-2 bg-gray-50 rounded flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full" style={{background: avatarColor(s.avatar || 'rose')}} />
                      <div>{s.name}: <span className="font-semibold">{s.score}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <button className="px-4 py-2 bg-gray-200 rounded" onClick={backHome}>Back to Home</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
