class SessionsController < ApplicationController
  before_action :require_signed_in, only: :update

  def new
  end

  def create
    name = params[:user_name].to_s.strip
    if name.blank?
      flash.now[:alert] = "Enter a display name."
      render :new, status: :unprocessable_entity
      return
    end

    set_user_name_cookie(name)
    redirect_to root_path
  end

  def update
    name = params[:user_name].to_s.strip
    if name.blank?
      redirect_to rooms_path, alert: "Display name cannot be empty."
      return
    end

    set_user_name_cookie(name)
    redirect_to rooms_path, notice: "Display name updated."
  end

  private

  def require_signed_in
    return if cookies.encrypted[:user_name].present?

    redirect_to new_session_path
  end
end
