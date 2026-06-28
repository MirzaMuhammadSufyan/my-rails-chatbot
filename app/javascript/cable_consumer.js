/**
 * Shared ActionCable consumer — imported as a singleton so the entire app
 * reuses ONE WebSocket connection regardless of how many modules import it.
 */
import { createConsumer } from "@rails/actioncable"
export const consumer = createConsumer()
