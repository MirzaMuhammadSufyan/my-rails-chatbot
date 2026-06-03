import { createConsumer } from "@rails/actioncable"

let mediaRecorder = null
let recordedChunks = []
let voiceBlob = null

export function initChat(roomId) {
  const messagesEl = document.getElementById("messages")
  const form = document.getElementById("chat-form")
  const recordBtn = document.getElementById("record-voice")
  const stopBtn = document.getElementById("stop-voice")
  const voiceStatus = document.getElementById("voice-status")

  if (!messagesEl || !form) return

  scrollToBottom(messagesEl)

  const consumer = createConsumer()
  consumer.subscriptions.create(
    { channel: "ChatChannel", room_id: roomId },
    {
      received(data) {
        if (!data.html) return
        const temp = document.createElement("div")
        temp.innerHTML = data.html
        const article = temp.querySelector("article[data-message-id]")
        if (article && document.getElementById(article.id)) return

        while (temp.firstChild) {
          messagesEl.appendChild(temp.firstChild)
        }
        scrollToBottom(messagesEl)
      }
    }
  )

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    await sendMessage(form, voiceBlob)
    form.reset()
    voiceBlob = null
    if (voiceStatus) voiceStatus.textContent = ""
    clearFileInputs(form)
  })

  if (recordBtn && stopBtn) {
    recordBtn.addEventListener("click", () => startRecording(recordBtn, stopBtn, voiceStatus))
    stopBtn.addEventListener("click", () => stopRecording(recordBtn, stopBtn, voiceStatus, (blob) => {
      voiceBlob = blob
    }))
  }
}

async function sendMessage(form, voiceBlob) {
  const formData = new FormData(form)
  const body = formData.get("message[body]")
  const hasFile = ["message_media_image", "message_media_video", "message_media_audio"].some((id) => {
    const input = document.getElementById(id)
    return input && input.files && input.files.length > 0
  })

  if (!body?.toString().trim() && !hasFile && !voiceBlob) {
    alert("Add text, emoji, a file, or a voice recording before sending.")
    return
  }

  if (voiceBlob) {
    formData.delete("message[media]")
    formData.append("message[media]", voiceBlob, `voice-${Date.now()}.webm`)
  } else {
    const fileInput = pickFirstFileInput()
    if (fileInput && fileInput.files[0]) {
      formData.delete("message[media]")
      formData.append("message[media]", fileInput.files[0])
    }
  }

  const token = document.querySelector('meta[name="csrf-token"]')?.content

  const response = await fetch(form.action, {
    method: "POST",
    body: formData,
    headers: {
      "X-CSRF-Token": token,
      Accept: "application/json"
    },
    credentials: "same-origin"
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    alert(data.errors?.join("\n") || "Could not send message.")
  }
}

function pickFirstFileInput() {
  for (const id of ["message_media_image", "message_media_video", "message_media_audio"]) {
    const input = document.getElementById(id)
    if (input?.files?.[0]) return input
  }
  return null
}

function clearFileInputs(form) {
  form.querySelectorAll('input[type="file"]').forEach((input) => {
    input.value = ""
  })
}

function scrollToBottom(el) {
  el.scrollTop = el.scrollHeight
}

async function startRecording(recordBtn, stopBtn, voiceStatus) {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert("Voice recording is not supported in this browser.")
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    recordedChunks = []
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.push(e.data)
    }
    mediaRecorder.start()
    recordBtn.disabled = true
    stopBtn.disabled = false
    if (voiceStatus) voiceStatus.textContent = "Recording..."
  } catch (err) {
    alert("Microphone access denied or unavailable.")
  }
}

function stopRecording(recordBtn, stopBtn, voiceStatus, onComplete) {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return

  mediaRecorder.addEventListener("stop", () => {
    const blob = new Blob(recordedChunks, { type: "audio/webm" })
    onComplete(blob)
    if (voiceStatus) voiceStatus.textContent = "Voice ready to send."
    recordBtn.disabled = false
    stopBtn.disabled = true
    mediaRecorder.stream?.getTracks().forEach((t) => t.stop())
  }, { once: true })

  mediaRecorder.stop()
}
