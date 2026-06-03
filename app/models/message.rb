class Message < ApplicationRecord
  CONTENT_TYPES = %w[text image video audio].freeze

  belongs_to :room

  has_one_attached :media

  validates :user_name, presence: true
  validates :content_type, inclusion: { in: CONTENT_TYPES }
  validate :body_or_media_present

  after_create_commit -> { broadcast_append }

  def display_body
    body.to_s
  end

  private

  def body_or_media_present
    return if media.attached?
    return if body.present?

    errors.add(:base, "Message must have text or a media attachment")
  end

  def broadcast_append
    ChatChannel.broadcast_to(
      room,
      html: ApplicationController.render(
        partial: "messages/message",
        locals: { message: self }
      )
    )
  end
end
