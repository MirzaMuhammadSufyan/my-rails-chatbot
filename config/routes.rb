Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  resource :session, only: %i[new create]

  resources :rooms, only: %i[index show create] do
    resources :messages, only: :create
  end

  root "rooms#show", defaults: { id: "general" }
end
