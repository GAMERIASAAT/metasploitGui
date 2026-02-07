# frozen_string_literal: true

require 'faye/websocket'
Faye::WebSocket.load_adapter('puma')

require_relative 'standalone/app'

# Enable WebSocket support
use Rack::CommonLogger
use MsfGui::SocketMiddleware

run MsfGui::App
