# frozen_string_literal: true

require 'sinatra/base'

module MsfGui
  module Routes
    class Sessions < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      # List all sessions
      get '/' do
        sessions = MsfGui.msf_client.list_sessions

        # Add session IDs to each session object
        result = sessions.map do |id, session|
          session.merge(id: id.to_s)
        end

        json_response(result)
      end

      # Get specific session
      get '/:session_id' do
        session = MsfGui.msf_client.get_session(params[:session_id])

        unless session
          json_error('Session not found', status: 404)
        end

        json_response(session.merge(id: params[:session_id]))
      end

      # Shell - write command
      post '/:session_id/shell/write' do
        body = parse_json_body
        command = body[:command] || body['command']

        unless command
          json_error('Command is required', status: 422)
        end

        result = MsfGui.msf_client.session_shell_write(params[:session_id], command)
        json_response({ success: true, write_count: result['write_count'] })
      end

      # Shell - read output
      get '/:session_id/shell/read' do
        result = MsfGui.msf_client.session_shell_read(params[:session_id])
        json_response({
          data: result['data'],
          seq: result['seq']
        })
      end

      # Meterpreter - write command
      post '/:session_id/meterpreter/write' do
        body = parse_json_body
        command = body[:command] || body['command']

        unless command
          json_error('Command is required', status: 422)
        end

        result = MsfGui.msf_client.session_meterpreter_write(params[:session_id], command)
        json_response({ success: true, result: result })
      end

      # Meterpreter - read output
      get '/:session_id/meterpreter/read' do
        result = MsfGui.msf_client.session_meterpreter_read(params[:session_id])
        json_response({
          data: result['data']
        })
      end

      # Meterpreter - run command and get output
      post '/:session_id/meterpreter/run' do
        body = parse_json_body
        command = body[:command] || body['command']

        unless command
          json_error('Command is required', status: 422)
        end

        result = MsfGui.msf_client.session_meterpreter_run_single(params[:session_id], command)
        json_response({
          data: result['data'] || result
        })
      end

      # Kill session
      delete '/:session_id' do
        result = MsfGui.msf_client.kill_session(params[:session_id])
        json_response({
          success: true,
          message: 'Session terminated',
          result: result
        })
      end

      # Upgrade shell to meterpreter
      post '/:session_id/upgrade' do
        body = parse_json_body
        lhost = body[:lhost] || body['lhost']
        lport = body[:lport] || body['lport'] || 4433

        unless lhost
          json_error('LHOST is required', status: 422)
        end

        # Use post/multi/manage/shell_to_meterpreter
        result = MsfGui.msf_client.run_module('post', 'multi/manage/shell_to_meterpreter', {
          'SESSION' => params[:session_id],
          'LHOST' => lhost,
          'LPORT' => lport.to_s
        })

        json_response({
          success: true,
          message: 'Upgrade initiated',
          job_id: result['job_id']
        })
      end

      # Run post module on session
      post '/:session_id/run' do
        body = parse_json_body
        module_name = body[:module] || body['module']
        options = body[:options] || body['options'] || {}

        unless module_name
          json_error('Module name is required', status: 422)
        end

        options['SESSION'] = params[:session_id]
        result = MsfGui.msf_client.run_module('post', module_name, options)

        json_response({
          success: true,
          job_id: result['job_id'],
          uuid: result['uuid']
        })
      end
    end
  end
end
