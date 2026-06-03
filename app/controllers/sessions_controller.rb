class SessionsController < ApplicationController
  def new
  end

  def create
    name = params[:user_name].to_s.strip
    if name.blank?
      flash.now[:alert] = "Enter a display name."
      render :new, status: :unprocessable_entity
      return
    end

    cookies.encrypted[:user_name] = {
      value: name,
      expires: 1.year.from_now,
      httponly: true
    }

    redirect_to root_path
  end
end
