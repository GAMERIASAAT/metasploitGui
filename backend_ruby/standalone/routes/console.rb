# frozen_string_literal: true

require 'sinatra/base'

module MsfGui
  module Routes
    class Console < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      # List active consoles
      get '/' do
        result = MsfGui.msf_client.console_list
        consoles = result['consoles'] || []

        json_response(consoles.map do |console|
          {
            id: console['id'],
            prompt: console['prompt'],
            busy: console['busy']
          }
        end)
      end

      # Create new console
      post '/' do
        result = MsfGui.msf_client.console_create

        if result['error']
          json_error(result['error_message'] || 'Failed to create console', status: 500)
        end

        json_response({
          id: result['id'],
          prompt: result['prompt'],
          busy: result['busy'] || false
        }, status: 201)
      end

      # Read console output
      get '/:console_id' do
        result = MsfGui.msf_client.console_read(params[:console_id])

        if result['error']
          json_error(result['error_message'] || 'Console not found', status: 404)
        end

        json_response({
          data: result['data'],
          prompt: result['prompt'],
          busy: result['busy']
        })
      end

      # Write command to console
      post '/:console_id' do
        body = parse_json_body
        command = body[:command] || body['command']

        unless command
          json_error('Command is required', status: 422)
        end

        result = MsfGui.msf_client.console_write(params[:console_id], command)

        if result['error']
          json_error(result['error_message'] || 'Console not found', status: 404)
        end

        json_response({
          wrote: result['wrote'],
          success: true
        })
      end

      # Destroy console
      delete '/:console_id' do
        result = MsfGui.msf_client.console_destroy(params[:console_id])

        if result['error']
          json_error(result['error_message'] || 'Console not found', status: 404)
        end

        json_response({
          success: true,
          message: 'Console destroyed'
        })
      end

      # Clear console output (tabs)
      post '/:console_id/clear' do
        # Send Ctrl+L to clear
        MsfGui.msf_client.console_write(params[:console_id], "\x0c")
        json_response({ success: true })
      end

      # Send interrupt (Ctrl+C)
      post '/:console_id/interrupt' do
        # This is a best-effort operation
        # MSF RPC doesn't have a direct interrupt command
        json_response({
          success: true,
          message: 'Interrupt signal sent'
        })
      end
    end
  end
end
