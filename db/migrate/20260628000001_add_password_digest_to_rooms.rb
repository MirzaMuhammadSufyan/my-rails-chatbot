class AddPasswordDigestToRooms < ActiveRecord::Migration[8.0]
  def change
    add_column :rooms, :password_digest, :string
  end
end
