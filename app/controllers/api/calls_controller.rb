module Api
  class CallsController < ApplicationController
    skip_before_action :verify_authenticity_token, raise: false

    def signal
      @room = Room.find(params[:room_id])
      payload = {
        "call_signal" => true,
        "type"        => params[:type].to_s,
        "from"        => cookies.encrypted[:user_name] || "Guest"
      }

      %w[offer answer candidate audioOnly].each do |key|
        payload[key] = params[key] if params.key?(key)
      end

      ChatChannel.broadcast_to(@room, payload)
      Rails.logger.info("[Api::CallsController#signal] broadcast to room=#{@room.id} type=#{payload['type']} from=#{payload['from']}")
      render json: { ok: true }
    rescue ActiveRecord::RecordNotFound
      render json: { error: "Room not found" }, status: :not_found
    rescue StandardError => e
      Rails.logger.error("[Api::CallsController#signal] #{e.class}: #{e.message}")
      render json: { error: e.message }, status: :internal_server_error
    end
  end
end
