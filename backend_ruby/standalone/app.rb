# frozen_string_literal: true

require 'sinatra/base'
require 'sinatra/json'
require 'rack/cors'
require 'json'
require 'logger'

# Load configuration first
require_relative 'config/settings'

# Load shared helpers
require_relative '../shared/helpers/response'
require_relative '../shared/helpers/validators'

# Load models
require_relative 'models/storage'

# Load libraries
require_relative 'lib/jwt_auth'
require_relative 'lib/msf_client'
require_relative 'lib/socket_handler'

# Load routes
require_relative 'routes/auth'
require_relative 'routes/sessions'
require_relative 'routes/modules'
require_relative 'routes/console'
require_relative 'routes/payloads'
require_relative 'routes/listeners'
require_relative 'routes/postex'
require_relative 'routes/targets'
require_relative 'routes/nmap'
require_relative 'routes/automation'
require_relative 'routes/reports'
require_relative 'routes/phishing'

module MsfGui
  class App < Sinatra::Base
    # Configuration
    configure do
      set :server, :puma
      set :port, Settings.server_port
      set :bind, Settings.server_host
      set :show_exceptions, false
      set :raise_errors, false
      set :logging, true
      set :static, false

      enable :logging
    end

    # CORS configuration
    use Rack::Cors do
      allow do
        origins(*Settings.cors_origins)
        resource '*',
                 headers: :any,
                 methods: %i[get post put patch delete options],
                 credentials: true,
                 max_age: 86_400
      end
    end

    # JWT Authentication middleware
    use JwtMiddleware

    # Logger
    before do
      env['rack.logger'] = Logger.new($stdout)
    end

    # JSON content type for all API responses
    before '/api/*' do
      content_type :json
    end

    # Handle CORS preflight
    options '*' do
      response.headers['Access-Control-Allow-Origin'] = request.env['HTTP_ORIGIN'] || '*'
      response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
      response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
      response.headers['Access-Control-Max-Age'] = '86400'
      200
    end

    # ==================== Mount Routes ====================

    # API v1 routes
    use Rack::URLMap, {
      '/api/v1/auth' => Routes::Auth,
      '/api/v1/sessions' => Routes::Sessions,
      '/api/v1/modules' => Routes::Modules,
      '/api/v1/console' => Routes::Console,
      '/api/v1/payloads' => Routes::Payloads,
      '/api/v1/listeners' => Routes::Listeners,
      '/api/v1/postex' => Routes::Postex,
      '/api/v1/targets' => Routes::Targets,
      '/api/v1/nmap' => Routes::Nmap,
      '/api/v1/automation' => Routes::Automation,
      '/api/v1/reports' => Routes::Reports,
      '/api/v1/phishing' => Routes::Phishing
    }

    # ==================== Root & Health Endpoints ====================

    get '/' do
      content_type :json

      msf_connected = begin
        MsfGui.msf_client.connected? || MsfGui.msf_client.connect
        true
      rescue StandardError
        false
      end

      version = begin
        MsfGui.msf_client.get_version
      rescue StandardError
        { 'version' => 'unknown' }
      end

      JSON.generate({
        name: Settings.app_name,
        version: '1.0.0',
        backend: 'ruby',
        framework: 'sinatra',
        msf_connected: msf_connected,
        msf_version: version['version']
      })
    end

    get '/health' do
      content_type :json

      msf_status = begin
        MsfGui.msf_client.connect
        stats = MsfGui.msf_client.get_stats
        { connected: true, stats: stats }
      rescue StandardError => e
        { connected: false, error: e.message }
      end

      JSON.generate({
        status: 'ok',
        timestamp: Time.now.iso8601,
        msf: msf_status
      })
    end

    # ==================== Payload Download Endpoint ====================

    get '/dl/*' do
      path = params[:splat]&.first

      payloads = Stores.hosted_payloads.load({})

      # Find payload by path or ID
      payload = payloads.values.find do |p|
        (p[:path] || p['path']) == path ||
          (p[:id] || p['id']) == path
      end

      unless payload
        halt 404, 'Payload not found'
      end

      # Check expiry
      expires_at = payload[:expires_at] || payload['expires_at']
      if expires_at && Time.parse(expires_at) < Time.now
        halt 410, 'Payload has expired'
      end

      # Increment download counter
      payload_id = payload[:id] || payload['id']
      Stores.hosted_payloads.update do |p|
        if p[payload_id]
          p[payload_id][:downloads] = (p[payload_id][:downloads] || 0) + 1
        elsif p[payload_id.to_sym]
          p[payload_id.to_sym][:downloads] = (p[payload_id.to_sym][:downloads] || 0) + 1
        end
        p
      end

      # Serve file
      filename = payload[:filename] || payload['filename']
      filepath = File.join(Settings.hosted_payloads_path, filename)

      unless File.exist?(filepath)
        halt 404, 'File not found'
      end

      send_file filepath,
                filename: filename,
                type: 'application/octet-stream',
                disposition: 'attachment'
    end

    # ==================== Error Handlers ====================

    error do
      content_type :json
      status 500

      error = env['sinatra.error']
      JSON.generate({
        error: true,
        message: error&.message || 'Internal server error',
        type: error&.class&.name
      })
    end

    not_found do
      content_type :json
      JSON.generate({
        error: true,
        message: 'Not found',
        path: request.path
      })
    end

    error 401 do
      content_type :json
      JSON.generate({
        error: true,
        message: 'Unauthorized'
      })
    end

    error 403 do
      content_type :json
      JSON.generate({
        error: true,
        message: 'Forbidden'
      })
    end

    error 422 do
      content_type :json
      JSON.generate({
        error: true,
        message: 'Unprocessable entity'
      })
    end
  end
end

# Run the app if executed directly
if __FILE__ == $PROGRAM_NAME
  MsfGui::App.run!
end
