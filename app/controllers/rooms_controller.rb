class RoomsController < ApplicationController
  before_action :require_user_name
  before_action :set_room, only: :show
  before_action :set_room_for_destroy, only: :destroy

  def index
    @rooms = Room.order(:name)
  end

  def show
    @messages = @room.messages.includes(media_attachment: :blob)
  end

  def create
    @room = Room.new(room_params)
    if @room.save
      redirect_to @room
    else
      @rooms = Room.order(:name)
      render :index, status: :unprocessable_entity
    end
  end

  def destroy
    if @room.general?
      redirect_to rooms_path, alert: "The General room cannot be deleted."
      return
    end

    @room.destroy!
    redirect_to rooms_path, notice: "Room deleted."
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

  def room_params
    params.require(:room).permit(:name)
  end

  def require_user_name
    return if cookies.encrypted[:user_name].present?

    redirect_to new_session_path
  end
end
