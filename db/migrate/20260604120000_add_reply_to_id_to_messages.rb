class AddReplyToIdToMessages < ActiveRecord::Migration[8.0]
  def change
    add_reference :messages, :reply_to, foreign_key: { to_table: :messages }, index: true
  end
end
