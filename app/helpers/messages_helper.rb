module MessagesHelper
  def message_media_url(attachment)
    rails_blob_path(attachment, only_path: true)
  end
end
