import { consumer } from "cable_consumer"
import { initMediaViewer, enhanceMessageElement, stripMessageMedia } from "media_viewer"
import { EMOJIS, applyEmojiShortcutsToText, getEmojiShortcutMatches } from "emojis"

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
let unreadBelowCount = 0
let jumpBottomBtn = null
let jumpBottomBadge = null
const MIN_VOICE_BYTES = 500
const MIN_RECORDING_SEC = 0.8

let videoMediaRecorder = null
let videoRecordedChunks = []
let videoStream = null
let videoTimerInterval = null
let videoStartedAt = null
let isSelectMode = false

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
  initNewMessagesIndicator(messagesEl)
  initMediaViewer(messagesEl)
  initEmojiPicker()
  initEmojiShortcuts(textarea)
  initReplyHandlers(messagesEl)
  initReplyQuoteScroll(messagesEl)
  messagesEl.querySelectorAll("article.msg").forEach((article) => applyOwnMessageStyle(article, messagesEl))
  clearReply()
  initMediaInputs(form, pendingPreview)
  initGlobalComposeKeys(form, pendingPreview)
  initMessagePolling(roomId, messagesEl)
  initSwipeToReply(messagesEl)
  initMessageMenus(messagesEl)
  initLongPressMultiSelect(messagesEl, roomId)
  initVideoRecording(form, composer)
  if (textarea) {
    initAutoGrow(textarea)
    initEnterToSend(textarea, form)
  }

  const chatSub = consumer.subscriptions.create(
    { channel: "ChatChannel", room_id: roomId },
    {
      connected() {
        console.info('[Chat] ActionCable connected')
        setConnectionStatus(true)
      },
      disconnected() {
        console.warn('[Chat] ActionCable disconnected')
        setConnectionStatus(false)
      },
      rejected() {
        console.error('[Chat] ChatChannel subscription rejected')
        setConnectionStatus(false)
      },
      received(data) {
        // WebRTC call signals ride the same channel — forward via DOM event
        if (data.call_signal) {
          console.debug('[Chat] incoming call_signal', data)
          document.dispatchEvent(new CustomEvent("call:incoming-signal", { detail: data }))
          return
        }
        if (data.clear_all) {
          messagesEl.innerHTML = '<div class="chat-empty"><div class="chat-empty-icon" aria-hidden="true">💬</div><p class="chat-empty-title">Chat cleared</p><p class="chat-empty-text">Start a new conversation!</p></div>'
          return
        }
        if (data.delete_message_id) {
          removeMessageById(messagesEl, data.delete_message_id)
          return
        }
        if (!data.html) return
        appendMessageHtml(messagesEl, data.html, { scroll: isNearBottom(messagesEl) })
      }
    }
  )

  // Forward outgoing call signals from video_call_controller through this subscription
  document.addEventListener("call:send-signal", (e) => {
    console.debug('[Chat] sending call_signal', e.detail)
    try {
      chatSub.perform("call_signal", e.detail)
    } catch (err) {
      console.error('[Chat] failed to perform call_signal', err)
    }
  })

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

function initVideoRecording(form, composer) {
  const recordVideoBtn = document.getElementById("record-video")
  const videoRecordingUi = document.getElementById("video-recording-ui")
  const stopVideoBtn = document.getElementById("stop-video")
  const cancelVideoBtn = document.getElementById("video-cancel")
  const videoPreviewEl = document.getElementById("video-preview-live")
  const pendingPreview = document.getElementById("pending-media-overlay")

  if (!recordVideoBtn || !videoRecordingUi) return

  recordVideoBtn.addEventListener("click", async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert("Camera not supported in this browser.")
      return
    }
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      videoRecordedChunks = []

      if (videoPreviewEl) {
        videoPreviewEl.srcObject = videoStream
      }

      const mimeTypes = ["video/webm;codecs=vp9,opus", "video/webm", "video/mp4"]
      const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t))
      videoMediaRecorder = new MediaRecorder(videoStream, mimeType ? { mimeType } : undefined)
      videoMediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoRecordedChunks.push(e.data)
      }
      videoMediaRecorder.start(500)

      videoStartedAt = Date.now()
      videoTimerInterval = setInterval(() => {
        const elapsed = (Date.now() - videoStartedAt) / 1000
        const timerEl = document.getElementById("video-timer")
        if (timerEl) timerEl.textContent = formatTime(elapsed)
      }, 200)

      if (composer) composer.hidden = true
      if (videoRecordingUi) videoRecordingUi.hidden = false
    } catch {
      alert("Camera access denied or unavailable.")
      cleanupVideoStream()
    }
  })

  stopVideoBtn?.addEventListener("click", () => {
    if (!videoMediaRecorder || videoMediaRecorder.state === "inactive") return

    const recorder = videoMediaRecorder
    const mime = recorder.mimeType || "video/webm"

    recorder.addEventListener("stop", () => {
      clearInterval(videoTimerInterval)
      videoTimerInterval = null

      const blob = new Blob(videoRecordedChunks, { type: mime })
      cleanupVideoStream()
      videoMediaRecorder = null
      videoRecordedChunks = []

      if (videoRecordingUi) videoRecordingUi.hidden = true
      if (composer) composer.hidden = false

      const ext = mime.includes("mp4") ? "mp4" : "webm"
      const filename = `video-${Date.now()}.${ext}`
      const file = new File([blob], filename, { type: mime })

      showPendingMediaPreview(pendingPreview, file, "video")

      const dt = new DataTransfer()
      dt.items.add(file)
      const videoInput = document.getElementById("message_media_video")
      if (videoInput) {
        videoInput.files = dt.files
        videoInput.dispatchEvent(new Event("change", { bubbles: true }))
      }
    }, { once: true })

    if (recorder.state === "recording") {
      try { recorder.requestData() } catch { /* ignore */ }
      recorder.stop()
    }
  })

  cancelVideoBtn?.addEventListener("click", () => {
    clearInterval(videoTimerInterval)
    videoTimerInterval = null
    if (videoMediaRecorder && videoMediaRecorder.state !== "inactive") {
      videoMediaRecorder.stop()
    }
    cleanupVideoStream()
    videoMediaRecorder = null
    videoRecordedChunks = []
    if (videoRecordingUi) videoRecordingUi.hidden = true
    if (composer) composer.hidden = false
  })
}

function cleanupVideoStream() {
  if (videoStream) {
    videoStream.getTracks().forEach((t) => t.stop())
    videoStream = null
  }
  const videoPreviewEl = document.getElementById("video-preview-live")
  if (videoPreviewEl) videoPreviewEl.srcObject = null
}

function initSwipeToReply(messagesEl) {
  let touchStartX = 0
  let touchStartY = 0
  let swipeTarget = null
  let swipeTriggered = false
  const SWIPE_THRESHOLD = 55

  messagesEl.addEventListener("touchstart", (e) => {
    const touch = e.touches[0]
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    swipeTarget = e.target.closest(".msg")
    swipeTriggered = false
    if (swipeTarget) swipeTarget.style.transition = "none"
  }, { passive: true })

  messagesEl.addEventListener("touchmove", (e) => {
    if (!swipeTarget) return
    const touch = e.touches[0]
    const dx = touch.clientX - touchStartX
    const dy = Math.abs(touch.clientY - touchStartY)

    if (dy > 20) {
      swipeTarget.style.transform = ""
      swipeTarget = null
      return
    }

    if (Math.abs(dx) > 8) {
      const capped = Math.max(-SWIPE_THRESHOLD, Math.min(SWIPE_THRESHOLD, dx * 0.6))
      swipeTarget.style.transform = `translateX(${capped}px)`

      if (!swipeTriggered && Math.abs(dx) >= SWIPE_THRESHOLD) {
        swipeTriggered = true
        openReplyFromArticle(swipeTarget)
        if (navigator.vibrate) navigator.vibrate(30)
      }
    }
  }, { passive: true })

  const endSwipe = () => {
    if (!swipeTarget) return
    swipeTarget.style.transition = "transform 0.25s ease"
    swipeTarget.style.transform = ""
    swipeTarget = null
    swipeTriggered = false
  }

  messagesEl.addEventListener("touchend", endSwipe, { passive: true })
  messagesEl.addEventListener("touchcancel", endSwipe, { passive: true })
}

// ─── Per-message dropdown menu ────────────────────────────────────────────────

function initMessageMenus(messagesEl) {
  let openMenu = null

  function closeOpenMenu() {
    if (!openMenu) return
    openMenu.setAttribute("hidden", "")
    openMenu.closest(".msg")?.querySelector(".msg-menu-btn")?.setAttribute("aria-expanded", "false")
    openMenu = null
  }

  // Delegate: open/close dropdown
  messagesEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".msg-menu-btn")
    if (btn) {
      e.stopPropagation()
      const article = btn.closest(".msg")
      const menu = article?.querySelector(".msg-menu")
      if (!menu) return

      if (menu === openMenu) {
        closeOpenMenu()
        return
      }
      closeOpenMenu()
      openMenu = menu

      // Position: own messages — anchor right; others — anchor left
      menu.classList.toggle("msg-menu--own", article.classList.contains("msg--own"))
      menu.removeAttribute("hidden")
      btn.setAttribute("aria-expanded", "true")
      return
    }

    // Handle menu item clicks
    const item = e.target.closest(".msg-menu-item[data-msg-action]")
    if (item) {
      e.stopPropagation()
      const article = item.closest(".msg")
      const action = item.dataset.msgAction
      closeOpenMenu()

      if (action === "reply" && article) {
        openReplyFromArticle(article)
      } else if (action === "select" && article) {
        enterSelectModeFromMenu(article)
      } else if (action === "delete") {
        const url = item.dataset.deleteUrl
        if (url) deleteMessage(url, article)
      }
      return
    }

    // Click outside closes menu
    if (!e.target.closest(".msg-menu")) closeOpenMenu()
  })

  // Close on outside touch
  document.addEventListener("click", (e) => {
    if (!openMenu) return
    if (!e.target.closest(".msg-menu") && !e.target.closest(".msg-menu-btn")) closeOpenMenu()
  })
}

// Called from menu "Select" item — enters multi-select mode for that message
function enterSelectModeFromMenu(article) {
  activateSelectMode(article)
}

// Shared delete helper for menu — delegates to the .msg-delete button so
// media_viewer.js handles stripping attachments + confirm dialog
function deleteMessage(url, article) {
  if (!article) return
  // Find or synthesise the .msg-delete button so media_viewer's handler fires
  let btn = article.querySelector(".msg-delete")
  if (!btn) {
    btn = document.createElement("button")
    btn.className = "msg-delete"
    btn.dataset.deleteUrl = url
    btn.style.display = "none"
    article.appendChild(btn)
  }
  btn.click()
}

// ─── Multi-select (long-press + menu) ────────────────────────────────────────

// Module-level references so enterSelectModeFromMenu can reach them
let _enterSelectMode = null
let _exitSelectMode = null

function activateSelectMode(article) {
  _enterSelectMode?.(article)
}

function initLongPressMultiSelect(messagesEl, roomId) {
  const bulkBar    = document.getElementById("bulk-action-bar")
  const bulkCount  = document.getElementById("bulk-count")
  const bulkCancel = document.getElementById("bulk-cancel")
  const bulkDelete = document.getElementById("bulk-delete")
  const isAdmin    = messagesEl.dataset.isAdmin === "true"
  const currentUser = messagesEl.dataset.currentUser

  // ── Helpers ────────────────────────────────────────────────────────────────

  function getSelectedIds() {
    return [...messagesEl.querySelectorAll(".msg-checkbox:checked")].map((cb) => cb.value)
  }

  function syncBulkBar() {
    const n = getSelectedIds().length
    if (bulkCount) bulkCount.textContent = `${n} selected`
    if (n === 0 && isSelectMode) exitSelectMode()
  }

  function canSelectArticle(article) {
    return isAdmin ||
      article.dataset.author === currentUser ||
      article.dataset.canDelete === "true"
  }

  function checkArticle(article, checked) {
    const cb = article.querySelector(".msg-checkbox")
    if (!cb) return
    cb.checked = checked
    article.classList.toggle("msg--selected", checked)
  }

  // ── Enter / exit ───────────────────────────────────────────────────────────

  function enterSelectMode(article) {
    if (isSelectMode) {
      // Already in select mode — toggle this article
      if (canSelectArticle(article)) checkArticle(article, true)
      syncBulkBar()
      return
    }
    isSelectMode = true
    if (navigator.vibrate) navigator.vibrate(55)
    messagesEl.classList.add("is-select-mode")
    bulkBar?.removeAttribute("hidden")

    // Auto-select the triggering article
    if (article && canSelectArticle(article)) checkArticle(article, true)
    syncBulkBar()
  }

  function exitSelectMode() {
    isSelectMode = false
    messagesEl.classList.remove("is-select-mode")
    bulkBar?.setAttribute("hidden", "")
    messagesEl.querySelectorAll(".msg-checkbox").forEach((cb) => { cb.checked = false })
    messagesEl.querySelectorAll(".msg--selected").forEach((el) => el.classList.remove("msg--selected"))
    syncBulkBar()
  }

  // Wire module-level references so the menu can call them
  _enterSelectMode = enterSelectMode
  _exitSelectMode  = exitSelectMode

  // ── Toggle selection by clicking a message in select mode ──────────────────

  messagesEl.addEventListener("click", (e) => {
    if (!isSelectMode) return
    if (e.target.closest(".msg-menu-btn, .msg-menu, .msg-media-trigger, a[href]")) return
    const article = e.target.closest(".msg")
    if (!article || !canSelectArticle(article)) return
    const cb = article.querySelector(".msg-checkbox")
    if (!cb) return
    cb.checked = !cb.checked
    article.classList.toggle("msg--selected", cb.checked)
    syncBulkBar()
  })

  // ── Long-press detection ───────────────────────────────────────────────────

  let lpTimer = null
  let lpMoved = false

  function lpStart(article) {
    lpMoved = false
    clearTimeout(lpTimer)
    lpTimer = setTimeout(() => {
      lpTimer = null
      if (!lpMoved) enterSelectMode(article)
    }, 600)
  }

  function lpCancel() {
    clearTimeout(lpTimer)
    lpTimer = null
  }

  // Touch — non-passive so we can preventDefault after the timer fires
  messagesEl.addEventListener("touchstart", (e) => {
    if (isSelectMode) return
    const article = e.target.closest(".msg")
    if (!article) return
    if (e.target.closest(".msg-menu-btn, .msg-menu, .msg-media-trigger, .msg-reply, .msg-delete, a[href]")) return
    lpStart(article)
  }, { passive: true })

  messagesEl.addEventListener("touchmove",   () => { lpMoved = true; lpCancel() }, { passive: true })
  messagesEl.addEventListener("touchend",    lpCancel, { passive: true })
  messagesEl.addEventListener("touchcancel", lpCancel, { passive: true })

  // Mouse (desktop)
  messagesEl.addEventListener("mousedown", (e) => {
    if (isSelectMode) return
    if (e.button !== 0) return
    const article = e.target.closest(".msg")
    if (!article) return
    if (e.target.closest(".msg-menu-btn, .msg-menu, .msg-media-trigger, .msg-reply, .msg-delete, a[href]")) return
    lpStart(article)
  })

  document.addEventListener("mouseup",   lpCancel)
  document.addEventListener("mousemove", () => { if (lpTimer) { lpMoved = true; lpCancel() } })

  // ── Bulk action bar buttons ────────────────────────────────────────────────

  bulkCancel?.addEventListener("click", exitSelectMode)

  bulkDelete?.addEventListener("click", async () => {
    const ids = getSelectedIds()
    if (!ids.length) return
    const url  = bulkDelete.dataset.bulkUrl
    const token = document.querySelector('meta[name="csrf-token"]')?.content

    try {
      const res = await fetch(url, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token, Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ ids: ids.join(",") })
      })
      if (res.ok) {
        const data = await res.json()
        data.deleted_ids?.forEach((id) => removeMessageById(messagesEl, id))
      }
    } catch (err) {
      console.error("Bulk delete failed:", err)
    }
    exitSelectMode()
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

function ensureChatFeedWrap(messagesEl) {
  const parent = messagesEl.parentElement
  if (parent?.classList.contains("chat-feed-wrap")) return parent

  const wrap = document.createElement("div")
  wrap.className = "chat-feed-wrap"
  parent?.insertBefore(wrap, messagesEl)
  wrap.appendChild(messagesEl)
  return wrap
}

function updateJumpBottomButton() {
  if (!jumpBottomBtn || !jumpBottomBadge) return

  if (unreadBelowCount <= 0) {
    jumpBottomBtn.hidden = true
    jumpBottomBadge.hidden = true
    jumpBottomBadge.textContent = ""
    return
  }

  jumpBottomBtn.hidden = false
  jumpBottomBadge.hidden = false
  jumpBottomBadge.textContent = unreadBelowCount > 99 ? "99+" : String(unreadBelowCount)
}

function bumpUnreadBelow(count = 1) {
  unreadBelowCount += count
  updateJumpBottomButton()
}

function clearUnreadBelow() {
  unreadBelowCount = 0
  updateJumpBottomButton()
}

function initNewMessagesIndicator(messagesEl) {
  const wrap = ensureChatFeedWrap(messagesEl)

  jumpBottomBtn = document.getElementById("chat-jump-bottom")
  if (!jumpBottomBtn) {
    jumpBottomBtn = document.createElement("button")
    jumpBottomBtn.type = "button"
    jumpBottomBtn.id = "chat-jump-bottom"
    jumpBottomBtn.className = "chat-jump-bottom"
    jumpBottomBtn.hidden = true
    jumpBottomBtn.setAttribute("aria-label", "Jump to latest messages")
    jumpBottomBtn.innerHTML =
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M7 13l5 5 5-5"/></svg>' +
      '<span class="chat-jump-badge" hidden></span>'
    wrap.appendChild(jumpBottomBtn)
  }

  jumpBottomBadge = jumpBottomBtn.querySelector(".chat-jump-badge")

  jumpBottomBtn.addEventListener("click", () => {
    clearUnreadBelow()
    scrollToBottom(messagesEl, true)
  })

  messagesEl.addEventListener(
    "scroll",
    () => {
      if (isNearBottom(messagesEl)) clearUnreadBelow()
    },
    { passive: true }
  )
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

  const nearBeforeAppend = isNearBottom(messagesEl)

  applyOwnMessageStyle(article, messagesEl)
  enhanceMessageElement(article)

  while (temp.firstChild) {
    messagesEl.appendChild(temp.firstChild)
  }

  const shouldScroll =
    options.scroll !== false && (options.forceScroll || nearBeforeAppend || isNearBottom(messagesEl))

  temp.querySelectorAll("img").forEach((img) => {
    if (!img.complete && shouldScroll) {
      img.addEventListener(
        "load",
        () => {
          if (isNearBottom(messagesEl)) scrollToBottom(messagesEl)
        },
        { once: true }
      )
    }
  })

  if (shouldScroll) {
    scrollToBottom(messagesEl, Boolean(options.forceScroll))
    if (options.forceScroll || isNearBottom(messagesEl)) clearUnreadBelow()
  } else {
    bumpUnreadBelow(1)
  }
}

function initAutoGrow(textarea) {
  const resize = () => {
    textarea.style.height = "auto"
    textarea.style.height = `${Math.min(textarea.scrollHeight, 96)}px`
  }
  textarea.addEventListener("input", resize)
  resize()
}

function getPartialShortcut(text) {
  const colon = text.match(/:([a-z0-9_+-]*)$/i)
  if (colon) return { type: "colon", query: colon[1], start: colon.index, length: colon[0].length }

  const lt = text.match(/<([0-9$\/]*)$/i)
  if (lt) return { type: "lt", query: lt[0], start: lt.index, length: lt[0].length }

  return null
}

function applyHintSelection(textarea, emoji, shortcut) {
  const partial = getPartialShortcut(textarea.value)
  if (!partial) return

  const before = textarea.value.slice(0, partial.start)
  const after = textarea.value.slice(partial.start + partial.length)
  textarea.value = before + emoji + after
  const pos = before.length + emoji.length
  textarea.selectionStart = pos
  textarea.selectionEnd = pos
  textarea.dispatchEvent(new Event("input", { bubbles: true }))
}

function initEmojiShortcuts(textarea) {
  if (!textarea) return

  let hintsEl = document.getElementById("emoji-hints")
  if (!hintsEl) {
    hintsEl = document.createElement("div")
    hintsEl.id = "emoji-hints"
    hintsEl.className = "emoji-hints"
    hintsEl.hidden = true
    const composer = document.getElementById("chat-composer")
    if (composer?.parentElement) composer.parentElement.insertBefore(hintsEl, composer)
  }

  let hintIndex = 0

  const hintButtons = () => [...hintsEl.querySelectorAll(".emoji-hint-btn")]

  const updateHintFocus = () => {
    hintButtons().forEach((btn, i) => {
      btn.classList.toggle("emoji-hint-btn--active", i === hintIndex)
    })
    hintButtons()[hintIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }

  const hideHints = () => {
    hintsEl.hidden = true
    hintsEl.innerHTML = ""
    hintIndex = 0
  }

  const selectHintAt = (index) => {
    const btn = hintButtons()[index]
    if (!btn) return
    applyHintSelection(textarea, btn.dataset.emoji, btn.dataset.shortcut)
    hideHints()
  }

  const showHints = () => {
    const partial = getPartialShortcut(textarea.value)
    if (!partial) {
      hideHints()
      return
    }

    const matches = getEmojiShortcutMatches(partial.query, partial.type)
    if (!matches.length) {
      hideHints()
      return
    }

    hintsEl.innerHTML = matches
      .map(
        ({ shortcut, emoji }, i) =>
          `<button type="button" class="emoji-hint-btn${i === 0 ? " emoji-hint-btn--active" : ""}" data-shortcut="${shortcut.replace(/"/g, "&quot;")}" data-emoji="${emoji}">` +
          `<span class="emoji-hint-emoji">${emoji}</span>` +
          `<span class="emoji-hint-label">${shortcut}</span></button>`
      )
      .join("")
    hintIndex = 0
    hintsEl.hidden = false
  }

  hintsEl.addEventListener("mousedown", (event) => {
    const btn = event.target.closest(".emoji-hint-btn")
    if (!btn) return
    event.preventDefault()
    const index = hintButtons().indexOf(btn)
    selectHintAt(index >= 0 ? index : 0)
  })

  textarea.addEventListener("input", showHints)

  textarea.addEventListener("keydown", (event) => {
    if (hintsEl.hidden) return
    const buttons = hintButtons()
    if (!buttons.length) return

    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault()
      hintIndex = Math.min(hintIndex + 1, buttons.length - 1)
      updateHintFocus()
      return
    }

    if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault()
      hintIndex = Math.max(hintIndex - 1, 0)
      updateHintFocus()
      return
    }

    if (event.key === "Tab" || (event.key === "Enter" && !event.shiftKey)) {
      event.preventDefault()
      selectHintAt(hintIndex)
      return
    }

    if (event.key === "Escape") hideHints()
  })

  textarea.addEventListener("blur", () => {
    setTimeout(hideHints, 180)
    const before = textarea.value
    const after = applyEmojiShortcutsToText(before)
    if (after !== before) {
      textarea.value = after
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    }
  })
}

const REPLY_INTERACTIVE_SELECTOR =
  ".msg-delete, .msg-menu-btn, .msg-menu, .msg-media-trigger, .msg-voice-play, .msg-voice-scrub, .msg-file-card, .msg-reply-quote, a[href], input, textarea, select"

function openReplyFromArticle(article) {
  const replyBar = document.getElementById("reply-bar")
  const replyInput = document.getElementById("message_reply_to_id")
  const replyAuthor = document.getElementById("reply-bar-author")
  const replyPreview = document.getElementById("reply-bar-preview")

  const id = article.dataset.replyId || article.querySelector(".msg-reply")?.dataset.replyId || ""
  if (!id) return

  const author =
    article.dataset.replyAuthor || article.querySelector(".msg-reply")?.dataset.replyAuthor || ""
  const preview =
    article.dataset.replyPreview || article.querySelector(".msg-reply")?.dataset.replyPreview || ""

  if (replyInput) replyInput.value = id
  if (replyAuthor) replyAuthor.textContent = author
  if (replyPreview) replyPreview.textContent = preview
  if (replyBar) {
    replyBar.hidden = false
    replyBar.removeAttribute("hidden")
  }

  document.getElementById("message_body")?.focus()
}

function scrollToReferencedMessage(messagesEl, messageId) {
  const target = document.getElementById(`message_${messageId}`)
  if (!target) return false

  target.scrollIntoView({ behavior: "smooth", block: "center" })
  target.classList.remove("msg--highlight")
  void target.offsetWidth
  target.classList.add("msg--highlight")
  setTimeout(() => target.classList.remove("msg--highlight"), 1400)
  return true
}

function initReplyQuoteScroll(messagesEl) {
  messagesEl.addEventListener("click", (event) => {
    const quote = event.target.closest(".msg-reply-quote[data-reply-target-id]")
    if (!quote) return
    event.preventDefault()
    event.stopPropagation()
    scrollToReferencedMessage(messagesEl, quote.dataset.replyTargetId)
  })
}

function initReplyHandlers(messagesEl) {
  document.getElementById("reply-bar-cancel")?.addEventListener("click", () => clearReply())

  messagesEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".msg-reply")
    if (!btn) return
    event.preventDefault()
    const article = btn.closest(".msg")
    if (article) openReplyFromArticle(article)
  })

  messagesEl.addEventListener("dblclick", (event) => {
    if (event.target.closest(REPLY_INTERACTIVE_SELECTOR)) return
    const article = event.target.closest(".msg")
    if (!article) return
    event.preventDefault()
    openReplyFromArticle(article)
  })

  let lastTapAt = 0
  let lastTapArticle = null

  messagesEl.addEventListener(
    "touchend",
    (event) => {
      if (event.target.closest(REPLY_INTERACTIVE_SELECTOR)) return
      const article = event.target.closest(".msg")
      if (!article) return

      const now = Date.now()
      if (article === lastTapArticle && now - lastTapAt < 360) {
        event.preventDefault()
        openReplyFromArticle(article)
        lastTapAt = 0
        lastTapArticle = null
        return
      }

      lastTapAt = now
      lastTapArticle = article
    },
    { passive: false }
  )
}

function clearReply() {
  const replyBar = document.getElementById("reply-bar")
  const replyInput = document.getElementById("message_reply_to_id")
  const replyAuthor = document.getElementById("reply-bar-author")
  const replyPreview = document.getElementById("reply-bar-preview")

  if (replyInput) replyInput.value = ""
  if (replyAuthor) replyAuthor.textContent = ""
  if (replyPreview) replyPreview.textContent = ""
  if (replyBar) {
    replyBar.hidden = true
    replyBar.setAttribute("hidden", "")
  }
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
  const processedBody = body ? applyEmojiShortcutsToText(body) : ""
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
  if (force || isNearBottom(el)) clearUnreadBelow()
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
  article.querySelector(".msg-header")?.remove()
  article.querySelector(".msg-name")?.remove()
  article.querySelector(".msg-avatar")?.remove()
  normalizeOwnMessageLayout(article, messagesEl)
}

function normalizeOwnMessageLayout(article, messagesEl) {
  const line = article.querySelector(".msg-line")
  const bubbleGroup = article.querySelector(".msg-bubble-group")
  if (!line || !bubbleGroup) return

  const visual = article.classList.contains("msg--visual")
  let tools = article.querySelector(".msg-side-tools")
  const replyBtn = article.querySelector(".msg-reply")
  let timeEl = article.querySelector(".msg-time")

  if (!tools) {
    tools = document.createElement("div")
    tools.className = `msg-side-tools${visual ? " msg-side-tools--visual" : ""}`
    line.insertBefore(tools, bubbleGroup)
  } else if (
    tools.compareDocumentPosition(bubbleGroup) & Node.DOCUMENT_POSITION_PRECEDING
  ) {
    line.insertBefore(tools, bubbleGroup)
  }

  tools.classList.toggle("msg-side-tools--visual", visual)

  let actions = tools.querySelector(".msg-side-actions")
  if (!actions) {
    actions = document.createElement("div")
    actions.className = "msg-side-actions"
    tools.prepend(actions)
  }

  if (replyBtn && replyBtn.parentElement !== actions) {
    actions.appendChild(replyBtn)
  }

  if (timeEl) {
    if (timeEl.parentElement !== tools) {
      timeEl.remove()
      tools.appendChild(timeEl)
    } else if (actions.contains(timeEl)) {
      actions.removeChild(timeEl)
      tools.appendChild(timeEl)
    }
  }

  ensureDeleteButton(article, messagesEl)
}

function ensureDeleteButton(article, messagesEl) {
  const isOwn = article.classList.contains("msg--own")
  const isAdmin = messagesEl.dataset.isAdmin === "true"
  if (!isOwn && !isAdmin) return

  const roomId = messagesEl.dataset.roomId
  const messageId = article.dataset.messageId
  if (!roomId || !messageId) return
  if (article.querySelector(".msg-side-tools .msg-delete")) return

  const deleteUrl = `/rooms/${roomId}/messages/${messageId}`
  const tools = article.querySelector(".msg-side-tools")
  if (!tools) return

  let actions = tools.querySelector(".msg-side-actions")
  if (!actions) {
    actions = document.createElement("div")
    actions.className = "msg-side-actions"
    tools.prepend(actions)
  }

  const reply = actions.querySelector(".msg-reply")
  if (reply) {
    reply.after(buildDeleteButton(deleteUrl))
  } else {
    actions.appendChild(buildDeleteButton(deleteUrl))
  }
}

function buildDeleteButton(deleteUrl) {
  const btn = document.createElement("button")
  btn.type = "button"
  btn.className = "msg-delete"
  btn.dataset.deleteUrl = deleteUrl
  btn.setAttribute("aria-label", "Delete message")
  btn.title = "Delete"
  btn.innerHTML =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>'
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
    if (!analyser) return

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
  stopTimer()
  stopWaveAnimation()

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.addEventListener("stop", () => cleanupMic(), { once: true })
    mediaRecorder.stop()
  } else {
    cleanupMic()
  }

  mediaRecorder = null
  recordedChunks = []
  voiceBlob = null
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
