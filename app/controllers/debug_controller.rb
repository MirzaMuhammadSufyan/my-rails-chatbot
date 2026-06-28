class DebugController < ActionController::Base
  def cable_status
    # Check Solid Cable message queue via direct SQL query
    cable_message_count = begin
      ActiveRecord::Base.connection.execute(
        "SELECT COUNT(*) FROM solid_cable_messages"
      ).first.values.first
    rescue => e
      "Error: #{e.message}"
    end

    recent_messages = begin
      ActiveRecord::Base.connection.execute(
        "SELECT id, channel, created_at FROM solid_cable_messages ORDER BY created_at DESC LIMIT 20"
      ).to_a
    rescue => e
      ["Error: #{e.message}"]
    end

    render json: {
      timestamp: Time.current,
      cable_messages_count: cable_message_count,
      recent_messages: recent_messages,
      solid_cable_enabled: Rails.configuration.action_cable.adapter == :solid_cable,
      environment: Rails.env
    }
  end
end

