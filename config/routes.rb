Rails.application.routes.draw do
  mount ActionCable.server => "/cable"

  get "up" => "rails/health#show", as: :rails_health_check

  resource :session, only: %i[new create]

  resources :rooms, only: %i[index show create destroy] do
    resources :messages, only: %i[create destroy] do
      get :recent, on: :collection
    end
  end

  root "rooms#show", defaults: { id: "general" }
end
