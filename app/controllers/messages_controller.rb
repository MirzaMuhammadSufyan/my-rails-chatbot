class MessagesController < ApplicationController
  before_action :require_user_name
  before_action :set_room

  def create
    @message = @room.messages.build(message_params)
    @message.user_name = cookies.encrypted[:user_name]
    @message.content_type = detect_content_type(@message)

    if @message.save
      head :created
    else
      render json: { errors: @message.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_room
    @room = Room.find(params[:room_id])
  end

  def message_params
    params.require(:message).permit(:body, :media)
  end

  def detect_content_type(message)
    return "text" unless message.media.attached?

    blob = message.media.blob
    case blob.content_type
    when /\Aimage\//
      "image"
    when /\Avideo\//
      "video"
    when /\Aaudio\//
      "audio"
    else
      if blob.filename.extension.downcase.in?(%w[webm ogg mp3 wav m4a])
        "audio"
      else
        "text"
      end
    end
  end

  def require_user_name
    return if cookies.encrypted[:user_name].present?

    redirect_to new_session_path
  end
end
