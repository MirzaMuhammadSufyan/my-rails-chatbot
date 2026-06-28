/**
 * WebRTC 1-on-1 Audio/Video calling.
 *
 * Signalling is routed through the existing ChatChannel subscription in chat.js
 * via CustomEvents — no second WebSocket connection is ever opened.
 *
 *   Outgoing signal  → dispatch "call:send-signal"  → chat.js → ChatChannel#call_signal → server
 *   Incoming signal  ← "call:incoming-signal" ← chat.js ← ChatChannel broadcast ← server
 */

const STUN = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.relay.metered.ca:80" }
]

const S = { IDLE: "idle", CALLING: "calling", RINGING: "ringing", CONNECTED: "connected" }

// ─── Module state ─────────────────────────────────────────────────────────────
let state = S.IDLE
let localStream = null
let pc = null
let myName = null
let peerName = null
let audioOnly = false
let pendingCandidates = []
let ringTimeout = null
let callTimerInterval = null
let ringtone = null

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initVideoCall(_roomId, userName) {
  myName = userName
  listenForIncomingSignals()
  wireButtons()
  initDraggablePip()
}

// ─── Signal transport (via CustomEvents → chat.js → ChatChannel) ──────────────

function send(payload) {
  document.dispatchEvent(new CustomEvent("call:send-signal", { detail: { ...payload, from: myName } }))
}

function listenForIncomingSignals() {
  document.addEventListener("call:incoming-signal", (e) => {
    const data = e.detail
    if (data.from === myName) return  // ignore own echo

    switch (data.type) {
      case "call-offer":    return onOffer(data)
      case "call-answer":   return onAnswer(data)
      case "ice-candidate": return onIce(data)
      case "call-rejected": return onRejected(data)
      case "call-ended":    return onEnded(data)
      case "call-busy":     return onBusy(data)
    }
  })
}

// ─── Initiate call ────────────────────────────────────────────────────────────

async function startCall(withVideo) {
  if (state !== S.IDLE) return
  audioOnly = !withVideo

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo })
  } catch {
    toast("Camera/microphone access denied.")
    return
  }

  setState(S.CALLING)
  showOverlay()
  attachLocal(localStream)
  playRingtone(true)

  pc = createPc()
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  send({ type: "call-offer", offer: pc.localDescription, audioOnly })

  ringTimeout = setTimeout(() => {
    if (state === S.CALLING) { toast("No answer."); hangup(true) }
  }, 40000)
}

// ─── Answer ───────────────────────────────────────────────────────────────────

async function answerCall(withVideo) {
  const ring = document.getElementById("call-incoming-ring")
  if (!ring || ring.hidden) return
  const offerRaw = ring.dataset.offer
  if (!offerRaw) return

  clearTimeout(ringTimeout)
  stopRingtone()
  hideRing()
  audioOnly = !withVideo

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: withVideo })
  } catch {
    toast("Microphone/camera access denied.")
    send({ type: "call-rejected" })
    setState(S.IDLE)
    return
  }

  setState(S.CONNECTED)
  showOverlay()
  attachLocal(localStream)

  pc = createPc()
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))

  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerRaw)))
  for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {})
  pendingCandidates = []

  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  send({ type: "call-answer", answer: pc.localDescription })
}

// ─── Reject ───────────────────────────────────────────────────────────────────

function rejectCall() {
  clearTimeout(ringTimeout)
  stopRingtone()
  hideRing()
  send({ type: "call-rejected" })
  setState(S.IDLE)
  pendingCandidates = []
}

// ─── Hangup ───────────────────────────────────────────────────────────────────

function hangup(silent = false) {
  clearTimeout(ringTimeout)
  stopRingtone()
  if (!silent) send({ type: "call-ended" })
  closeOverlay()
  hideRing()
  cleanup()
  setState(S.IDLE)
}

// ─── RTCPeerConnection ────────────────────────────────────────────────────────

function createPc() {
  const conn = new RTCPeerConnection({ iceServers: STUN })

  conn.onicecandidate = (e) => {
    if (e.candidate) send({ type: "ice-candidate", candidate: e.candidate })
  }

  conn.onconnectionstatechange = () => {
    const s = conn.connectionState
    if (s === "connected") {
      setState(S.CONNECTED)
      stopRingtone()
      clearTimeout(ringTimeout)
      startTimer()
    }
    if (["disconnected", "failed", "closed"].includes(s) && state !== S.IDLE) {
      hangup(true)
    }
  }

  conn.ontrack = (e) => {
    const stream = e.streams[0] || new MediaStream([e.track])
    const rv = document.getElementById("call-remote-video")
    if (rv) { rv.srcObject = stream; rv.play().catch(() => {}) }
  }

  return conn
}

// ─── Incoming signal handlers ─────────────────────────────────────────────────

async function onOffer(data) {
  if (state !== S.IDLE) { send({ type: "call-busy" }); return }
  peerName = data.from
  setState(S.RINGING)

  const ring = document.getElementById("call-incoming-ring")
  if (ring) {
    ring.dataset.offer = JSON.stringify(data.offer)
    const callerEl = ring.querySelector(".call-ring-caller")
    if (callerEl) callerEl.textContent = data.from
    const typeEl = ring.querySelector(".call-ring-type")
    if (typeEl) typeEl.textContent = data.audioOnly ? "Audio call" : "Video call"
    ring.removeAttribute("hidden")
  }

  playRingtone(false)
  ringTimeout = setTimeout(() => {
    if (state === S.RINGING) {
      stopRingtone(); hideRing(); setState(S.IDLE); pendingCandidates = []
    }
  }, 40000)
}

async function onAnswer(data) {
  if (state !== S.CALLING || !pc) return
  clearTimeout(ringTimeout)
  await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
  for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {})
  pendingCandidates = []
  setState(S.CONNECTED)
}

async function onIce(data) {
  if (!data.candidate) return
  const c = new RTCIceCandidate(data.candidate)
  if (pc?.remoteDescription) { await pc.addIceCandidate(c).catch(() => {}) }
  else { pendingCandidates.push(c) }
}

function onRejected(data) {
  clearTimeout(ringTimeout)
  stopRingtone()
  toast(`${data.from || "User"} declined the call.`)
  closeOverlay()
  cleanup()
  setState(S.IDLE)
}

function onEnded() {
  if (state === S.IDLE) return
  clearTimeout(ringTimeout)
  stopRingtone()
  toast("Call ended.")
  closeOverlay()
  hideRing()
  cleanup()
  setState(S.IDLE)
}

function onBusy() {
  clearTimeout(ringTimeout)
  stopRingtone()
  toast("User is busy on another call.")
  closeOverlay()
  cleanup()
  setState(S.IDLE)
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function toggleMute() {
  const track = localStream?.getAudioTracks()[0]
  if (!track) return
  track.enabled = !track.enabled
  const btn = document.getElementById("call-mute-btn")
  if (btn) {
    btn.classList.toggle("is-active", !track.enabled)
    btn.setAttribute("aria-label", track.enabled ? "Mute" : "Unmute")
    const lbl = btn.querySelector(".call-ctrl-label")
    if (lbl) lbl.textContent = track.enabled ? "Mute" : "Unmuted"
  }
}

function toggleCamera() {
  const track = localStream?.getVideoTracks()[0]
  if (!track) return
  track.enabled = !track.enabled
  const btn = document.getElementById("call-cam-btn")
  if (btn) {
    btn.classList.toggle("is-active", !track.enabled)
    const lbl = btn.querySelector(".call-ctrl-label")
    if (lbl) lbl.textContent = track.enabled ? "Camera" : "Cam Off"
  }
  const lv = document.getElementById("call-local-video")
  if (lv) lv.classList.toggle("cam-off", !track.enabled)
}

function toggleSpeaker() {
  const rv = document.getElementById("call-remote-video")
  if (!rv) return
  rv.muted = !rv.muted
  const btn = document.getElementById("call-speaker-btn")
  if (btn) btn.classList.toggle("is-active", rv.muted)
}

// ─── UI ───────────────────────────────────────────────────────────────────────

function setState(s) {
  state = s
  const overlay = document.getElementById("call-overlay")
  if (overlay) overlay.dataset.callState = s
}

function showOverlay() {
  const overlay = document.getElementById("call-overlay")
  if (!overlay) return
  overlay.removeAttribute("hidden")
  overlay.dataset.callState = state
  const nameEl = document.getElementById("call-remote-name")
  if (nameEl) nameEl.textContent = peerName || "…"
  const localNameEl = document.getElementById("call-local-name")
  if (localNameEl) localNameEl.textContent = myName || "You"
}

function closeOverlay() {
  document.getElementById("call-overlay")?.setAttribute("hidden", "")
}

function hideRing() {
  document.getElementById("call-incoming-ring")?.setAttribute("hidden", "")
}

function attachLocal(stream) {
  const v = document.getElementById("call-local-video")
  if (v) { v.srcObject = stream; v.muted = true; v.play().catch(() => {}) }
}

function cleanup() {
  pc?.close(); pc = null
  localStream?.getTracks().forEach((t) => t.stop()); localStream = null
  pendingCandidates = []
  peerName = null
  stopTimer()
  const lv = document.getElementById("call-local-video")
  const rv = document.getElementById("call-remote-video")
  if (lv) lv.srcObject = null
  if (rv) rv.srcObject = null
}

function startTimer() {
  const el = document.getElementById("call-timer")
  if (!el) return
  const t0 = Date.now()
  callTimerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000)
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  }, 1000)
}

function stopTimer() {
  clearInterval(callTimerInterval); callTimerInterval = null
  const el = document.getElementById("call-timer")
  if (el) el.textContent = ""
}

function toast(msg) {
  let el = document.getElementById("call-toast")
  if (!el) {
    el = document.createElement("div")
    el.id = "call-toast"
    el.className = "call-toast"
    document.body.appendChild(el)
  }
  el.textContent = msg
  el.removeAttribute("hidden")
  clearTimeout(el._t)
  el._t = setTimeout(() => el.setAttribute("hidden", ""), 3500)
}

// ─── Ringtone ─────────────────────────────────────────────────────────────────

function playRingtone(outgoing) {
  stopRingtone()
  try {
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.value = 0.22
    gain.connect(ctx.destination)
    const beep = (freq, start, dur) => {
      const o = ctx.createOscillator()
      o.type = "sine"; o.frequency.value = freq
      o.connect(gain); o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur)
    }
    const pattern = outgoing
      ? () => { beep(440, 0, 0.4); beep(480, 0, 0.4) }
      : () => { [0, 0.25, 0.5].forEach((d) => beep(660, d, 0.18)) }
    pattern()
    ringtone = { iv: setInterval(pattern, outgoing ? 2200 : 2800), ctx }
  } catch { /* audio context unavailable */ }
}

function stopRingtone() {
  if (!ringtone) return
  clearInterval(ringtone.iv)
  ringtone.ctx?.close().catch(() => {})
  ringtone = null
}

// ─── Draggable PiP ───────────────────────────────────────────────────────────

function initDraggablePip() {
  const pip = document.getElementById("call-local-pip")
  if (!pip) return
  let drag = false, sx, sy, ix, iy

  const start = (e) => {
    drag = true
    const p = e.touches ? e.touches[0] : e
    sx = p.clientX; sy = p.clientY
    const r = pip.getBoundingClientRect()
    ix = r.left; iy = r.top
    pip.style.transition = "none"
  }
  const move = (e) => {
    if (!drag) return
    const p = e.touches ? e.touches[0] : e
    const nx = Math.max(8, Math.min(window.innerWidth  - pip.offsetWidth  - 8, ix + p.clientX - sx))
    const ny = Math.max(8, Math.min(window.innerHeight - pip.offsetHeight - 8, iy + p.clientY - sy))
    pip.style.left = `${nx}px`; pip.style.top = `${ny}px`
    pip.style.right = "auto"; pip.style.bottom = "auto"
  }
  const end = () => { drag = false; pip.style.transition = "" }

  pip.addEventListener("mousedown", start)
  pip.addEventListener("touchstart", start, { passive: true })
  document.addEventListener("mousemove", move)
  document.addEventListener("touchmove", move, { passive: true })
  document.addEventListener("mouseup", end)
  document.addEventListener("touchend", end)
}

// ─── Button wiring ────────────────────────────────────────────────────────────

function wireButtons() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-call-action]")
    if (!btn) return
    switch (btn.dataset.callAction) {
      case "start-video":   startCall(true);   break
      case "start-audio":   startCall(false);  break
      case "answer-video":  answerCall(true);  break
      case "answer-audio":  answerCall(false); break
      case "reject":        rejectCall();      break
      case "hangup":        hangup();          break
      case "mute":          toggleMute();      break
      case "camera":        toggleCamera();    break
      case "speaker":       toggleSpeaker();   break
    }
  })
}
