import { useEffect, useRef, useState } from 'react'
import {
  ArrowRight, Check, CircleDot, Code2, Copy, Download, Hand, Laptop,
  Mic, MicOff, MoreHorizontal, PanelRight, PhoneOff, Plus, ScreenShare,
  Send, Smile, Sparkles, Subtitles, Users, Video, VideoOff, Wifi,
} from 'lucide-react'
import { useWebRTC } from './hooks/useWebRTC'
import type { AnnotationPoint, AnnotationStroke } from './hooks/useWebRTC'
import { useLiveTranscription } from './hooks/useLiveTranscription'
import { useSessionRecorder } from './hooks/useSessionRecorder'

type RoomView = 'home' | 'room'
type Tab = 'chat' | 'transcript'
type DrawingTool = AnnotationStroke['tool']

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

function App() {
  const pathRoomId = window.location.pathname.startsWith('/room/') ? decodeURIComponent(window.location.pathname.slice(6)) : ''
  const [view, setView] = useState<RoomView>(pathRoomId ? 'room' : 'home')
  const [roomId, setRoomId] = useState(pathRoomId || 'KORA-84M')
  const [joinCode, setJoinCode] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [handRaised, setHandRaised] = useState(false)
  const [drawingOpen, setDrawingOpen] = useState(false)
  const [drawTool, setDrawTool] = useState<DrawingTool>('pen')
  const [drawColor, setDrawColor] = useState('#f04444')
  const [drawWidth, setDrawWidth] = useState(5)
  const [reactionsOpen, setReactionsOpen] = useState(false)
  const [codeMode, setCodeMode] = useState(false)
  const [tab, setTab] = useState<Tab>('chat')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [devicesOpen, setDevicesOpen] = useState(false)
  const { localStream, remoteStreams, isSharing, error, participants, raisedHands, reactions, messages: liveMessages, isHost, selfId, annotations, connectionQuality, videoDevices, audioDevices, toggleTrack, toggleScreenShare, raiseHand, sendReaction, sendChatMessage, moderate, sendAnnotation, clearAnnotations, selectDevice } = useWebRTC(view === 'room' ? roomId : null)
  const { isRecording, isPaused, formattedTime, error: recordingError, start: startRecording, stop: stopRecording, togglePause } = useSessionRecorder(localStream, remoteStreams)
  const { entries, isListening, isSupported, error: transcriptionError, markdown } = useLiveTranscription(view === 'room' && tab === 'transcript')

  const enterRoom = (id = makeRoomId()) => {
    const normalizedId = id.match(/\/room\/([^/?#]+)/)?.[1] || id.trim()
    setRoomId(normalizedId)
    setView('room')
    window.history.pushState({}, '', `/room/${encodeURIComponent(normalizedId)}`)
  }

  const copyInvite = async () => {
    await navigator.clipboard?.writeText(`${window.location.origin}/room/${roomId}`)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  const sendMessage = () => {
    const trimmed = message.trim()
    if (!trimmed) return
    sendChatMessage(trimmed, codeMode ? trimmed : undefined, codeMode ? 'typescript' : 'text')
    setMessage('')
  }

  const toggleHand = () => {
    const next = !handRaised
    setHandRaised(next)
    raiseHand(next)
  }

  const toggleRecording = () => { if (isRecording) stopRecording(); else startRecording() }
  const exportTranscript = () => {
    const blob = new Blob([`# Compte-rendu MAR-CI Connect\n\n${markdown}\n`], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `mar-ci-transcription-${roomId}.md`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (view === 'home') {
    return <HomeScreen joinCode={joinCode} setJoinCode={setJoinCode} onCreate={() => enterRoom()} onJoin={() => enterRoom(joinCode || makeRoomId())} />
  }

  return (
    <div className="app-shell room-shell">
      <header className="room-header">
          <button className="brand brand-button" onClick={() => { setView('home'); window.history.pushState({}, '', '/') }} aria-label="Retour à l'accueil">
          <span className="brand-mark">M</span><span>MAR-CI <em>Connect</em></span>
        </button>
        <div className="room-meta"><span className={`live-dot quality-${connectionQuality}`} /> <span>{connectionQuality === 'excellent' ? 'Connexion excellente' : connectionQuality === 'good' ? 'Connexion stable' : connectionQuality === 'poor' ? 'Connexion faible' : 'Reconnexion...'}</span><strong>{roomId}</strong></div>
        <div className="header-actions"><button className="ghost-button" onClick={copyInvite}>{copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Lien copié' : 'Copier le lien'}</button><button className="icon-button" onClick={() => setDevicesOpen(!devicesOpen)} aria-label="Choisir les périphériques"><MoreHorizontal size={20} /></button>{devicesOpen && <div className="device-menu"><label>Caméra<select onChange={(event) => void selectDevice('video', event.target.value)} defaultValue=""><option value="" disabled>Choisir...</option>{videoDevices.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label}</option>)}</select></label><label>Micro<select onChange={(event) => void selectDevice('audio', event.target.value)} defaultValue=""><option value="" disabled>Choisir...</option>{audioDevices.map((device) => <option value={device.deviceId} key={device.deviceId}>{device.label}</option>)}</select></label></div>}</div>
      </header>

      <main className="room-main">
        <section className="video-stage">
          <div className="stage-topline"><span className="eyebrow"><Users size={14} /> {remoteStreams.length + 1} participant{remoteStreams.length === 0 ? '' : 's'}</span><span className="timer">00:24:18</span></div>
          {error && <div className="media-warning">{error}</div>}
          {recordingError && <div className="media-warning recording-warning">{recordingError}</div>}
          {isRecording && <div className="recording-indicator"><span className="recording-dot" /> REC {formattedTime}</div>}
          {isRecording && <button className="recording-pause" onClick={togglePause}>{isPaused ? 'Reprendre' : 'Pause'}</button>}
          {isListening && entries.length > 0 && <div className="live-caption">{entries[entries.length - 1]?.text}</div>}
          <div className="video-grid">
            <VideoTile name="Vous" initials="MA" tone="lime" local cameraOn={cameraOn} micOn={micOn} stream={localStream} handRaised={handRaised} />
            {remoteStreams.map((peer, index) => <VideoTile key={peer.id} name={participants.find((item) => item.id === peer.id)?.name || `Participant ${index + 1}`} initials="" tone="blue" active stream={peer.stream} handRaised={raisedHands.includes(peer.id)} />)}
          </div>
          <div className="reaction-stream" aria-live="polite">{reactions.map((reaction) => <span className="floating-reaction-live" key={reaction.id}>{reaction.emoji}</span>)}</div>
          <div className="floating-controls">
            <ControlButton label={micOn ? 'Micro' : 'Micro coupé'} icon={micOn ? <Mic /> : <MicOff />} active={!micOn} onClick={() => setMicOn(toggleTrack('audio'))} />
            <ControlButton label={cameraOn ? 'Caméra' : 'Caméra coupée'} icon={cameraOn ? <Video /> : <VideoOff />} active={!cameraOn} onClick={() => setCameraOn(toggleTrack('video'))} />
            <ControlButton label={isSharing ? 'Arrêter partage' : 'Partager'} icon={<ScreenShare />} active={isSharing} onClick={() => void toggleScreenShare()} />
            <ControlButton label="Annoter" icon={<Sparkles />} active={drawingOpen} onClick={() => setDrawingOpen(!drawingOpen)} />
            <ControlButton label="Lever la main" icon={<Hand />} active={handRaised} onClick={toggleHand} />
            <div className="reaction-control"><ControlButton label="Réactions" icon={<Smile />} active={reactionsOpen} onClick={() => setReactionsOpen(!reactionsOpen)} />{reactionsOpen && <div className="reaction-menu">{['❤️', '👏', '😂', '🔥', '🎉', '👍', '😮'].map((emoji) => <button key={emoji} onClick={() => { sendReaction(emoji); setReactionsOpen(false) }}>{emoji}</button>)}</div>}</div>
            <ControlButton label={isRecording ? 'Arrêter' : 'Enregistrer'} icon={<CircleDot />} active={isRecording} onClick={toggleRecording} />
            <button className="control leave-control" onClick={() => { setView('home'); window.history.pushState({}, '', '/') }}><PhoneOff /><span>Quitter</span></button>
          </div>
          <AnnotationCanvas active={drawingOpen} tool={drawTool} color={drawColor} width={drawWidth} annotations={annotations} onStroke={sendAnnotation} />
          {drawingOpen && <div className="drawing-toolbar"><button className={drawTool === 'pen' ? 'drawing-tool active' : 'drawing-tool'} onClick={() => setDrawTool('pen')} title="Crayon">✎</button><button className={drawTool === 'highlighter' ? 'drawing-tool active' : 'drawing-tool'} onClick={() => setDrawTool('highlighter')} title="Surligneur">▰</button><button className={drawTool === 'rectangle' ? 'drawing-tool active' : 'drawing-tool'} onClick={() => setDrawTool('rectangle')} title="Rectangle">□</button><button className={drawTool === 'arrow' ? 'drawing-tool active' : 'drawing-tool'} onClick={() => setDrawTool('arrow')} title="Flèche">↗</button><div className="drawing-colors">{['#f04444', '#59c56e', '#4c8dff', '#f5d547', '#ffffff'].map((color) => <button key={color} className={drawColor === color ? 'color-swatch selected' : 'color-swatch'} style={{ background: color }} onClick={() => setDrawColor(color)} aria-label={`Couleur ${color}`} />)}</div><label className="stroke-size">{drawWidth}px<input type="range" min="1" max="24" value={drawWidth} onChange={(event) => setDrawWidth(Number(event.target.value))} /></label><button className="drawing-tool clear-tool" onClick={clearAnnotations} title="Effacer tout">⌫</button></div>}
        </section>

        <aside className="side-panel">
          <div className="panel-heading"><div><span className="eyebrow">Collaboration</span><h2>La salle de travail</h2></div><PanelRight size={19} /></div>
          <div className="tabs"><button className={tab === 'chat' ? 'tab active' : 'tab'} onClick={() => setTab('chat')}><Code2 size={16} /> Chat & Code</button><button className={tab === 'transcript' ? 'tab active' : 'tab'} onClick={() => setTab('transcript')}><Subtitles size={16} /> Transcription</button></div>
          {tab === 'chat' ? <>
            <div className="chat-content"><div className="system-note">La réunion a commencé à 09:42</div>{liveMessages.map((item) => <div className="chat-message" key={item.id}><div className="avatar small-avatar">{item.senderId === selfId ? 'MA' : 'MC'}</div><div><div className="message-meta"><strong>{item.senderId === selfId ? 'Vous' : 'Participant'}</strong><span>maintenant</span></div>{item.code ? <div className="code-message"><div><Code2 size={14} /><span>{item.language || 'code'}</span><button onClick={() => void navigator.clipboard?.writeText(item.code || '')}><Copy size={13} /> Copier</button></div><pre><code>{item.code}</code></pre></div> : <p>{item.text}</p>}</div></div>)}</div>
            <div className={`composer ${codeMode ? 'code-composer' : ''}`}><input value={message} onChange={(event) => setMessage(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendMessage()} placeholder={codeMode ? 'Coller un extrait de code...' : 'Écrire un message...'} /><button className={codeMode ? 'composer-active' : ''} onClick={() => setCodeMode(!codeMode)} aria-label="Partager du code"><Code2 size={16} /></button><button onClick={sendMessage} aria-label="Envoyer"><Send size={17} /></button></div>
            {isHost && <div className="moderation-list"><div className="moderation-title">Participants / Modération</div>{participants.filter((item) => item.id !== selfId).map((participant) => <div className="participant-row" key={participant.id}><span>{participant.name}{participant.isHost && ' 👑'}</span><div><button onClick={() => moderate(participant.id, 'mute')} title="Couper le micro"><MicOff size={13} /></button><button onClick={() => moderate(participant.id, 'camera-off')} title="Couper la caméra"><VideoOff size={13} /></button><button className="kick-button" onClick={() => moderate(participant.id, 'kick')} title="Expulser"><PhoneOff size={13} /></button></div></div>)}</div>}
          </> : <Transcript entries={entries} isListening={isListening} isSupported={isSupported} error={transcriptionError} onExport={exportTranscript} />}
        </aside>
      </main>
    </div>
  )
}

function HomeScreen({ joinCode, setJoinCode, onCreate, onJoin }: { joinCode: string; setJoinCode: (value: string) => void; onCreate: () => void; onJoin: () => void }) {
  return <div className="app-shell home-shell"><nav className="home-nav"><div className="brand"><span className="brand-mark">M</span><span>MAR-CI <em>Connect</em></span></div><div className="nav-right"><span className="status-pill"><span className="live-dot" /> Service opérationnel</span><button className="icon-button"><MoreHorizontal size={20} /></button></div></nav><main className="home-main"><div className="home-copy"><span className="eyebrow accent"><Sparkles size={14} /> L'espace de réunion pour avancer</span><h1>Les idées prennent<br /><i>vie ensemble.</i></h1><p>Une visioconférence simple, fluide et pensée pour les équipes qui construisent l'avenir depuis la Côte d'Ivoire.</p><div className="home-actions"><button className="primary-button" onClick={onCreate}><Plus size={18} /> Nouvelle réunion <ArrowRight size={17} /></button><div className="join-form"><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="Code ou lien de réunion" /><button onClick={onJoin}><ArrowRight size={19} /></button></div></div><div className="trusted"><div className="avatar-stack"><span className="avatar tone-coral">AK</span><span className="avatar tone-blue">YN</span><span className="avatar tone-amber">MT</span><span className="avatar more-avatar">+</span></div><span>Rejoignez des équipes<br /><strong>qui font bouger les lignes.</strong></span></div></div><div className="home-visual"><div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" /><div className="visual-card main-card"><div className="visual-card-header"><span className="eyebrow">Aperçu de salle</span><span className="mini-live"><span className="live-dot" /> LIVE</span></div><div className="mini-video-grid"><div className="mini-tile tile-photo">AK<span>Aïcha</span></div><div className="mini-tile tile-gradient">YN<span>Yann</span></div><div className="mini-tile tile-mint">MT<span>Moussa</span></div><div className="mini-tile tile-you">Vous<span>MA</span></div></div><div className="mini-bar"><span><Mic size={14} /> <Video size={14} /></span><span className="mini-progress" /><span><MoreHorizontal size={15} /></span></div></div><div className="floating-stat"><Wifi size={16} /><div><strong>HD</strong><span>Connexion fluide</span></div></div><div className="floating-reaction">✨</div></div></main><footer className="home-footer"><span>MAR-CI CONNECT / 2026</span><span>Visioconférence. Collaboration. Impact.</span><span><Laptop size={14} /> Disponible sur tous vos appareils</span></footer></div>
}

function AnnotationCanvas({ active, tool, color, width, annotations, onStroke }: { active: boolean; tool: DrawingTool; color: string; width: number; annotations: AnnotationStroke[]; onStroke: (stroke: AnnotationStroke) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draftRef = useRef<AnnotationStroke | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.max(1, Math.round(rect.width * ratio))
      canvas.height = Math.max(1, Math.round(rect.height * ratio))
      const context = canvas.getContext('2d')
      if (!context) return
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      drawAnnotations(context, rect.width, rect.height, annotations)
    }
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [annotations])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): AnnotationPoint => {
    const rect = event.currentTarget.getBoundingClientRect()
    return { x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1), y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1) }
  }

  const render = (strokes: AnnotationStroke[]) => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const rect = canvas.getBoundingClientRect()
    context.clearRect(0, 0, rect.width, rect.height)
    drawAnnotations(context, rect.width, rect.height, strokes)
  }

  const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    draftRef.current = { id: `${Date.now()}-${Math.random()}`, tool, color, width, points: [point] }
    event.currentTarget.setPointerCapture(event.pointerId)
    render([...annotations, draftRef.current])
  }
  const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftRef.current) return
    draftRef.current = { ...draftRef.current, points: [...draftRef.current.points, pointFromEvent(event)] }
    render([...annotations, draftRef.current])
    onStroke(draftRef.current)
  }
  const handleUp = () => {
    if (draftRef.current) onStroke(draftRef.current)
    draftRef.current = null
  }

  return <canvas ref={canvasRef} className="annotation-canvas" style={{ pointerEvents: active ? 'auto' : 'none' }} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp} onPointerCancel={handleUp} aria-label="Canvas d'annotations" />
}

function drawAnnotations(context: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number, strokes: AnnotationStroke[]) {
  strokes.forEach((stroke) => {
    if (stroke.points.length === 0) return
    const points = stroke.points.map((point) => ({ x: point.x * canvasWidth, y: point.y * canvasHeight }))
    context.save()
    context.strokeStyle = stroke.color
    context.fillStyle = stroke.color
    context.lineWidth = stroke.width
    context.lineCap = 'round'
    context.lineJoin = 'round'
    if (stroke.tool === 'highlighter') context.globalAlpha = .3
    if (stroke.tool === 'rectangle' && points.length > 1) {
      const start = points[0]
      const end = points[points.length - 1]
      context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y)
    } else if (stroke.tool === 'arrow' && points.length > 1) {
      const start = points[0]
      const end = points[points.length - 1]
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      context.beginPath(); context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke()
      context.beginPath(); context.moveTo(end.x, end.y); context.lineTo(end.x - 12 * Math.cos(angle - Math.PI / 6), end.y - 12 * Math.sin(angle - Math.PI / 6)); context.lineTo(end.x - 12 * Math.cos(angle + Math.PI / 6), end.y - 12 * Math.sin(angle + Math.PI / 6)); context.closePath(); context.fill()
    } else {
      context.beginPath(); context.moveTo(points[0].x, points[0].y); points.slice(1).forEach((point) => context.lineTo(point.x, point.y)); context.stroke()
    }
    context.restore()
  })
}

function VideoTile({ name, initials, tone, local, cameraOn, micOn, active, stream, handRaised }: { name: string; initials: string; tone: string; local?: boolean; cameraOn?: boolean; micOn?: boolean; active?: boolean; stream?: MediaStream | null; handRaised?: boolean }) {
  const videoRef = (element: HTMLVideoElement | null) => {
    if (element && stream && element.srcObject !== stream) element.srcObject = stream
  }
  return <div className={`video-tile tile-${tone} ${local ? 'local-tile' : ''}`}>{stream && (local ? cameraOn : true) ? <video ref={videoRef} autoPlay playsInline muted={local} /> : <><div className="tile-texture" />{(!local || cameraOn) && <div className="person-initials">{initials || '···'}</div>}</>}{handRaised && <span className="hand-badge" title="Main levée">✋</span>}<div className="tile-label"><span className={`presence ${active || local ? 'on' : ''}`} />{name}{local && ' (vous)'}</div><div className="tile-status">{(local ? micOn : active) ? <Mic size={14} /> : <MicOff size={14} />}</div></div>
}

function ControlButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) { return <button className={`control ${active ? 'control-active' : ''}`} onClick={onClick}>{icon}<span>{label}</span></button> }
function Transcript({ entries, isListening, isSupported, error, onExport }: { entries: { id: string; timestamp: string; text: string; interim?: boolean }[]; isListening: boolean; isSupported: boolean; error: string | null; onExport: () => void }) {
  return <div className="transcript"><div className="transcript-actions"><span className="transcript-status">{isListening ? <><span className="live-dot" /> Écoute en direct</> : 'Transcription inactive'}</span><button className="export-button" onClick={onExport} disabled={entries.length === 0}><Download size={14} /> Exporter .md</button></div>{error && <div className="transcript-error">{error}</div>}{!isSupported && <div className="transcript-tip"><Subtitles size={17} /><span>Essayez Chrome ou Edge pour activer Web Speech.</span></div>}{entries.length === 0 && isSupported && <div className="transcript-empty"><Subtitles size={22} /><span>Parlez pour faire apparaître le compte-rendu en direct.</span></div>}{entries.map((entry) => <div className={`transcript-line ${entry.interim ? 'current' : ''}`} key={entry.id}><span>{entry.timestamp}</span><p><strong>Vous</strong> : {entry.text}</p></div>)}<div className="transcript-tip"><Subtitles size={17} /><span>La transcription locale utilise l’API Web Speech du navigateur.</span></div></div>
}

export default App
