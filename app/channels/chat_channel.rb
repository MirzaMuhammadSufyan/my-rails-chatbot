class ChatChannel < ApplicationCable::Channel
  def subscribed
    @room = Room.find(params[:room_id])
    stream_for @room
  rescue ActiveRecord::RecordNotFound
    reject
  end

  def unsubscribed
    stop_all_streams
  end

  # WebRTC call signalling — relayed through the same channel so only
  # one WebSocket connection is needed per client.
  def call_signal(data)
    return unless @room

    payload = {
      "call_signal" => true,
      "type"        => data["type"].to_s,
      "from"        => current_user_name
    }

    # forward offer / answer / ICE candidate payloads as-is
    %w[offer answer candidate audioOnly].each do |key|
      payload[key] = data[key] if data.key?(key)
    end

    ChatChannel.broadcast_to(@room, payload)
  rescue StandardError => e
    Rails.logger.error("[ChatChannel#call_signal] #{e.class}: #{e.message}")
  end
end
