class MessagesController < ApplicationController
  before_action :require_user_name
  before_action :set_room

  def destroy
    @message = @room.messages.find(params[:id])

    unless @message.user_name == cookies.encrypted[:user_name]
      head :forbidden
      return
    end

    @message.destroy!
    head :no_content
  end

  def recent
    after_id = params[:after].to_i
    messages = @room.messages
      .includes(media_attachment: :blob)
      .where("id > ?", after_id)
      .order(:id)

    render json: {
      messages: messages.map { |message| { id: message.id, html: message_html_fragment(message) } }
    }
  end

  def create
    @message = @room.messages.build(message_params)
    @message.user_name = cookies.encrypted[:user_name]
    @message.content_type = detect_content_type(@message)

    unless @message.save
      render json: { errors: @message.errors.full_messages }, status: :unprocessable_entity
      return
    end

    html = message_html_fragment(@message)
    render json: { html: html, id: @message.id }, status: :created
  rescue StandardError => e
    Rails.logger.error("[MessagesController#create] #{e.class}: #{e.message}")
    e.backtrace&.first(8)&.each { |line| Rails.logger.error(line) }

    if @message&.persisted?
      render json: { html: "", id: @message.id }, status: :created
    else
      render json: { errors: [ "Could not send message. Please try again." ] }, status: :internal_server_error
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
    content_type = blob.content_type.to_s
    filename = blob.filename.to_s.downcase
    extension = blob.filename.extension.to_s.downcase

    return "audio" if audio_media?(content_type, filename, extension)
    return "image" if content_type.start_with?("image/") || extension.in?(%w[jpg jpeg png gif webp svg bmp])
    return "video" if content_type.start_with?("video/") || extension.in?(%w[mp4 mov avi mkv m4v webm])

    "file"
  end

  def audio_media?(content_type, filename, extension)
    return true if filename.start_with?("voice-")
    return true if content_type.start_with?("audio/")
    return true if extension.in?(%w[ogg mp3 wav m4a aac flac opus])
    return true if extension == "webm" && filename.start_with?("voice-")
    return true if content_type.in?(%w[video/webm application/octet-stream]) && filename.start_with?("voice-")

    false
  end

  def message_html_fragment(message)
    render_to_string(
      partial: "messages/message",
      locals: { message: message, current_user_name: cookies.encrypted[:user_name] },
      formats: [ :html ]
    )
  end

  def require_user_name
    return if cookies.encrypted[:user_name].present?

    redirect_to new_session_path
  end
end
