/**
 * WebRTC 1-on-1 Audio/Video calling.
 *
 * Signalling uses a dedicated CallChannel ActionCable subscription so
 * it is completely independent of the chat message stream.
 */
import { consumer } from "cable_consumer"

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
let remoteStream = null
let callSub = null
let roomId = null
let myName = null
let peerName = null
let audioOnly = false
let pendingCandidates = []
let ringTimeout = null
let callTimerInterval = null
let ringtone = null
let selectedVideoDeviceId = null
let videoDevices = []
let currentFacingMode = "user"
let isVideoCall = false
let incomingOfferHasVideo = false

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initVideoCall(rid, userName) {
  roomId = rid
  myName = userName
  subscribeCallChannel()
  wireButtons()
  initDraggablePip()
}

// ─── Signal transport (CallChannel) ──────────────────────────────────────────

function subscribeCallChannel() {
  callSub = consumer.subscriptions.create(
    { channel: "CallChannel", room_id: roomId },
    {
      received(data) {
        if (data.from === myName) return
        switch (data.type) {
          case "call-offer":    return onOffer(data)
          case "call-answer":   return onAnswer(data)
          case "ice-candidate": return onIce(data)
          case "call-rejected": return onRejected(data)
          case "call-ended":    return onEnded(data)
          case "call-busy":     return onBusy(data)
        }
      }
    }
  )
}

function send(payload) {
  callSub?.perform("signal", { ...payload, from: myName })
}

async function updateVideoDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) {
    videoDevices = []
    selectedVideoDeviceId = null
    return
  }

  const devices = await navigator.mediaDevices.enumerateDevices()
  videoDevices = devices.filter((device) => device.kind === "videoinput")
  if (!selectedVideoDeviceId && videoDevices.length > 0) {
    selectedVideoDeviceId = videoDevices[0].deviceId
  }
}

async function getMediaStream({ audio = true, video = false, deviceId = null }) {
  const constraints = {
    audio: audio ? { echoCancellation: true, noiseSuppression: true } : false,
    video: false
  }

  if (video) {
    constraints.video = deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: { ideal: "user" } }
  }

  return navigator.mediaDevices.getUserMedia(constraints)
}

async function switchCamera() {
  if (!localStream) return

  const nextFacing = currentFacingMode === "user" ? "environment" : "user"
  const oldVideoTrack = localStream.getVideoTracks()[0]

  // Try applyConstraints first (no new stream needed, works on most mobile browsers)
  if (oldVideoTrack) {
    try {
      await oldVideoTrack.applyConstraints({ facingMode: { ideal: nextFacing } })
      currentFacingMode = nextFacing
      attachLocal(localStream)
      toast(`Switched to ${nextFacing === "user" ? "front" : "back"} camera`)
      return
    } catch { /* fall through to full track replacement */ }
  }

  // Full replacement: stop old track, get new stream with ideal facingMode
  try {
    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: nextFacing } },
      audio: false
    })
    const newVideoTrack = newStream.getVideoTracks()[0]

    if (oldVideoTrack) {
      localStream.removeTrack(oldVideoTrack)
      oldVideoTrack.stop()
    }
    localStream.addTrack(newVideoTrack)

    const sender = pc?.getSenders().find((s) => s.track?.kind === "video")
    if (sender) {
      await sender.replaceTrack(newVideoTrack)
    } else if (pc) {
      pc.addTrack(newVideoTrack, localStream)
    }

    currentFacingMode = nextFacing
    attachLocal(localStream)
    toast(`Switched to ${nextFacing === "user" ? "front" : "back"} camera`)
  } catch {
    toast("Could not switch camera.")
  }
}

// ─── Initiate call ────────────────────────────────────────────────────────────

async function startCall(withVideo) {
  if (state !== S.IDLE) return
  audioOnly = !withVideo
  isVideoCall = withVideo

  try {
    await updateVideoDevices()
    console.debug('[Call] available video devices', videoDevices)
    localStream = await getMediaStream({ audio: true, video: withVideo, deviceId: selectedVideoDeviceId })
    console.debug('[Call] local stream tracks', localStream.getTracks().map((t) => ({ kind: t.kind, enabled: t.enabled })))
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
  send({ type: "call-offer", offer: pc.localDescription, audioOnly, video: withVideo })

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
  isVideoCall = withVideo

  try {
    await updateVideoDevices()
    console.debug('[Call] available video devices', videoDevices)
    localStream = await getMediaStream({ audio: true, video: withVideo, deviceId: selectedVideoDeviceId })
    console.debug('[Call] local answer stream tracks', localStream.getTracks().map((t) => ({ kind: t.kind, enabled: t.enabled })))
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
  if (!withVideo && incomingOfferHasVideo) {
    pc.addTransceiver("video", { direction: "recvonly" })
  }
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream))

  await pc.setRemoteDescription(new RTCSessionDescription(JSON.parse(offerRaw)))
  for (const c of pendingCandidates) await pc.addIceCandidate(c).catch(() => {})
  pendingCandidates = []

  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  send({ type: "call-answer", answer: pc.localDescription, audioOnly, video: withVideo })
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
    console.debug('[Call] ontrack', { track: e.track, streams: e.streams })
    if (!remoteStream) {
      remoteStream = new MediaStream()
    }
    if (e.streams?.[0]) {
      remoteStream = e.streams[0]
    } else {
      remoteStream.addTrack(e.track)
    }

    const rv = document.getElementById("call-remote-video")
    if (rv) {
      if (rv.srcObject !== remoteStream) {
        rv.srcObject = remoteStream
      }
      rv.classList.add("has-stream")
      rv.play().catch((err) => console.warn('[Call] remote video play failed', err))
    }
    if (state !== S.CONNECTED) {
      setState(S.CONNECTED)
    }
  }

  return conn
}

// ─── Incoming signal handlers ─────────────────────────────────────────────────

async function onOffer(data) {
  if (state !== S.IDLE) { send({ type: "call-busy" }); return }
  peerName = data.from
  incomingOfferHasVideo = Boolean(data.video)
  setState(S.RINGING)

  const ring = document.getElementById("call-incoming-ring")
  if (ring) {
    ring.dataset.offer = JSON.stringify(data.offer)
    const callerEl = ring.querySelector(".call-ring-caller")
    if (callerEl) callerEl.textContent = data.from
    const typeEl = ring.querySelector(".call-ring-type")
    if (typeEl) typeEl.textContent = data.audioOnly ? "Audio call" : "Video call"
    ring.style.zIndex = "99999"
    ring.removeAttribute("hidden")
    setTimeout(() => {
      if (ring.hidden) {
        alert(`Incoming call from ${data.from}`)
      }
    }, 100)
  } else {
    console.warn('[Call] incoming offer but ring element not found')
    alert(`Incoming call from ${data.from}`)
  }
  console.debug('[Call] onOffer audioOnly=', data.audioOnly, 'video=', data.video)

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

function switchCameraAction() {
  if (!isVideoCall) { toast("Switch camera only works during a video call."); return }
  switchCamera()
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
  if (v) {
    v.srcObject = stream
    v.muted = true
    v.play().catch((err) => console.warn('[Call] local video play failed', err))
  }
  console.debug('[Call] attachLocal tracks', stream?.getTracks().map((t) => ({ kind: t.kind, enabled: t.enabled })))
}

function cleanup() {
  pc?.close(); pc = null
  localStream?.getTracks().forEach((t) => t.stop()); localStream = null
  remoteStream = null
  pendingCandidates = []
  peerName = null
  currentFacingMode = "user"
  incomingOfferHasVideo = false
  stopTimer()
  const lv = document.getElementById("call-local-video")
  const rv = document.getElementById("call-remote-video")
  if (lv) lv.srcObject = null
  if (rv) { rv.srcObject = null; rv.classList.remove("has-stream") }
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
      case "camera":        toggleCamera();           break
      case "switch-camera": switchCameraAction();    break
      case "speaker":       toggleSpeaker();          break
    }
  })
}
