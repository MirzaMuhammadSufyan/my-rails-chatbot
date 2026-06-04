class Message < ApplicationRecord
  CONTENT_TYPES = %w[text image video audio file].freeze 

  belongs_to :room

  has_one_attached :media 

  validates :user_name, presence: true
  validates :content_type, inclusion: { in: CONTENT_TYPES }
  validate :body_or_media_present
  validate :media_not_empty, if: -> { media.attached? }

  after_create_commit :broadcast_append_later
  after_destroy_commit :broadcast_delete_later

  def display_body
    body.to_s
  end

  def media_proxy_path
    return unless media.attached?

    Rails.application.routes.url_helpers.rails_storage_proxy_path(media, only_path: true)
  end

  def broadcast_html
    ApplicationController.render(
      partial: "messages/message",
      locals: { message: self, current_user_name: nil },
      formats: [ :html ]
    )
  end

  private

  def body_or_media_present
    return if media.attached?
    return if body.present?

    errors.add(:base, "Message must have text or a media attachment")
  end

  def media_not_empty
    return unless media.blob&.byte_size.to_i < 1

    errors.add(:media, "file is empty — record again for at least 1 second")
  end

  def broadcast_append_later
    broadcast_append
  rescue StandardError => e
    Rails.logger.error("[Message#broadcast_append] #{e.class}: #{e.message}")
  end

  def broadcast_append
    ChatChannel.broadcast_to(room, html: broadcast_html)
  end

  def broadcast_delete_later
    broadcast_delete
  rescue StandardError => e
    Rails.logger.error("[Message#broadcast_delete] #{e.class}: #{e.message}")
  end

  def broadcast_delete
    ChatChannel.broadcast_to(room, delete_message_id: id)
  end
end
