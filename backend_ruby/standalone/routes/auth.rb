# frozen_string_literal: true

require 'sinatra/base'

module MsfGui
  module Routes
    class Auth < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      # OAuth2-compatible token endpoint
      post '/token' do
        content_type :json

        # Support both form-encoded and JSON
        if request.content_type&.include?('application/x-www-form-urlencoded')
          username = params['username']
          password = params['password']
        else
          body = parse_json_body
          username = body[:username]
          password = body[:password]
        end

        unless username && password
          halt 422, JSON.generate({
            error: true,
            message: 'Username and password are required'
          })
        end

        user = JwtAuth.authenticate(username, password)

        unless user
          halt 401, JSON.generate({
            error: true,
            message: 'Incorrect username or password'
          })
        end

        if user[:disabled] || user['disabled']
          halt 403, JSON.generate({
            error: true,
            message: 'User account is disabled'
          })
        end

        token = JwtAuth.create_access_token(username)

        JSON.generate({
          access_token: token,
          token_type: 'bearer',
          expires_in: Settings.access_token_expire_minutes * 60
        })
      end

      # Get current user info
      get '/me' do
        content_type :json

        user = env['msf_gui.current_user']
        unless user
          halt 401, JSON.generate({
            error: true,
            message: 'Not authenticated'
          })
        end

        JSON.generate({
          username: user[:username] || user['username'],
          disabled: user[:disabled] || user['disabled'] || false
        })
      end

      # Logout (optional - just for client cleanup)
      post '/logout' do
        content_type :json
        JSON.generate({ success: true, message: 'Logged out' })
      end
    end
  end
end
