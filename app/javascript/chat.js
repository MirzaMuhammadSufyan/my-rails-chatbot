import { createConsumer } from "@rails/actioncable"
import { initMediaViewer, enhanceMessageElement, stripMessageMedia } from "media_viewer"
import { EMOJIS, applyEmojiShortcutsToText } from "emojis"

const WAVE_BARS = 28

let mediaRecorder = null
let recordedChunks = []
let voiceBlob = null
let audioContext = null
let analyser = null
let micStream = null
let waveAnimationId = null
let timerInterval = null
let recordingStartedAt = null
let lastRecordingDuration = 0
let previewAudio = null
let pendingPreviewUrl = null
let isSending = false
const MIN_VOICE_BYTES = 500
const MIN_RECORDING_SEC = 0.8

export function initChat(roomId) {
  const messagesEl = document.getElementById("messages")
  const form = document.getElementById("chat-form")
  const composer = document.getElementById("chat-composer")
  const recordBtn = document.getElementById("record-voice")
  const stopBtn = document.getElementById("stop-voice")
  const cancelBtn = document.getElementById("voice-cancel")
  const discardBtn = document.getElementById("voice-discard")
  const playPreviewBtn = document.getElementById("voice-play-preview")
  const recordingUi = document.getElementById("voice-recording-ui")
  const draftUi = document.getElementById("voice-draft-ui")
  const pendingPreview = document.getElementById("pending-media-overlay")
  const textarea = document.getElementById("message_body")

  if (!messagesEl || !form) return

  buildWaveformBars(document.getElementById("voice-waveform"))
  buildWaveformBars(document.getElementById("voice-draft-wave"), true)

  initScrollToEnd(messagesEl)
  initMediaViewer(messagesEl)
  initEmojiPicker()
  initEmojiShortcuts(textarea)
  initReplyHandlers(messagesEl, form)
  initMediaInputs(form, pendingPreview)
  initGlobalComposeKeys(form, pendingPreview)
  initMessagePolling(roomId, messagesEl)
  if (textarea) {
    initAutoGrow(textarea)
    initEnterToSend(textarea, form)
  }

  const consumer = createConsumer()
  consumer.subscriptions.create(
    { channel: "ChatChannel", room_id: roomId },
    {
      connected() {
        setConnectionStatus(true)
      },
      disconnected() {
        setConnectionStatus(false)
      },
      rejected() {
        setConnectionStatus(false)
        console.error("ChatChannel subscription rejected")
      },
      received(data) {
        if (data.delete_message_id) {
          removeMessageById(messagesEl, data.delete_message_id)
          return
        }
        if (!data.html) return
        appendMessageHtml(messagesEl, data.html, { scroll: isNearBottom(messagesEl) })
      }
    }
  )

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    if (isSending) return

    const blobToSend = voiceBlob
    isSending = true
    setSendDisabled(true)

    try {
      const ok = await sendMessage(form, blobToSend, messagesEl)
      if (ok) {
        resetComposerState(form, composer, pendingPreview, recordingUi, draftUi)
      }
    } finally {
      isSending = false
      setSendDisabled(false)
    }
  })

  recordBtn?.addEventListener("click", () => {
    startRecording(recordingUi, draftUi, composer)
  })

  stopBtn?.addEventListener("click", () => {
    stopRecording(recordingUi, draftUi, composer, (blob) => {
      voiceBlob = blob
      showVoiceDraft(blob, draftUi, composer, recordingUi)
    })
  })

  cancelBtn?.addEventListener("click", () => {
    cancelRecording(recordingUi, draftUi, composer)
  })

  discardBtn?.addEventListener("click", () => {
    voiceBlob = null
    hideVoiceDraft(draftUi, composer)
    stopPreviewAudio()
  })

  playPreviewBtn?.addEventListener("click", () => {
    togglePreviewPlayback(playPreviewBtn)
  })
}

function initEnterToSend(textarea, form) {
  textarea.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
    if (composeEnterHandled(form)) {
      event.preventDefault()
      form.requestSubmit()
      return
    }
    event.preventDefault()
    form.requestSubmit()
  })
}

function initGlobalComposeKeys(form, pendingPreview) {
  document.getElementById("pending-media-cancel")?.addEventListener("click", () => {
    clearPendingMediaPreview(pendingPreview)
    clearFileInputs(form)
  })

  document.getElementById("pending-media-send")?.addEventListener("click", () => {
    if (pendingPreview?.hidden) return
    if (!pickFirstFileInput()?.files?.[0]) return
    form.requestSubmit()
  })

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      const draftUi = document.getElementById("voice-draft-ui")
      if (pendingPreview && !pendingPreview.hidden) {
        clearPendingMediaPreview(pendingPreview)
        clearFileInputs(form)
        event.preventDefault()
        return
      }
      if (draftUi && !draftUi.hidden) {
        voiceBlob = null
        hideVoiceDraft(draftUi, document.getElementById("chat-composer"))
        stopPreviewAudio()
        event.preventDefault()
      }
      return
    }

    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return
    if (!composeEnterHandled(form)) return
    event.preventDefault()
    form.requestSubmit()
  })
}

function composeEnterHandled(form) {
  const draftUi = document.getElementById("voice-draft-ui")
  const pending = document.getElementById("pending-media-overlay")
  const voiceReady = draftUi && !draftUi.hidden && voiceBlob
  const mediaReady = pending && !pending.hidden && pickFirstFileInput()
  return voiceReady || mediaReady
}

function isNearBottom(el, threshold = 100) {
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold
}

function initScrollToEnd(messagesEl) {
  const scroll = () => scrollToBottom(messagesEl, true)

  scroll()
  requestAnimationFrame(scroll)
  setTimeout(scroll, 0)
  setTimeout(scroll, 100)

  window.addEventListener("load", scroll)

  messagesEl.querySelectorAll("img").forEach((img) => {
    if (!img.complete) img.addEventListener("load", () => {
      if (isNearBottom(messagesEl)) scrollToBottom(messagesEl)
    }, { once: true })
  })

  const observer = new MutationObserver((mutations) => {
    const added = mutations.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1))
    if (!added) return
    if (isNearBottom(messagesEl)) scrollToBottom(messagesEl)
  })
  observer.observe(messagesEl, { childList: true, subtree: true })
}

function buildWaveformBars(container, staticBars = false) {
  if (!container || container.childElementCount > 0) return
  for (let i = 0; i < WAVE_BARS; i++) {
    const bar = document.createElement("span")
    bar.className = "voice-bar"
    if (staticBars) {
      const h = 20 + Math.random() * 60
      bar.style.setProperty("--h", `${h}%`)
    }
    container.appendChild(bar)
  }
}

function dismissEmptyState(messagesEl) {
  messagesEl.querySelector(".chat-empty")?.remove()
}

function appendMessageHtml(messagesEl, html, options = {}) {
  dismissEmptyState(messagesEl)
  const temp = document.createElement("div")
  temp.innerHTML = html
  const article = temp.querySelector("article[data-message-id]")
  if (!article) return

  const existing = document.getElementById(article.id)
  if (existing) {
    applyOwnMessageStyle(existing, messagesEl)
    return
  }

  applyOwnMessageStyle(article, messagesEl)
  enhanceMessageElement(article)

  while (temp.firstChild) {
    messagesEl.appendChild(temp.firstChild)
  }

  const shouldScroll = options.scroll !== false && (options.forceScroll || isNearBottom(messagesEl))

  temp.querySelectorAll("img").forEach((img) => {
    if (!img.complete && shouldScroll) {
      img.addEventListener("load", () => {
        if (isNearBottom(messagesEl)) scrollToBottom(messagesEl)
      }, { once: true })
    }
  })

  if (shouldScroll) scrollToBottom(messagesEl)
}

function initAutoGrow(textarea) {
  const resize = () => {
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`
  }
  textarea.addEventListener("input", resize)
  resize()
}

function initEmojiShortcuts(textarea) {
  if (!textarea) return

  const run = () => {
    const before = textarea.value
    const after = applyEmojiShortcutsToText(before)
    if (after !== before) {
      textarea.value = after
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    }
  }

  textarea.addEventListener("input", run)
  textarea.addEventListener("blur", run)
}

function initReplyHandlers(messagesEl, form) {
  const replyBar = document.getElementById("reply-bar")
  const replyInput = document.getElementById("message_reply_to_id")
  const replyAuthor = document.getElementById("reply-bar-author")
  const replyPreview = document.getElementById("reply-bar-preview")

  document.getElementById("reply-bar-cancel")?.addEventListener("click", () => clearReply())

  messagesEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".msg-reply")
    if (!btn) return
    event.preventDefault()

    if (replyInput) replyInput.value = btn.dataset.replyId || ""
    if (replyAuthor) replyAuthor.textContent = btn.dataset.replyAuthor || ""
    if (replyPreview) replyPreview.textContent = btn.dataset.replyPreview || ""
    if (replyBar) replyBar.hidden = false

    document.getElementById("message_body")?.focus()
  })
}

function clearReply() {
  const replyBar = document.getElementById("reply-bar")
  const replyInput = document.getElementById("message_reply_to_id")
  if (replyInput) replyInput.value = ""
  if (replyBar) replyBar.hidden = true
}

function initEmojiPicker() {
  const toggle = document.getElementById("emoji-toggle")
  const picker = document.getElementById("emoji-picker")
  const textarea = document.getElementById("message_body")
  if (!toggle || !picker || !textarea) return

  picker.innerHTML = EMOJIS.map((emoji) =>
    `<button type="button" class="emoji-btn" data-emoji="${emoji}" role="option">${emoji}</button>`
  ).join("")

  toggle.addEventListener("click", (event) => {
    event.stopPropagation()
    const open = picker.hidden
    picker.hidden = !open
    toggle.setAttribute("aria-expanded", open ? "true" : "false")
  })

  picker.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-emoji]")
    if (!btn) return
    insertAtCursor(textarea, btn.dataset.emoji)
    textarea.focus()
    textarea.dispatchEvent(new Event("input", { bubbles: true }))
  })

  document.addEventListener("click", (event) => {
    if (picker.hidden) return
    if (picker.contains(event.target) || toggle.contains(event.target)) return
    picker.hidden = true
    toggle.setAttribute("aria-expanded", "false")
  })
}

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart ?? textarea.value.length
  const end = textarea.selectionEnd ?? textarea.value.length
  textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end)
  const pos = start + text.length
  textarea.selectionStart = pos
  textarea.selectionEnd = pos
}

function getLastMessageId(messagesEl) {
  let maxId = 0
  messagesEl.querySelectorAll("article[data-message-id]").forEach((article) => {
    const id = parseInt(article.dataset.messageId, 10)
    if (id > maxId) maxId = id
  })
  return maxId
}

function getVisibleMessageIds(messagesEl) {
  return [...messagesEl.querySelectorAll("article[data-message-id]")].map((el) =>
    parseInt(el.dataset.messageId, 10)
  ).filter((id) => id > 0)
}

function removeMessageById(messagesEl, messageId) {
  const article = document.getElementById(`message_${messageId}`)
  if (!article) return
  stripMessageMedia(article)
  removeMessagePreserveScroll(messagesEl, article)
}

function initMessagePolling(roomId, messagesEl) {
  const syncUrl = `/rooms/${roomId}/messages/sync`

  setInterval(async () => {
    const after = getLastMessageId(messagesEl)
    const ids = getVisibleMessageIds(messagesEl).join(",")

    try {
      const response = await fetch(`${syncUrl}?after=${after}&ids=${ids}`, {
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      })
      if (!response.ok) return

      const data = await response.json()

      data.removed_ids?.forEach((id) => removeMessageById(messagesEl, id))

      data.messages?.forEach(({ html }) => {
        if (html) appendMessageHtml(messagesEl, html, { scroll: isNearBottom(messagesEl) })
      })
    } catch {
      /* ignore transient poll errors */
    }
  }, 2000)
}

function setConnectionStatus(connected) {
  const badge = document.querySelector(".chat-topbar-live")
  if (!badge) return
  badge.textContent = connected ? "Live" : "Reconnecting…"
  badge.classList.toggle("is-connected", connected)
  badge.classList.toggle("is-disconnected", !connected)
}

function initMediaInputs(form, pendingPreview) {
  const composer = document.getElementById("chat-composer")
  const recordingUi = document.getElementById("voice-recording-ui")
  const draftUi = document.getElementById("voice-draft-ui")

  form.querySelectorAll("[data-media-input]").forEach((input) => {
    input.addEventListener("change", () => {
      if (input.files?.length > 0) {
        form.querySelectorAll("[data-media-input]").forEach((other) => {
          if (other !== input) other.value = ""
        })
        input.closest("details.attach-dropdown")?.removeAttribute("open")

        showPendingMediaPreview(pendingPreview, input.files[0], input.dataset.kind)
        voiceBlob = null
        hideVoiceDraft(draftUi, composer)
        cancelRecording(recordingUi, draftUi, composer)
      } else {
        clearPendingMediaPreview(pendingPreview)
      }
    })
  })
}

function showPendingMediaPreview(panel, file, kind) {
  if (!panel || !file) return

  const visual = document.getElementById("pending-media-visual")
  const nameEl = document.getElementById("pending-media-name")
  if (!visual || !nameEl) return

  clearPendingMediaPreview(panel, false)

  const sizeKb = Math.round(file.size / 1024)
  nameEl.textContent = `${file.name} · ${sizeKb} KB`
  visual.innerHTML = ""

  if (kind === "image" || file.type.startsWith("image/")) {
    pendingPreviewUrl = URL.createObjectURL(file)
    const img = document.createElement("img")
    img.src = pendingPreviewUrl
    img.alt = "Preview"
    img.className = "pending-media-img-full"
    visual.appendChild(img)
  } else if (kind === "video" || file.type.startsWith("video/")) {
    pendingPreviewUrl = URL.createObjectURL(file)
    const video = document.createElement("video")
    video.src = pendingPreviewUrl
    video.controls = true
    video.playsInline = true
    video.className = "pending-media-video-full"
    visual.appendChild(video)
  } else if (kind === "audio" || file.type.startsWith("audio/")) {
    pendingPreviewUrl = URL.createObjectURL(file)
    const audio = document.createElement("audio")
    audio.src = pendingPreviewUrl
    audio.controls = true
    audio.className = "pending-media-audio-full"
    visual.appendChild(audio)
  } else {
    const doc = document.createElement("div")
    doc.className = "pending-media-doc-full"
    const icon = document.createElement("span")
    icon.className = "pending-media-doc-icon"
    icon.textContent = "📄"
    icon.setAttribute("aria-hidden", "true")
    const name = document.createElement("span")
    name.className = "pending-media-doc-name"
    name.textContent = file.name
    doc.append(icon, name)
    visual.appendChild(doc)
  }

  panel.hidden = false
  document.body.classList.add("pending-media-open")
}

function clearPendingMediaPreview(panel, hidePanel = true) {
  if (pendingPreviewUrl) {
    URL.revokeObjectURL(pendingPreviewUrl)
    pendingPreviewUrl = null
  }

  const visual = document.getElementById("pending-media-visual")
  if (visual) visual.innerHTML = ""

  const nameEl = document.getElementById("pending-media-name")
  if (nameEl) nameEl.textContent = ""

  if (panel && hidePanel) {
    panel.hidden = true
    document.body.classList.remove("pending-media-open")
  }
}

function resetComposerState(form, composer, pendingPreview, recordingUi, draftUi) {
  form.reset()
  voiceBlob = null
  lastRecordingDuration = 0
  recordingStartedAt = null

  const textarea = document.getElementById("message_body")
  if (textarea) {
    textarea.value = ""
    textarea.style.height = ""
  }

  clearFileInputs(form)
  clearPendingMediaPreview(pendingPreview)
  cancelRecording(recordingUi, draftUi, composer)
  hideVoiceDraft(draftUi, composer)
  stopPreviewAudio()

  document.getElementById("emoji-picker").hidden = true
  clearReply()
}

function showRecordingUi(recordingUi, draftUi, composer) {
  if (recordingUi) recordingUi.hidden = false
  if (draftUi) draftUi.hidden = true
  if (composer) composer.hidden = true
  stopPreviewAudio()
}

function hideRecordingUi(recordingUi, composer) {
  if (recordingUi) recordingUi.hidden = true
  if (composer) composer.hidden = false
}

function showVoiceDraft(blob, draftUi, composer, recordingUi) {
  hideRecordingUi(recordingUi, composer)
  if (draftUi) draftUi.hidden = false
  if (composer) composer.hidden = true

  stopPreviewAudio()
  previewAudio = new Audio(URL.createObjectURL(blob))
  previewAudio.addEventListener("ended", () => setPreviewPlayIcon(false))

  const durationEl = document.getElementById("voice-draft-duration")
  if (durationEl) {
    durationEl.textContent = formatTime(lastRecordingDuration)
  }

  setPreviewPlayIcon(false)
}

function setSendDisabled(disabled) {
  document.querySelectorAll("#send-message, .voice-draft-send").forEach((btn) => {
    btn.disabled = disabled
  })
}

function hideVoiceDraft(draftUi, composer) {
  if (draftUi) draftUi.hidden = true
  if (composer) composer.hidden = false
  stopPreviewAudio()
}

function setPreviewPlayIcon(playing) {
  const btn = document.getElementById("voice-play-preview")
  if (!btn) return
  btn.classList.toggle("is-playing", playing)
}

function togglePreviewPlayback(btn) {
  if (!previewAudio) return
  if (previewAudio.paused) {
    previewAudio.play()
    setPreviewPlayIcon(true)
  } else {
    previewAudio.pause()
    previewAudio.currentTime = 0
    setPreviewPlayIcon(false)
  }
}

function stopPreviewAudio() {
  if (!previewAudio) return
  previewAudio.pause()
  previewAudio.currentTime = 0
  URL.revokeObjectURL(previewAudio.src)
  previewAudio = null
  setPreviewPlayIcon(false)
}

async function sendMessage(form, voiceBlobParam, messagesEl) {
  const body = document.getElementById("message_body")?.value?.trim() ?? ""
  const fileInput = pickFirstFileInput()
  const hasFile = fileInput?.files?.[0]
  const hasVoice = Boolean(voiceBlobParam)

  if (!processedBody && !hasFile && !hasVoice) {
    alert("Type something, add an emoji, or attach media first.")
    return false
  }

  if (hasVoice) {
    if (!voiceBlobParam || voiceBlobParam.size < MIN_VOICE_BYTES) {
      alert("Voice message is empty or still processing. Stop recording, wait a second, then send.")
      return false
    }
    if (lastRecordingDuration < MIN_RECORDING_SEC) {
      alert("Recording is too short. Speak for at least 1 second.")
      return false
    }
  }

  const formData = new FormData()
  const processedBody = body ? applyEmojiShortcutsToText(body) : ""
  if (processedBody) formData.append("message[body]", processedBody)

  const replyId = document.getElementById("message_reply_to_id")?.value
  if (replyId) formData.append("message[reply_to_id]", replyId)

  if (hasVoice) {
    formData.append("message[media]", voiceBlobParam, `voice-${Date.now()}.webm`)
  } else if (hasFile) {
    formData.append("message[media]", fileInput.files[0])
  }

  const token = document.querySelector('meta[name="csrf-token"]')?.content

  let response
  try {
    response = await fetch(form.action, {
      method: "POST",
      body: formData,
      headers: {
        "X-CSRF-Token": token,
        Accept: "application/json"
      },
      credentials: "same-origin"
    })
  } catch {
    alert("Network error. Check your connection and try again.")
    return false
  }

  if (response.status === 201) {
    const data = await response.json().catch(() => ({}))
    if (data.html && messagesEl) {
      appendMessageHtml(messagesEl, data.html, { forceScroll: true })
    }
    return true
  }

  const data = await response.json().catch(() => ({}))
  alert(data.errors?.join("\n") || "Could not send message.")
  return false
}

function pickFirstFileInput() {
  for (const id of ["message_media_image", "message_media_video", "message_media_audio", "message_media_file"]) {
    const input = document.getElementById(id)
    if (input?.files?.[0]) return input
  }
  return null
}

function clearFileInputs(form) {
  form.querySelectorAll("[data-media-input]").forEach((input) => {
    input.value = ""
  })
  form.querySelectorAll("details.attach-dropdown").forEach((menu) => menu.removeAttribute("open"))
}

function scrollToBottom(el, force = false) {
  if (!el) return
  if (!force && !isNearBottom(el)) return
  el.scrollTop = el.scrollHeight
}

function removeMessagePreserveScroll(messagesEl, article) {
  if (!messagesEl || !article) return

  const distanceFromBottom =
    messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight

  article.remove()

  messagesEl.scrollTop = Math.max(
    0,
    messagesEl.scrollHeight - messagesEl.clientHeight - distanceFromBottom
  )
}

function applyOwnMessageStyle(article, messagesEl) {
  const currentUser = messagesEl.dataset.currentUser
  if (!currentUser || article.dataset.author !== currentUser) return

  article.classList.add("msg--own")
  article.querySelector(".msg-name")?.remove()
  article.querySelector(".msg-avatar")?.remove()
  ensureDeleteButton(article, messagesEl)
}

function ensureDeleteButton(article, messagesEl) {
  const roomId = messagesEl.dataset.roomId
  const messageId = article.dataset.messageId
  if (!roomId || !messageId) return

  const deleteUrl = `/rooms/${roomId}/messages/${messageId}`
  const visualWrap = article.querySelector(".msg-visual-wrap")

  if (visualWrap && !article.querySelector(".msg-delete--on-media")) {
    visualWrap.appendChild(buildDeleteButton(deleteUrl, true))
  }

  const needsFooterDelete = !article.querySelector(".msg-footer .msg-delete") &&
    (!visualWrap || article.querySelector(".msg-bubble--audio, .msg-bubble--file"))

  if (!needsFooterDelete) return

  let footer = article.querySelector(".msg-footer")
  if (!footer) {
    footer = document.createElement("div")
    footer.className = "msg-footer"
    const time = article.querySelector(".msg-time")
    if (time) {
      time.remove()
      footer.appendChild(time)
    }
    article.querySelector(".msg-stack")?.appendChild(footer)
  }

  footer.appendChild(buildDeleteButton(deleteUrl, false))
}

function buildDeleteButton(deleteUrl, onMedia) {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = onMedia ? "msg-delete msg-delete--on-media" : "msg-delete"
  btn.dataset.deleteUrl = deleteUrl
  btn.setAttribute("aria-label", "Delete message")
  btn.title = "Delete"
  btn.innerHTML = `<svg width="${onMedia ? 16 : 18}" height="${onMedia ? 16 : 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>${onMedia ? "" : '<span class="msg-delete-label">Delete</span>'}`
  return btn
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, "0")}`
}

function startTimer() {
  const timerEl = document.getElementById("voice-timer")
  recordingStartedAt = Date.now()
  if (timerEl) timerEl.textContent = "0:00"

  clearInterval(timerInterval)
  timerInterval = setInterval(() => {
    const elapsed = (Date.now() - recordingStartedAt) / 1000
    if (timerEl) timerEl.textContent = formatTime(elapsed)
  }, 200)
}

function stopTimer() {
  clearInterval(timerInterval)
  timerInterval = null
}

function startWaveAnimation() {
  const container = document.getElementById("voice-waveform")
  if (!container || !analyser) return

  const bars = container.querySelectorAll(".voice-bar")
  const data = new Uint8Array(analyser.frequencyBinCount)

  const tick = () => {
    analyser.getByteFrequencyData(data)
    const step = Math.floor(data.length / bars.length)

    bars.forEach((bar, i) => {
      const value = data[i * step] || 0
      const height = Math.max(12, (value / 255) * 100)
      bar.style.setProperty("--h", `${height}%`)
    })

    waveAnimationId = requestAnimationFrame(tick)
  }

  tick()
}

function stopWaveAnimation() {
  if (waveAnimationId) cancelAnimationFrame(waveAnimationId)
  waveAnimationId = null
}

async function startRecording(recordingUi, draftUi, composer) {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Voice recording is not supported in this browser.")
    return
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recordedChunks = []
    voiceBlob = null

    const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]
    const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t))
    mediaRecorder = new MediaRecorder(micStream, mimeType ? { mimeType } : undefined)

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }
    mediaRecorder.start(250)

    lastRecordingDuration = 0
    audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(micStream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 64
    source.connect(analyser)

    showRecordingUi(recordingUi, draftUi, composer)
    startTimer()
    startWaveAnimation()

    clearPendingMediaPreview(document.getElementById("pending-media-preview"))
    clearFileInputs(document.getElementById("chat-form"))
  } catch {
    alert("Microphone access denied or unavailable.")
    cancelRecording(recordingUi, draftUi, composer)
  }
}

function stopRecording(recordingUi, draftUi, composer, onComplete) {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return

  const recorder = mediaRecorder
  const mime = recorder.mimeType?.startsWith("audio/") ? recorder.mimeType : "audio/webm"

  recorder.addEventListener("stop", () => {
    setTimeout(() => {
      stopTimer()
      stopWaveAnimation()

      if (recordingStartedAt) {
        lastRecordingDuration = (Date.now() - recordingStartedAt) / 1000
      }

      const blob = new Blob(recordedChunks, { type: mime })
      cleanupMic()
      mediaRecorder = null
      recordedChunks = []

      if (blob.size >= MIN_VOICE_BYTES && lastRecordingDuration >= MIN_RECORDING_SEC) {
        onComplete(blob)
      } else {
        alert("Recording too short. Hold the mic and speak for at least 1 second.")
        hideRecordingUi(recordingUi, composer)
        voiceBlob = null
      }
    }, 250)
  }, { once: true })

  if (recorder.state === "recording") {
    try {
      recorder.requestData()
    } catch {
      /* ignore */
    }
    recorder.stop()
  }
}

function cancelRecording(recordingUi, draftUi, composer) {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.addEventListener("stop", () => cleanupMic(), { once: true })
    mediaRecorder.stop()
  } else {
    cleanupMic()
  }

  mediaRecorder = null
  recordedChunks = []
  voiceBlob = null
  stopTimer()
  stopWaveAnimation()
  hideRecordingUi(recordingUi, composer)
  hideVoiceDraft(draftUi, composer)
}

function cleanupMic() {
  micStream?.getTracks().forEach((t) => t.stop())
  micStream = null

  if (audioContext) {
    audioContext.close().catch(() => {})
    audioContext = null
  }
  analyser = null
}
