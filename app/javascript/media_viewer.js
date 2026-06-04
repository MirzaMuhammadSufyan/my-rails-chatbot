let activeVoicePlayer = null
const progressLoops = new WeakMap()
let lightboxZoom = 1
const LIGHTBOX_MIN_ZOOM = 1
const LIGHTBOX_MAX_ZOOM = 3

export function initMediaViewer(root = document) {
  const feed = root.querySelector?.("[data-chat-room]") || root.closest?.("[data-chat-room]") || root
  const scope = feed.id === "messages" || feed.dataset?.chatRoom ? feed : root

  scope.querySelectorAll(".msg-voice-player:not([data-voice-ready])").forEach(initVoicePlayer)

  if (scope._mediaViewerBound) return
  scope._mediaViewerBound = true

  scope.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest(".msg-delete")
    if (deleteBtn) {
      event.preventDefault()
      deleteMessage(deleteBtn.dataset.deleteUrl, deleteBtn.closest(".msg"))
      return
    }

    const trigger = event.target.closest(".msg-media-trigger")
    if (trigger) {
      event.preventDefault()
      openLightbox(trigger.dataset.mediaType, trigger.dataset.mediaSrc, trigger.dataset.mediaMime)
      return
    }

    const scrub = event.target.closest(".msg-voice-scrub")
    if (scrub) {
      const player = scrub.closest(".msg-voice-player")
      if (player) seekVoicePlayer(player, scrub, event)
      return
    }

    const playBtn = event.target.closest(".msg-voice-play")
    if (playBtn) {
      event.preventDefault()
      const player = playBtn.closest(".msg-voice-player")
      if (player) toggleVoicePlayer(player)
    }
  })

  if (!document._lightboxKeyBound) {
    document._lightboxKeyBound = true
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeLightbox()
    })
  }

  const lightbox = document.getElementById("media-lightbox")
  lightbox?.querySelector(".media-lightbox-backdrop")?.addEventListener("click", closeLightbox)
  lightbox?.querySelector(".media-lightbox-close")?.addEventListener("click", closeLightbox)
}

export function enhanceMessageElement(article) {
  if (!article) return
  article.querySelectorAll(".msg-voice-player:not([data-voice-ready])").forEach(initVoicePlayer)
}

export function stripMessageMedia(article) {
  if (!article) return

  article.querySelectorAll("video, audio").forEach((el) => {
    try {
      el.pause()
    } catch {
      /* ignore */
    }
    el.removeAttribute("src")
    el.querySelectorAll("source").forEach((source) => {
      source.removeAttribute("src")
      source.src = ""
    })
    try {
      el.load()
    } catch {
      /* ignore */
    }
  })

  article.querySelectorAll("img.msg-image").forEach((img) => {
    img.removeAttribute("src")
  })
}

function removeMessageElement(article) {
  if (activeVoicePlayer?.closest(".msg") === article) {
    activeVoicePlayer = null
  }

  const feed = article.closest("[data-chat-room]")
  if (feed) {
    const distanceFromBottom =
      feed.scrollHeight - feed.scrollTop - feed.clientHeight
    article.remove()
    feed.scrollTop = Math.max(
      0,
      feed.scrollHeight - feed.clientHeight - distanceFromBottom
    )
    return
  }

  article.remove()
}

async function deleteMessage(url, article) {
  if (!url || !article) return
  if (article.dataset.deleting === "true") return
  if (!confirm("Delete this message?")) return

  article.dataset.deleting = "true"
  const token = document.querySelector('meta[name="csrf-token"]')?.content

  try {
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-CSRF-Token": token,
        Accept: "application/json"
      },
      credentials: "same-origin"
    })

    if (response.ok || response.status === 204 || response.status === 404) {
      stripMessageMedia(article)
      removeMessageElement(article)
      return
    }

    delete article.dataset.deleting
    alert("Could not delete message.")
  } catch {
    stripMessageMedia(article)
    removeMessageElement(article)
  }
}

function openLightbox(type, src, mime) {
  if (!src) return

  const lightbox = document.getElementById("media-lightbox")
  const body = lightbox?.querySelector(".media-lightbox-body")
  const hint = document.getElementById("media-lightbox-hint")
  if (!lightbox || !body) return

  lightboxZoom = 1
  body.querySelectorAll(".media-lightbox-viewport, .media-lightbox-video").forEach((el) => el.remove())

  if (type === "image") {
    const viewport = document.createElement("div")
    viewport.className = "media-lightbox-viewport"

    const img = document.createElement("img")
    img.src = src
    img.alt = "Full size image"
    img.className = "media-lightbox-image"
    img.style.transform = "scale(1)"

    viewport.appendChild(img)
    body.appendChild(viewport)

    viewport.addEventListener("wheel", (event) => onLightboxZoomWheel(event, img), { passive: false })

    if (hint) hint.hidden = false
  } else if (type === "video") {
    const video = document.createElement("video")
    video.controls = true
    video.autoplay = true
    video.playsInline = true
    video.className = "media-lightbox-video"
    const source = document.createElement("source")
    source.src = src
    if (mime) source.type = mime
    video.appendChild(source)
    body.appendChild(video)
    if (hint) hint.hidden = true
  } else {
    return
  }

  lightbox.hidden = false
  lightbox.setAttribute("aria-hidden", "false")
  document.body.classList.add("lightbox-open")
}

function onLightboxZoomWheel(event, img) {
  if (!event.ctrlKey) return
  event.preventDefault()

  const step = event.deltaY < 0 ? 0.12 : -0.12
  lightboxZoom = Math.min(LIGHTBOX_MAX_ZOOM, Math.max(LIGHTBOX_MIN_ZOOM, lightboxZoom + step))
  img.style.transform = `scale(${lightboxZoom})`

  const hint = document.getElementById("media-lightbox-hint")
  if (hint) {
    hint.textContent = `Zoom ${Math.round(lightboxZoom * 100)}% · Ctrl + scroll`
  }
}

function closeLightbox() {
  const lightbox = document.getElementById("media-lightbox")
  if (!lightbox || lightbox.hidden) return

  lightbox.querySelector("video")?.pause()
  lightbox.querySelectorAll(".media-lightbox-viewport, .media-lightbox-video").forEach((el) => el.remove())

  const hint = document.getElementById("media-lightbox-hint")
  if (hint) {
    hint.hidden = true
    hint.textContent = "Ctrl + scroll to zoom (up to 300%)"
  }

  lightboxZoom = 1
  lightbox.hidden = true
  lightbox.setAttribute("aria-hidden", "true")
  document.body.classList.remove("lightbox-open")
}

function initVoicePlayer(player) {
  player.dataset.voiceReady = "true"
  const audio = player.querySelector(".msg-voice-audio")
  if (!audio) return

  audio.addEventListener("loadedmetadata", () => cacheDuration(player, audio))
  audio.addEventListener("durationchange", () => cacheDuration(player, audio))
  audio.addEventListener("ended", () => stopVoicePlayback(player))

  if (audio.readyState >= 1) cacheDuration(player, audio)
  updateDurationLabel(player, 0)
}

function cacheDuration(player, audio) {
  const d = audio.duration
  if (Number.isFinite(d) && d > 0 && d < 86400) {
    player.dataset.totalDuration = String(d)
    if (!player.classList.contains("is-playing")) {
      updateDurationLabel(player, 0)
    }
    return
  }

  resolveWebmDuration(audio).then((fixed) => {
    if (fixed > 0) {
      player.dataset.totalDuration = String(fixed)
      if (!player.classList.contains("is-playing")) updateDurationLabel(player, 0)
    }
  })
}

function resolveWebmDuration(audio) {
  const existing = audio.duration
  if (Number.isFinite(existing) && existing > 0 && existing < 86400) {
    return Promise.resolve(existing)
  }

  return new Promise((resolve) => {
    const onTimeUpdate = () => {
      const d = audio.duration
      if (Number.isFinite(d) && d > 0 && d < 86400) {
        audio.removeEventListener("timeupdate", onTimeUpdate)
        audio.currentTime = 0
        resolve(d)
      }
    }

    audio.addEventListener("timeupdate", onTimeUpdate)
    try {
      audio.currentTime = 1e10
    } catch {
      audio.removeEventListener("timeupdate", onTimeUpdate)
      resolve(0)
    }

    setTimeout(() => {
      audio.removeEventListener("timeupdate", onTimeUpdate)
      resolve(0)
    }, 2000)
  })
}

function getTotalDuration(player, audio) {
  const cached = parseFloat(player.dataset.totalDuration)
  if (Number.isFinite(cached) && cached > 0) return cached

  const d = audio.duration
  if (Number.isFinite(d) && d > 0 && d < 86400) return d

  return 0
}

function toggleVoicePlayer(player) {
  const audio = player.querySelector(".msg-voice-audio")
  if (!audio) return

  if (!audio.paused) {
    audio.pause()
    stopVoicePlayback(player)
    return
  }

  if (activeVoicePlayer && activeVoicePlayer !== player) {
    const other = activeVoicePlayer.querySelector(".msg-voice-audio")
    other?.pause()
    stopVoicePlayback(activeVoicePlayer)
  }

  activeVoicePlayer = player

  audio.play().then(() => {
    player.classList.add("is-playing")
    startProgressLoop(player, audio)
  }).catch(() => {
    stopVoicePlayback(player)
  })
}

function stopVoicePlayback(player) {
  player.classList.remove("is-playing")
  stopProgressLoop(player)

  const progressEl = player.querySelector(".msg-voice-progress")
  if (progressEl) progressEl.style.width = "0%"

  const audio = player.querySelector(".msg-voice-audio")
  if (audio) updateDurationLabel(player, 0)

  if (activeVoicePlayer === player) activeVoicePlayer = null
}

function startProgressLoop(player, audio) {
  stopProgressLoop(player)

  const progressEl = player.querySelector(".msg-voice-progress")

  const tick = () => {
    if (!player.classList.contains("is-playing")) return

    const total = getTotalDuration(player, audio)
    const current = audio.currentTime

    if (total > 0) {
      const pct = Math.min(100, (current / total) * 100)
      if (progressEl) progressEl.style.width = `${pct}%`
      updateDurationLabel(player, current)
    } else {
      if (progressEl) progressEl.style.width = "30%"
    }

    progressLoops.set(player, requestAnimationFrame(tick))
  }

  progressLoops.set(player, requestAnimationFrame(tick))
}

function stopProgressLoop(player) {
  const id = progressLoops.get(player)
  if (id) cancelAnimationFrame(id)
  progressLoops.delete(player)
}

function seekVoicePlayer(player, scrub, event) {
  const audio = player.querySelector(".msg-voice-audio")
  if (!audio) return

  const total = getTotalDuration(player, audio)
  if (total <= 0) return

  const rect = scrub.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
  audio.currentTime = ratio * total

  const progressEl = player.querySelector(".msg-voice-progress")
  if (progressEl) progressEl.style.width = `${ratio * 100}%`
  updateDurationLabel(player, audio.currentTime)
}

function updateDurationLabel(player, current) {
  const durationEl = player.querySelector(".msg-voice-duration")
  if (!durationEl) return

  const audio = player.querySelector(".msg-voice-audio")
  const total = audio ? getTotalDuration(player, audio) : 0

  if (total > 0) {
    durationEl.textContent = `${formatVoiceTime(current)} / ${formatVoiceTime(total)}`
  } else {
    durationEl.textContent = formatVoiceTime(current)
  }
}

function formatVoiceTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const s = Math.floor(seconds)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, "0")}`
}
