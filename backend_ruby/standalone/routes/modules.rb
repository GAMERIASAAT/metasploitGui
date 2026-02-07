# frozen_string_literal: true

require 'sinatra/base'

module MsfGui
  module Routes
    class Modules < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      VALID_TYPES = %w[exploit payload auxiliary post encoder nop evasion].freeze

      # Get available module types
      get '/types' do
        json_response(VALID_TYPES)
      end

      # Get module statistics (public endpoint)
      get '/stats' do
        begin
          stats = MsfGui.msf_client.get_stats
          json_response(stats)
        rescue StandardError => e
          json_response({
            exploit: 0,
            auxiliary: 0,
            post: 0,
            payload: 0,
            encoder: 0,
            nop: 0,
            error: e.message
          })
        end
      end

      # Search modules
      get '/search' do
        query = params[:query] || params[:q] || ''
        type = params[:type]

        if query.empty?
          json_error('Query parameter is required', status: 422)
        end

        modules = MsfGui.msf_client.search_modules(query, type: type)

        # Format results
        result = modules.map do |mod|
          {
            name: mod['name'] || mod['fullname'],
            fullname: mod['fullname'],
            type: mod['type'],
            rank: mod['rank'],
            description: mod['description'],
            author: mod['author'],
            references: mod['references']
          }
        end

        json_response(result)
      end

      # List modules by type with pagination
      get '/:module_type' do
        module_type = params[:module_type]

        unless VALID_TYPES.include?(module_type)
          json_error("Invalid module type: #{module_type}", status: 400)
        end

        offset = (params[:offset] || 0).to_i
        limit = (params[:limit] || 100).to_i
        search = params[:search]

        modules = MsfGui.msf_client.list_modules(module_type)

        # Apply search filter if provided
        if search && !search.empty?
          search_lower = search.downcase
          modules = modules.select { |m| m.downcase.include?(search_lower) }
        end

        # Paginate
        total = modules.size
        modules = modules[offset, limit] || []

        json_response({
          modules: modules,
          total: total,
          offset: offset,
          limit: limit
        })
      end

      # Get module info
      get '/:module_type/:module_name/info' do
        module_type = params[:module_type]
        module_name = params[:module_name]

        # Handle nested module names (e.g., windows/smb/ms17_010_eternalblue)
        if params[:splat] && !params[:splat].empty?
          module_name = "#{module_name}/#{params[:splat].join('/')}"
        end

        # URL decode the module name
        module_name = URI.decode_www_form_component(module_name) if module_name.include?('%')

        unless VALID_TYPES.include?(module_type)
          json_error("Invalid module type: #{module_type}", status: 400)
        end

        info = MsfGui.msf_client.get_module_info(module_type, module_name)

        if info['error']
          json_error(info['error_message'] || 'Module not found', status: 404)
        end

        json_response({
          name: info['name'],
          fullname: info['fullname'],
          type: module_type,
          rank: info['rank'],
          description: info['description'],
          author: info['author'],
          license: info['license'],
          references: info['references'],
          options: info['options'],
          targets: info['targets'],
          default_target: info['default_target'],
          privileged: info['privileged'],
          platform: info['platform'],
          arch: info['arch'],
          disclosure_date: info['disclosure_date']
        })
      end

      # Get compatible payloads for an exploit
      get '/:module_type/:module_name/payloads' do
        module_type = params[:module_type]
        module_name = params[:module_name]

        if params[:splat] && !params[:splat].empty?
          module_name = "#{module_name}/#{params[:splat].join('/')}"
        end

        module_name = URI.decode_www_form_component(module_name) if module_name.include?('%')

        unless module_type == 'exploit'
          json_error('Payloads are only available for exploit modules', status: 400)
        end

        payloads = MsfGui.msf_client.get_compatible_payloads(module_name)
        json_response(payloads)
      end

      # Execute module
      post '/:module_type/:module_name/execute' do
        module_type = params[:module_type]
        module_name = params[:module_name]

        if params[:splat] && !params[:splat].empty?
          module_name = "#{module_name}/#{params[:splat].join('/')}"
        end

        module_name = URI.decode_www_form_component(module_name) if module_name.include?('%')

        unless VALID_TYPES.include?(module_type)
          json_error("Invalid module type: #{module_type}", status: 400)
        end

        body = parse_json_body
        options = body[:options] || body['options'] || {}
        payload = body[:payload] || body['payload']
        payload_options = body[:payload_options] || body['payload_options'] || {}

        result = if module_type == 'exploit' && payload
                   MsfGui.msf_client.run_exploit(
                     module_name,
                     options,
                     payload: payload,
                     payload_options: payload_options
                   )
                 else
                   MsfGui.msf_client.run_module(module_type, module_name, options)
                 end

        if result['error']
          json_error(result['error_message'] || 'Module execution failed', status: 500)
        end

        json_response({
          success: true,
          job_id: result['job_id'],
          uuid: result['uuid'],
          message: "#{module_type.capitalize} module started"
        })
      end

      # List running jobs
      get '/jobs' do
        jobs = MsfGui.msf_client.list_jobs

        result = jobs.map do |id, name|
          { id: id, name: name }
        end

        json_response(result)
      end

      # Get job info
      get '/jobs/:job_id' do
        info = MsfGui.msf_client.get_job_info(params[:job_id])

        if info.nil? || info.empty?
          json_error('Job not found', status: 404)
        end

        json_response(info)
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
    end
  end
end
