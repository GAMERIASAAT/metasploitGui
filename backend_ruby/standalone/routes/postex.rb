# frozen_string_literal: true

require 'sinatra/base'
require 'securerandom'
require 'base64'

module MsfGui
  module Routes
    class Postex < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      # List post modules with optional filters
      get '/modules' do
        platform = params[:platform]
        category = params[:category]
        search = params[:search]

        modules = MsfGui.msf_client.list_modules('post')

        # Apply filters
        if platform && !platform.empty?
          modules = modules.select { |m| m.include?(platform.downcase) }
        end

        if category && !category.empty?
          modules = modules.select { |m| m.include?("/#{category.downcase}/") }
        end

        if search && !search.empty?
          search_lower = search.downcase
          modules = modules.select { |m| m.downcase.include?(search_lower) }
        end

        json_response({
          modules: modules,
          total: modules.size
        })
      end

      # Get post module info
      get '/modules/:module_path/info' do
        module_path = params[:module_path]

        if params[:splat] && !params[:splat].empty?
          module_path = "#{module_path}/#{params[:splat].join('/')}"
        end

        module_path = URI.decode_www_form_component(module_path) if module_path.include?('%')

        info = MsfGui.msf_client.get_module_info('post', module_path)

        if info['error']
          json_error('Module not found', status: 404)
        end

        json_response({
          name: info['name'],
          fullname: info['fullname'],
          description: info['description'],
          author: info['author'],
          options: info['options'],
          platform: info['platform'],
          arch: info['arch'],
          references: info['references']
        })
      end

      # Run post module
      post '/modules/run' do
        body = parse_json_body

        module_name = body[:module] || body['module']
        session_id = body[:session_id] || body['session_id']
        options = body[:options] || body['options'] || {}

        unless module_name
          json_error('Module name is required', status: 422)
        end

        unless session_id
          json_error('Session ID is required', status: 422)
        end

        options['SESSION'] = session_id.to_s

        result = MsfGui.msf_client.run_module('post', module_name, options)

        if result['error']
          json_error(result['error_message'] || 'Failed to run module', status: 500)
        end

        json_response({
          success: true,
          job_id: result['job_id'],
          uuid: result['uuid']
        })
      end

      # ==================== Credentials ====================

      # List credentials
      get '/credentials' do
        creds = Stores.credentials.load({ credentials: [] })
        json_response(creds[:credentials] || creds['credentials'] || [])
      end

      # Add credential
      post '/credentials' do
        body = parse_json_body

        cred = {
          id: SecureRandom.uuid,
          username: body[:username] || body['username'],
          password: body[:password] || body['password'],
          hash: body[:hash] || body['hash'],
          realm: body[:realm] || body['realm'],
          host: body[:host] || body['host'],
          service: body[:service] || body['service'],
          port: body[:port] || body['port'],
          source: body[:source] || body['source'] || 'manual',
          created_at: Time.now.iso8601
        }

        Stores.credentials.update do |data|
          data[:credentials] ||= []
          data[:credentials] << cred
          data
        end

        json_response(cred, status: 201)
      end

      # Update credential
      put '/credentials/:cred_id' do
        body = parse_json_body
        cred_id = params[:cred_id]

        updated = nil
        Stores.credentials.update do |data|
          data[:credentials] ||= []
          idx = data[:credentials].find_index { |c| (c[:id] || c['id']) == cred_id }

          unless idx
            json_error('Credential not found', status: 404)
          end

          data[:credentials][idx].merge!(
            username: body[:username] || body['username'] || data[:credentials][idx][:username],
            password: body[:password] || body['password'] || data[:credentials][idx][:password],
            hash: body[:hash] || body['hash'] || data[:credentials][idx][:hash],
            updated_at: Time.now.iso8601
          )
          updated = data[:credentials][idx]
          data
        end

        json_response(updated)
      end

      # Delete credential
      delete '/credentials/:cred_id' do
        cred_id = params[:cred_id]

        Stores.credentials.update do |data|
          data[:credentials] ||= []
          data[:credentials].reject! { |c| (c[:id] || c['id']) == cred_id }
          data
        end

        json_response({ success: true, message: 'Credential deleted' })
      end

      # ==================== Session Operations ====================

      # List files on target
      get '/sessions/:session_id/files' do
        path = params[:path]
        result = MsfGui.msf_client.session_ls(params[:session_id], path)
        json_response({ data: result['data'] || result })
      end

      # Get current directory
      get '/sessions/:session_id/files/pwd' do
        result = MsfGui.msf_client.session_pwd(params[:session_id])
        json_response({ path: result['data'] || result })
      end

      # Download file
      post '/sessions/:session_id/files/download' do
        body = parse_json_body
        remote_path = body[:path] || body['path']

        unless remote_path
          json_error('Path is required', status: 422)
        end

        result = MsfGui.msf_client.session_download(params[:session_id], remote_path)

        # The result might be the file content or a status message
        json_response({
          data: result['data'] || result,
          path: remote_path
        })
      end

      # Upload file
      post '/sessions/:session_id/files/upload' do
        body = parse_json_body
        remote_path = body[:remote_path] || body['remote_path']
        content = body[:content] || body['content']
        local_path = body[:local_path] || body['local_path']

        unless remote_path
          json_error('Remote path is required', status: 422)
        end

        if content
          # Save content to temp file first
          temp_file = "/tmp/upload_#{SecureRandom.hex(8)}"
          File.binwrite(temp_file, Base64.decode64(content))
          local_path = temp_file
        end

        unless local_path
          json_error('Content or local_path is required', status: 422)
        end

        result = MsfGui.msf_client.session_upload(params[:session_id], local_path, remote_path)

        # Clean up temp file if we created one
        FileUtils.rm_f(temp_file) if defined?(temp_file)

        json_response({
          success: true,
          data: result['data'] || result
        })
      end

      # List processes
      get '/sessions/:session_id/processes' do
        result = MsfGui.msf_client.session_ps(params[:session_id])
        json_response({ data: result['data'] || result })
      end

      # Kill process
      post '/sessions/:session_id/processes/kill' do
        body = parse_json_body
        pid = body[:pid] || body['pid']

        unless pid
          json_error('PID is required', status: 422)
        end

        result = MsfGui.msf_client.session_meterpreter_run_single(
          params[:session_id],
          "kill #{pid}"
        )

        json_response({ success: true, data: result['data'] || result })
      end

      # Migrate process
      post '/sessions/:session_id/processes/migrate' do
        body = parse_json_body
        pid = body[:pid] || body['pid']

        unless pid
          json_error('PID is required', status: 422)
        end

        result = MsfGui.msf_client.session_migrate(params[:session_id], pid)
        json_response({ success: true, data: result['data'] || result })
      end

      # Screenshot
      post '/sessions/:session_id/screenshot' do
        result = MsfGui.msf_client.session_screenshot(params[:session_id])
        json_response({ data: result['data'] || result })
      end

      # System info
      get '/sessions/:session_id/sysinfo' do
        result = MsfGui.msf_client.session_sysinfo(params[:session_id])
        json_response({ data: result['data'] || result })
      end

      # Get UID
      get '/sessions/:session_id/getuid' do
        result = MsfGui.msf_client.session_getuid(params[:session_id])
        json_response({ data: result['data'] || result })
      end

      # Get privileges
      get '/sessions/:session_id/getprivs' do
        result = MsfGui.msf_client.session_getprivs(params[:session_id])
        json_response({ data: result['data'] || result })
      end

      # Attempt privilege escalation
      post '/sessions/:session_id/getsystem' do
        result = MsfGui.msf_client.session_getsystem(params[:session_id])
        json_response({ data: result['data'] || result })
      end

      # Run local exploit suggester
      post '/sessions/:session_id/suggest' do
        result = MsfGui.msf_client.run_module('post', 'multi/recon/local_exploit_suggester', {
          'SESSION' => params[:session_id]
        })

        json_response({
          success: true,
          job_id: result['job_id'],
          uuid: result['uuid']
        })
      end

      # Hashdump
      post '/sessions/:session_id/hashdump' do
        result = MsfGui.msf_client.session_hashdump(params[:session_id])

        # Store any extracted hashes as credentials
        hashes = result['data'] || result
        if hashes.is_a?(String)
          hashes.each_line do |line|
            parts = line.strip.split(':')
            next unless parts.size >= 4

            cred = {
              id: SecureRandom.uuid,
              username: parts[0],
              hash: "#{parts[2]}:#{parts[3]}",
              realm: 'NTLM',
              source: 'hashdump',
              session_id: params[:session_id],
              created_at: Time.now.iso8601
            }

            Stores.credentials.update do |data|
              data[:credentials] ||= []
              data[:credentials] << cred
              data
            end
          end
        end

        json_response({ data: hashes })
      end
    end
  end
end
