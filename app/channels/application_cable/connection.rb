module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_user_name

    def connect
      self.current_user_name = cookies.encrypted[:user_name].presence || "Guest"
      Rails.logger.info("[ActionCable] connect: user=#{current_user_name.inspect} origin=#{request&.headers&.[]('Origin')} ip=#{request&.remote_ip}")
    end

    def disconnect
      Rails.logger.info("[ActionCable] disconnect: user=#{current_user_name.inspect}")
    end
  end
end
