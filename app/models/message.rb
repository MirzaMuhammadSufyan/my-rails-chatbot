class Message < ApplicationRecord
  CONTENT_TYPES = %w[text image video audio file].freeze

  belongs_to :room
  belongs_to :reply_to, class_name: "Message", optional: true
  has_many :replies, class_name: "Message", foreign_key: :reply_to_id, dependent: :nullify

  has_one_attached :media, dependent: :purge_later

  validates :user_name, presence: true
  validates :content_type, inclusion: { in: CONTENT_TYPES }
  validate :body_or_media_present
  validate :media_not_empty, if: -> { media.attached? }
  validate :reply_to_in_same_room

  before_destroy :broadcast_deletion

  after_create_commit :broadcast_append_later

  def display_body
    body.to_s
  end

  def media_proxy_path
    return unless media.attached?

    Rails.application.routes.url_helpers.rails_storage_proxy_path(media, only_path: true)
  end

  def reply_preview
    snippet_for(message: reply_to)
  end

  def snippet
    snippet_for(message: self)
  end

  def broadcast_html
    ApplicationController.render(
      partial: "messages/message",
      locals: { message: self, current_user_name: nil },
      formats: [ :html ]
    )
  end

  private

  def snippet_for(message:)
    return "" unless message

    if message.media.attached?
      case message.content_type
      when "image" then "📷 Photo"
      when "video" then "🎬 Video"
      when "audio" then "🎤 Voice message"
      else "📎 #{message.media.filename}"
      end
    elsif message.body.present?
      message.body.truncate(80)
    else
      "Message"
    end
  end

  def reply_to_in_same_room
    return if reply_to_id.blank?
    return if reply_to&.room_id == room_id

    errors.add(:reply_to_id, "must be in the same room")
  end

  def body_or_media_present
    return if media.attached?
    return if body.present?

    errors.add(:base, "Message must have text or a media attachment")
  end

  def media_not_empty
    return unless media.blob&.byte_size.to_i < 1

    errors.add(:media, "file is empty — record again for at least 1 second")
  end

  def broadcast_deletion
    ChatChannel.broadcast_to(room, delete_message_id: id)
  rescue StandardError => e
    Rails.logger.error("[Message#broadcast_deletion] #{e.class}: #{e.message}")
  end

  def broadcast_append_later
    broadcast_append
  rescue StandardError => e
    Rails.logger.error("[Message#broadcast_append] #{e.class}: #{e.message}")
  end

  def broadcast_append
    ChatChannel.broadcast_to(room, html: broadcast_html, chat_message: { sender: user_name.to_s, text: body.to_s, own: false })
  end
end
