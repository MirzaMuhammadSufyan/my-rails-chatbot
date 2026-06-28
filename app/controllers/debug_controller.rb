class DebugController < ApplicationController
  skip_before_action :require_user_name, if: -> { action_name == "cable_status" }

  def cable_status
    # Check Solid Cable message queue status
    cable_messages = SolidCable::Message.order(created_at: :desc).limit(50)
    
    render json: {
      timestamp: Time.current,
      cable_messages_count: SolidCable::Message.count,
      recent_messages: cable_messages.map { |m| 
        {
          id: m.id,
          channel: m.channel,
          created_at: m.created_at,
          body_snippet: m.messages.first(100) rescue "N/A"
        }
      },
      solid_cable_enabled: Rails.configuration.action_cable.adapter == :solid_cable,
      environment: Rails.env
    }
  end
end
