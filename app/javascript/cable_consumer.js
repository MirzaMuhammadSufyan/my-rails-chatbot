/**
 * Shared ActionCable consumer — imported as a singleton so the entire app
 * reuses ONE WebSocket connection regardless of how many modules import it.
 */
import { createConsumer } from "@rails/actioncable"

const actionCableMeta = document.querySelector("meta[name='action-cable-url']")?.content
const defaultCableUrl = `${window.location.origin.replace(/^http/, "ws")}/cable`
export const consumer = createConsumer(actionCableMeta || defaultCableUrl)
