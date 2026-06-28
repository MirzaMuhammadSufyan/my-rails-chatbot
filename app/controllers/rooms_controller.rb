class RoomsController < ApplicationController
  before_action :require_user_name
  before_action :set_room, only: %i[show verify_password clear_messages]
  before_action :set_room_for_destroy, only: :destroy
  before_action :check_room_password, only: :show

  def index
    @rooms = Room.order(:name)
  end

  def show
    @messages = @room.messages.includes(:reply_to, media_attachment: :blob)
  end

  def create
    @room = Room.new(room_params)
    if @room.save
      session[:verified_rooms] = (session[:verified_rooms] || []) | [ @room.id ] unless @room.general?
      redirect_to @room
    else
      @rooms = Room.order(:name)
      render :index, status: :unprocessable_entity
    end
  end

  def verify_password
    if @room.authenticate(params[:room_password])
      session[:verified_rooms] = (session[:verified_rooms] || []) | [ @room.id ]
      redirect_to @room
    else
      flash.now[:alert] = "Incorrect password. Try again."
      render :password, status: :unprocessable_entity
    end
  end

  def clear_messages
    return head :forbidden unless admin?

    @room.messages.includes(media_attachment: :blob).find_each do |msg|
      msg.media.purge_later if msg.media.attached?
    rescue StandardError => e
      Rails.logger.error("[clear_messages] media purge: #{e.message}")
    end
    @room.messages.delete_all
    ActionCable.server.broadcast(
      ChatChannel.broadcasting_for(@room),
      { clear_all: true }
    )
    redirect_to @room, notice: "Chat history cleared."
  end

  def destroy
    if @room.general?
      redirect_to rooms_path, alert: "The General room cannot be deleted."
      return
    end

    @room.messages.includes(media_attachment: :blob).find_each do |msg|
      msg.media.purge_later if msg.media.attached?
    rescue StandardError => e
      Rails.logger.error("[destroy] media purge: #{e.message}")
    end
    @room.messages.delete_all
    @room.destroy!
    redirect_to rooms_path, notice: "Room deleted."
  rescue StandardError => e
    Rails.logger.error("[RoomsController#destroy] #{e.class}: #{e.message}")
    redirect_to rooms_path, alert: "Could not delete room. Please try again."
  end

  private

  def set_room
    @room = if params[:id] == "general"
              Room.general
            else
              Room.find(params[:id])
            end
  end

  def set_room_for_destroy
    @room = Room.find(params[:id])
  end

  def check_room_password
    return unless @room.password_protected?
    return if @room.general?

    verified = session[:verified_rooms] || []
    return if verified.include?(@room.id)

    render :password
  end

  def room_params
    params.require(:room).permit(:name, :password)
  end

  def require_user_name
    return if cookies.encrypted[:user_name].present?

    redirect_to new_session_path
  end

  def admin?
    cookies.encrypted[:user_name].to_s.strip.downcase == "admin"
  end
end
