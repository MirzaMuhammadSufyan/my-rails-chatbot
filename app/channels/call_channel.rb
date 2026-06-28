class CallChannel < ApplicationCable::Channel
  def subscribed
    @room = Room.find_by(id: params[:room_id])
    return reject unless @room

    Rails.logger.info("[CallChannel] subscribed: user=#{current_user_name.inspect} room=#{@room.id}")
    stream_for @room
  end

  def unsubscribed
    Rails.logger.info("[CallChannel] unsubscribed: user=#{current_user_name.inspect} room=#{@room&.id}")
    stop_all_streams
  end

  def signal(data)
    return unless @room

    payload = data.slice("type", "offer", "answer", "candidate", "audioOnly", "video", "to", "from", "name")
    payload["from"] ||= current_user_name
    payload["name"] ||= current_user_name

    CallChannel.broadcast_to(@room, payload)
  end
end
