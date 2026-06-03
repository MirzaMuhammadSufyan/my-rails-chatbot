class Room < ApplicationRecord
  has_many :messages, -> { order(created_at: :asc) }, dependent: :destroy

  validates :name, presence: true

  def self.general
    find_or_create_by!(name: "General")
  end

  def general?
    name == "General"
  end
end
