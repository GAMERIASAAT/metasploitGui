# frozen_string_literal: true

require 'faye/websocket'
require 'json'
require 'concurrent'

module MsfGui
  # WebSocket handler for real-time updates (Socket.IO compatible)
  class SocketHandler
    PING_INTERVAL = 25 # seconds

    def initialize
      @clients = Concurrent::Map.new
      @console_readers = Concurrent::Map.new
      @session_subscriptions = Concurrent::Map.new
      @session_output_readers = Concurrent::Map.new
      @mutex = Mutex.new
      @logger = Logger.new($stdout)
      @logger.level = Logger::INFO

      start_session_monitor
    end

    def handle(env)
      return nil unless Faye::WebSocket.websocket?(env)

      ws = Faye::WebSocket.new(env, nil, ping: PING_INTERVAL)
      client_id = SecureRandom.uuid

      ws.on :open do |_event|
        @clients[client_id] = ws
        @logger.info("WebSocket client connected: #{client_id}")

        # Send Socket.IO-style connect acknowledgement
        send_event(ws, 'connect', { sid: client_id })
      end

      ws.on :message do |event|
        handle_message(client_id, ws, event.data)
      end

      ws.on :close do |_event|
        cleanup_client(client_id)
        @logger.info("WebSocket client disconnected: #{client_id}")
      end

      ws.rack_response
    end

    def broadcast(event, data)
      @clients.each_value do |ws|
        send_event(ws, event, data)
      end
    end

    private

    def handle_message(client_id, ws, data)
      message = parse_message(data)
      return unless message

      event = message[:event] || message['event']
      payload = message[:data] || message['data'] || {}

      case event
      when 'create_console'
        handle_create_console(client_id, ws)
      when 'console_input'
        handle_console_input(client_id, ws, payload)
      when 'destroy_console'
        handle_destroy_console(client_id, ws, payload)
      when 'subscribe_sessions'
        handle_subscribe_sessions(client_id, ws)
      when 'subscribe_session_output'
        handle_subscribe_session_output(client_id, ws, payload)
      when 'unsubscribe_session_output'
        handle_unsubscribe_session_output(client_id, payload)
      when 'session_input'
        handle_session_input(client_id, ws, payload)
      when 'ping'
        send_event(ws, 'pong', {})
      else
        @logger.warn("Unknown WebSocket event: #{event}")
      end
    rescue StandardError => e
      @logger.error("WebSocket message handling error: #{e.message}")
      send_event(ws, 'error', { message: e.message })
    end

    def parse_message(data)
      # Handle both raw JSON and Socket.IO format
      if data.start_with?('{')
        JSON.parse(data, symbolize_names: true)
      elsif data.include?('[')
        # Socket.IO format: 42["event", data]
        match = data.match(/\d+\["([^"]+)",?\s*(.*)\]$/m)
        if match
          event = match[1]
          payload = match[2].empty? ? {} : JSON.parse(match[2])
          { event: event, data: payload }
        end
      end
    rescue JSON::ParserError
      nil
    end

    def send_event(ws, event, data)
      # Send in Socket.IO-compatible format
      message = JSON.generate({ event: event, data: data })
      ws.send(message)
    rescue StandardError => e
      @logger.error("Failed to send WebSocket message: #{e.message}")
    end

    # ==================== Console Handlers ====================

    def handle_create_console(client_id, ws)
      result = MsfGui.msf_client.console_create
      console_id = result['id']

      send_event(ws, 'console_created', { id: console_id })

      # Start console reader thread
      start_console_reader(client_id, ws, console_id)
    rescue StandardError => e
      send_event(ws, 'error', { message: "Failed to create console: #{e.message}" })
    end

    def handle_console_input(client_id, ws, payload)
      console_id = payload[:console_id] || payload['console_id']
      command = payload[:command] || payload['command']

      MsfGui.msf_client.console_write(console_id, command)
    rescue StandardError => e
      send_event(ws, 'error', { message: "Console write failed: #{e.message}" })
    end

    def handle_destroy_console(client_id, ws, payload)
      console_id = payload[:console_id] || payload['console_id']

      # Stop console reader
      stop_console_reader(client_id, console_id)

      MsfGui.msf_client.console_destroy(console_id)
      send_event(ws, 'console_destroyed', { id: console_id })
    rescue StandardError => e
      send_event(ws, 'error', { message: "Failed to destroy console: #{e.message}" })
    end

    def start_console_reader(client_id, ws, console_id)
      key = "#{client_id}:#{console_id}"
      return if @console_readers[key]

      @console_readers[key] = Thread.new do
        loop do
          break unless @clients[client_id]

          result = MsfGui.msf_client.console_read(console_id)
          output = result['data']

          if output && !output.empty?
            send_event(ws, 'console_output', {
              console_id: console_id,
              data: output,
              prompt: result['prompt'],
              busy: result['busy']
            })
          end

          # Adaptive polling: faster when busy
          sleep(result['busy'] ? 0.05 : 0.15)
        rescue StandardError => e
          @logger.error("Console reader error: #{e.message}")
          break
        end
      end
    end

    def stop_console_reader(client_id, console_id)
      key = "#{client_id}:#{console_id}"
      thread = @console_readers.delete(key)
      thread&.kill
    end

    # ==================== Session Handlers ====================

    def handle_subscribe_sessions(client_id, ws)
      @session_subscriptions[client_id] = ws

      # Send current sessions
      sessions = MsfGui.msf_client.list_sessions
      send_event(ws, 'sessions_update', sessions)
    rescue StandardError => e
      send_event(ws, 'error', { message: "Failed to subscribe to sessions: #{e.message}" })
    end

    def handle_subscribe_session_output(client_id, ws, payload)
      session_id = payload[:session_id] || payload['session_id']
      key = "#{client_id}:#{session_id}"

      return if @session_output_readers[key]

      @session_output_readers[key] = Thread.new do
        loop do
          break unless @clients[client_id]

          session = MsfGui.msf_client.get_session(session_id)
          break unless session

          result = if session[:type] == 'meterpreter'
                     MsfGui.msf_client.session_meterpreter_read(session_id)
                   else
                     MsfGui.msf_client.session_shell_read(session_id)
                   end

          output = result['data']
          if output && !output.empty?
            send_event(ws, 'session_output', {
              session_id: session_id,
              data: output
            })
          end

          sleep 0.15
        rescue StandardError => e
          @logger.error("Session output reader error: #{e.message}")
          break
        end
      end
    end

    def handle_unsubscribe_session_output(client_id, payload)
      session_id = payload[:session_id] || payload['session_id']
      key = "#{client_id}:#{session_id}"

      thread = @session_output_readers.delete(key)
      thread&.kill
    end

    def handle_session_input(client_id, ws, payload)
      session_id = payload[:session_id] || payload['session_id']
      command = payload[:command] || payload['command']

      session = MsfGui.msf_client.get_session(session_id)
      return unless session

      if session[:type] == 'meterpreter'
        MsfGui.msf_client.session_meterpreter_write(session_id, command)
      else
        MsfGui.msf_client.session_shell_write(session_id, command)
      end
    rescue StandardError => e
      send_event(ws, 'error', { message: "Session write failed: #{e.message}" })
    end

    def start_session_monitor
      Thread.new do
        previous_sessions = {}

        loop do
          current_sessions = MsfGui.msf_client.list_sessions

          # Detect new sessions
          (current_sessions.keys - previous_sessions.keys).each do |session_id|
            broadcast('session_opened', {
              session_id: session_id,
              session: current_sessions[session_id]
            })
          end

          # Detect closed sessions
          (previous_sessions.keys - current_sessions.keys).each do |session_id|
            broadcast('session_closed', { session_id: session_id })
          end

          # Broadcast update to subscribed clients
          unless current_sessions == previous_sessions
            @session_subscriptions.each_value do |ws|
              send_event(ws, 'sessions_update', current_sessions)
            end
          end

          previous_sessions = current_sessions
          sleep 2
        rescue StandardError => e
          @logger.error("Session monitor error: #{e.message}")
          sleep 5
        end
      end
    end

    def cleanup_client(client_id)
      @clients.delete(client_id)
      @session_subscriptions.delete(client_id)

      # Stop all console readers for this client
      @console_readers.each_key do |key|
        if key.start_with?("#{client_id}:")
          thread = @console_readers.delete(key)
          thread&.kill
        end
      end

      # Stop all session output readers for this client
      @session_output_readers.each_key do |key|
        if key.start_with?("#{client_id}:")
          thread = @session_output_readers.delete(key)
          thread&.kill
        end
      end
    end
  end

  # Rack middleware for WebSocket handling
  class SocketMiddleware
    def initialize(app)
      @app = app
      @handler = SocketHandler.new
    end

    def call(env)
      if env['PATH_INFO'] == '/socket.io' || env['PATH_INFO'].start_with?('/socket.io/')
        response = @handler.handle(env)
        return response if response
      end

      @app.call(env)
    end

    def handler
      @handler
    end
  end
end
