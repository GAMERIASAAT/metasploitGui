# frozen_string_literal: true

require 'jwt'
require 'bcrypt'
require 'securerandom'

module MsfGui
  class JwtAuth
    class << self
      # Default users (in-memory, like Python backend)
      def default_users
        @default_users ||= {
          'admin' => {
            username: 'admin',
            hashed_password: BCrypt::Password.create('admin'),
            disabled: false
          }
        }
      end

      def users
        # Load from storage or use defaults
        stored = Stores.users.load({})
        return default_users if stored.empty?

        stored
      end

      def authenticate(username, password)
        user = users[username] || users[username.to_sym]
        return nil unless user

        stored_password = user[:hashed_password] || user['hashed_password']
        return nil unless BCrypt::Password.new(stored_password) == password

        user
      rescue BCrypt::Errors::InvalidHash
        nil
      end

      def create_access_token(username, expires_in: nil)
        expires_in ||= Settings.access_token_expire_minutes * 60
        payload = {
          sub: username,
          exp: Time.now.to_i + expires_in,
          iat: Time.now.to_i,
          jti: SecureRandom.uuid
        }

        JWT.encode(payload, Settings.secret_key, Settings.algorithm)
      end

      def decode_token(token)
        decoded = JWT.decode(token, Settings.secret_key, true, algorithm: Settings.algorithm)
        decoded[0]
      rescue JWT::ExpiredSignature
        { error: 'Token has expired' }
      rescue JWT::DecodeError => e
        { error: "Invalid token: #{e.message}" }
      end

      def verify_token(token)
        payload = decode_token(token)
        return nil if payload[:error] || payload['error']

        username = payload['sub']
        user = users[username] || users[username.to_sym]
        return nil unless user
        return nil if user[:disabled] || user['disabled']

        user
      end

      def extract_token(request)
        auth_header = request.env['HTTP_AUTHORIZATION']
        return nil unless auth_header

        scheme, token = auth_header.split(' ', 2)
        return nil unless scheme&.downcase == 'bearer'

        token
      end
    end
  end

  # Sinatra middleware for JWT authentication
  class JwtMiddleware
    EXCLUDED_PATHS = [
      '/api/v1/auth/token',
      '/api/v1/modules/stats',
      '/health',
      '/',
      '/dl'
    ].freeze

    EXCLUDED_PREFIXES = [
      '/dl/',
      '/api/v1/phishing/track/',
      '/api/v1/phishing/capture/',
      '/api/v1/payloads/download/'
    ].freeze

    def initialize(app)
      @app = app
    end

    def call(env)
      request = Rack::Request.new(env)
      path = request.path

      # Skip auth for excluded paths
      if excluded_path?(path)
        return @app.call(env)
      end

      # Skip auth for OPTIONS requests (CORS preflight)
      if request.request_method == 'OPTIONS'
        return @app.call(env)
      end

      token = extract_token(env)
      unless token
        return unauthorized_response('Missing authentication token')
      end

      user = JwtAuth.verify_token(token)
      unless user
        return unauthorized_response('Invalid or expired token')
      end

      # Add user to environment for routes to access
      env['msf_gui.current_user'] = user
      @app.call(env)
    end

    private

    def excluded_path?(path)
      return true if EXCLUDED_PATHS.include?(path)

      EXCLUDED_PREFIXES.any? { |prefix| path.start_with?(prefix) }
    end

    def extract_token(env)
      auth_header = env['HTTP_AUTHORIZATION']
      return nil unless auth_header

      scheme, token = auth_header.split(' ', 2)
      return nil unless scheme&.downcase == 'bearer'

      token
    end

    def unauthorized_response(message)
      [
        401,
        { 'Content-Type' => 'application/json' },
        [JSON.generate({ error: true, message: message })]
      ]
    end
  end
end
