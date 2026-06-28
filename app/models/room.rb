class Room < ApplicationRecord
  has_secure_password validations: false
  has_many :messages, -> { order(created_at: :asc) }, dependent: :destroy

  validates :name, presence: true
  validates :password, presence: true, on: :create, unless: :general?

  def self.general
    find_or_create_by!(name: "General")
  end

  def general?
    name == "General"
  end

  def password_protected?
    password_digest.present?
  end
end
