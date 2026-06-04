class ApplicationController < ActionController::Base
  include MessagesHelper
  # Only allow modern browsers supporting webp images, web push, badges, import maps, CSS nesting, and CSS :has.
  allow_browser versions: :modern

  helper_method :current_user_name

  def current_user_name
    cookies.encrypted[:user_name]
  end

  def set_user_name_cookie(name)
    cookies.encrypted[:user_name] = {
      value: name,
      expires: 1.year.from_now,
      httponly: true,
      same_site: :lax
    }
  end
end
