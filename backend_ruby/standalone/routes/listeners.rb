# frozen_string_literal: true

require 'sinatra/base'

module MsfGui
  module Routes
    class Listeners < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      COMMON_PAYLOADS = [
        {
          name: 'Windows Meterpreter Reverse TCP',
          payload: 'windows/meterpreter/reverse_tcp',
          platform: 'windows'
        },
        {
          name: 'Windows Meterpreter Reverse HTTPS',
          payload: 'windows/meterpreter/reverse_https',
          platform: 'windows'
        },
        {
          name: 'Windows x64 Meterpreter Reverse TCP',
          payload: 'windows/x64/meterpreter/reverse_tcp',
          platform: 'windows'
        },
        {
          name: 'Windows x64 Meterpreter Reverse HTTPS',
          payload: 'windows/x64/meterpreter/reverse_https',
          platform: 'windows'
        },
        {
          name: 'Linux Meterpreter Reverse TCP',
          payload: 'linux/x64/meterpreter/reverse_tcp',
          platform: 'linux'
        },
        {
          name: 'Linux Meterpreter Reverse HTTPS',
          payload: 'linux/x64/meterpreter/reverse_https',
          platform: 'linux'
        },
        {
          name: 'Android Meterpreter Reverse TCP',
          payload: 'android/meterpreter/reverse_tcp',
          platform: 'android'
        },
        {
          name: 'Android Meterpreter Reverse HTTPS',
          payload: 'android/meterpreter/reverse_https',
          platform: 'android'
        },
        {
          name: 'macOS Meterpreter Reverse TCP',
          payload: 'osx/x64/meterpreter/reverse_tcp',
          platform: 'macos'
        },
        {
          name: 'PHP Meterpreter Reverse TCP',
          payload: 'php/meterpreter/reverse_tcp',
          platform: 'php'
        },
        {
          name: 'Python Meterpreter Reverse TCP',
          payload: 'python/meterpreter/reverse_tcp',
          platform: 'python'
        },
        {
          name: 'Java Meterpreter Reverse TCP',
          payload: 'java/meterpreter/reverse_tcp',
          platform: 'java'
        },
        {
          name: 'Generic Shell Reverse TCP',
          payload: 'generic/shell_reverse_tcp',
          platform: 'multi'
        }
      ].freeze

      # List running handlers/jobs
      get '/jobs' do
        jobs = MsfGui.msf_client.list_jobs

        result = jobs.map do |id, name|
          info = MsfGui.msf_client.get_job_info(id)
          {
            id: id,
            name: name,
            start_time: info['start_time'],
            datastore: info['datastore']
          }
        end

        json_response(result)
      end

      # Get job details
      get '/jobs/:job_id' do
        info = MsfGui.msf_client.get_job_info(params[:job_id])

        if info.nil? || info.empty?
          json_error('Job not found', status: 404)
        end

        json_response({
          id: params[:job_id],
          name: info['name'],
          start_time: info['start_time'],
          datastore: info['datastore'],
          uripath: info['uripath']
        })
      end

      # Kill job
      delete '/jobs/:job_id' do
        result = MsfGui.msf_client.kill_job(params[:job_id])

        json_response({
          success: true,
          message: 'Job terminated',
          result: result
        })
      end

      # Create handler
      post '/handler' do
        body = parse_json_body

        payload = body[:payload] || body['payload']
        lhost = body[:lhost] || body['lhost'] || body['LHOST']
        lport = body[:lport] || body['lport'] || body['LPORT'] || 4444

        unless payload
          json_error('Payload is required', status: 422)
        end

        unless lhost
          json_error('LHOST is required', status: 422)
        end

        options = {
          'LHOST' => lhost,
          'LPORT' => lport.to_s
        }

        # Add any extra options
        extra_options = body[:options] || body['options'] || {}
        extra_options.each { |k, v| options[k.to_s.upcase] = v.to_s }

        result = MsfGui.msf_client.create_handler(payload, options)

        if result['error']
          json_error(result['error_message'] || 'Failed to create handler', status: 500)
        end

        json_response({
          success: true,
          job_id: result['job_id'],
          uuid: result['uuid'],
          message: "Handler started for #{payload}",
          payload: payload,
          lhost: lhost,
          lport: lport
        }, status: 201)
      end

      # Get common payloads for handlers
      get '/payloads' do
        json_response(COMMON_PAYLOADS)
      end

      # Quick start handler from template
      post '/quick' do
        body = parse_json_body

        template_index = (body[:template] || body['template'] || 0).to_i
        lhost = body[:lhost] || body['lhost']
        lport = body[:lport] || body['lport'] || 4444

        unless lhost
          json_error('LHOST is required', status: 422)
        end

        if template_index < 0 || template_index >= COMMON_PAYLOADS.size
          json_error("Invalid template index. Valid range: 0-#{COMMON_PAYLOADS.size - 1}", status: 400)
        end

        template = COMMON_PAYLOADS[template_index]
        payload = template[:payload]

        options = {
          'LHOST' => lhost,
          'LPORT' => lport.to_s
        }

        result = MsfGui.msf_client.create_handler(payload, options)

        if result['error']
          json_error(result['error_message'] || 'Failed to create handler', status: 500)
        end

        json_response({
          success: true,
          job_id: result['job_id'],
          template: template[:name],
          payload: payload,
          lhost: lhost,
          lport: lport
        }, status: 201)
      end
    end
  end
end
