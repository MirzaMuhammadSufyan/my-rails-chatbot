class ChatChannel < ApplicationCable::Channel
  def subscribed
    @room = Room.find(params[:room_id])
    Rails.logger.info("[ChatChannel] subscribed: user=#{current_user_name.inspect} room=#{@room.id}")
    stream_for @room
  rescue ActiveRecord::RecordNotFound
    reject
  end

  def unsubscribed
    Rails.logger.info("[ChatChannel] unsubscribed: user=#{current_user_name.inspect} room=#{@room&.id}")
    stop_all_streams
  end

  # WebRTC call signalling — relayed through the same channel so only
  # one WebSocket connection is needed per client.
  def call_signal(data)
    return unless @room

    Rails.logger.info("[ChatChannel#call_signal] received from=#{current_user_name} data_type=#{data['type']}")

    payload = {
      "call_signal" => true,
      "type"        => data["type"].to_s,
      "from"        => current_user_name
    }

    # forward offer / answer / ICE candidate payloads as-is
    %w[offer answer candidate audioOnly video].each do |key|
      payload[key] = data[key] if data.key?(key)
    end

    ChatChannel.broadcast_to(@room, payload)
    Rails.logger.info("[ChatChannel#call_signal] broadcast to room=#{@room.id} type=#{payload['type']} from=#{payload['from']} video=#{payload['video']}")
  rescue StandardError => e
    Rails.logger.error("[ChatChannel#call_signal] #{e.class}: #{e.message}")
  end
end
