class ChatChannel < ApplicationCable::Channel
  def subscribed
    room = Room.find(params[:room_id])
    stream_for room
  end

  def unsubscribed
    stop_all_streams
  end
end
