import { initChat } from "chat"
import { initVideoCall } from "video_call_controller"

function bootChat() {
  const messagesEl = document.querySelector("[data-chat-room]")
  if (messagesEl) {
    initChat(messagesEl.dataset.roomId)
    initVideoCall(messagesEl.dataset.roomId, messagesEl.dataset.currentUser)
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootChat)
} else {
  bootChat()
}
