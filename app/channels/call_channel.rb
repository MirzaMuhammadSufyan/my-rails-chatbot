class CallChannel < ApplicationCable::Channel
  def subscribed
    @room = Room.find_by(id: params[:room_id])
    return reject unless @room

    stream_for @room
  end

  def unsubscribed
    stop_all_streams
  end

  def signal(data)
    return unless @room

    payload = data.slice("type", "offer", "answer", "candidate", "to", "from", "name")
    payload["from"] ||= current_user_name
    payload["name"] ||= current_user_name

    CallChannel.broadcast_to(@room, payload)
  end
end
