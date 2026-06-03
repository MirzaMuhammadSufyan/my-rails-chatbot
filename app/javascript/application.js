import { initChat } from "chat"

function bootChat() {
  const messagesEl = document.querySelector("[data-chat-room]")
  if (messagesEl) {
    initChat(messagesEl.dataset.roomId)
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootChat)
} else {
  bootChat()
}
