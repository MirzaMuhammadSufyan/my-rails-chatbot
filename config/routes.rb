Rails.application.routes.draw do
  mount ActionCable.server => "/cable"

  get "up" => "rails/health#show", as: :rails_health_check

  resource :session, only: %i[new create update]

  resources :rooms, only: %i[index show create destroy] do
    post :verify_password, on: :member
    post :clear_messages, on: :member
    resources :messages, only: %i[create destroy] do
      get :recent, on: :collection
      get :sync, on: :collection
      delete :bulk_destroy, on: :collection
    end
  end

  root "rooms#show", defaults: { id: "general" }

  # WebRTC call signal endpoint (optional REST fallback — primary is ActionCable)
  namespace :api do
    resources :calls, only: [] do
      post :signal, on: :collection
    end
  end

  # Debug endpoint to inspect Solid Cable queue (remove in production)
  get "/debug/cable-status", to: "debug#cable_status"
end
