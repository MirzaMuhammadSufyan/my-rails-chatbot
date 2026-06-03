module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user_name

    def connect
      self.current_user_name = cookies.encrypted[:user_name].presence || "Guest"
    end
  end
end
