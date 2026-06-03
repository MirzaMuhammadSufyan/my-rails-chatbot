Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  resource :session, only: %i[new create]

  resources :rooms, only: %i[index show create destroy] do
    resources :messages, only: %i[create destroy]
  end

  root "rooms#show", defaults: { id: "general" }
end
