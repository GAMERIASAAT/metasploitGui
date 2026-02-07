# frozen_string_literal: true

require 'sinatra/base'
require 'securerandom'

module MsfGui
  module Routes
    class Automation < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      WORKFLOW_TEMPLATES = [
        {
          id: 'windows-postex',
          name: 'Windows Post-Exploitation',
          description: 'Standard Windows post-exploitation workflow',
          steps: [
            { type: 'command', command: 'sysinfo', description: 'Get system information' },
            { type: 'command', command: 'getuid', description: 'Get current user' },
            { type: 'command', command: 'getprivs', description: 'Get privileges' },
            { type: 'post', module: 'windows/gather/checkvm', description: 'Check if VM' },
            { type: 'command', command: 'hashdump', description: 'Dump password hashes' }
          ]
        },
        {
          id: 'linux-postex',
          name: 'Linux Post-Exploitation',
          description: 'Standard Linux post-exploitation workflow',
          steps: [
            { type: 'command', command: 'sysinfo', description: 'Get system information' },
            { type: 'command', command: 'getuid', description: 'Get current user' },
            { type: 'post', module: 'linux/gather/checkvm', description: 'Check if VM' },
            { type: 'post', module: 'linux/gather/enum_configs', description: 'Enumerate configs' },
            { type: 'post', module: 'linux/gather/hashdump', description: 'Dump password hashes' }
          ]
        },
        {
          id: 'privesc',
          name: 'Privilege Escalation',
          description: 'Attempt various privilege escalation techniques',
          steps: [
            { type: 'command', command: 'getsystem', description: 'Try getsystem' },
            { type: 'post', module: 'multi/recon/local_exploit_suggester', description: 'Find local exploits' }
          ]
        },
        {
          id: 'credential-harvest',
          name: 'Credential Harvesting',
          description: 'Gather credentials from the target',
          steps: [
            { type: 'command', command: 'hashdump', description: 'Dump hashes' },
            { type: 'post', module: 'windows/gather/credentials/credential_collector', description: 'Collect credentials' },
            { type: 'post', module: 'multi/gather/firefox_creds', description: 'Firefox credentials' },
            { type: 'post', module: 'multi/gather/chrome_cookies', description: 'Chrome cookies' }
          ]
        },
        {
          id: 'persistence',
          name: 'Persistence Establishment',
          description: 'Establish persistence on the target',
          steps: [
            { type: 'post', module: 'windows/manage/persistence_exe', description: 'Windows persistence' }
          ]
        }
      ].freeze

      # Get workflow templates
      get '/templates' do
        json_response(WORKFLOW_TEMPLATES)
      end

      # Get specific template
      get '/templates/:template_id' do
        template = WORKFLOW_TEMPLATES.find { |t| t[:id] == params[:template_id] }

        unless template
          json_error('Template not found', status: 404)
        end

        json_response(template)
      end

      # List workflows
      get '/' do
        status_filter = params[:status]

        data = Stores.workflows.load({ workflows: [] })
        workflows = data[:workflows] || data['workflows'] || []

        if status_filter && !status_filter.empty?
          workflows = workflows.select { |w| (w[:status] || w['status']) == status_filter }
        end

        json_response(workflows)
      end

      # Create workflow
      post '/' do
        body = parse_json_body

        workflow = {
          id: SecureRandom.uuid,
          name: body[:name] || body['name'] || 'Untitled Workflow',
          description: body[:description] || body['description'],
          steps: body[:steps] || body['steps'] || [],
          status: 'pending',
          current_step: 0,
          results: [],
          created_at: Time.now.iso8601,
          updated_at: Time.now.iso8601
        }

        Stores.workflows.update do |data|
          data[:workflows] ||= []
          data[:workflows] << workflow
          data
        end

        json_response(workflow, status: 201)
      end

      # Create workflow from template
      post '/from-template/:template_id' do
        body = parse_json_body
        template = WORKFLOW_TEMPLATES.find { |t| t[:id] == params[:template_id] }

        unless template
          json_error('Template not found', status: 404)
        end

        workflow = {
          id: SecureRandom.uuid,
          name: body[:name] || body['name'] || template[:name],
          description: template[:description],
          steps: template[:steps].dup,
          template_id: template[:id],
          status: 'pending',
          current_step: 0,
          results: [],
          created_at: Time.now.iso8601,
          updated_at: Time.now.iso8601
        }

        Stores.workflows.update do |data|
          data[:workflows] ||= []
          data[:workflows] << workflow
          data
        end

        json_response(workflow, status: 201)
      end

      # Get workflow
      get '/:workflow_id' do
        data = Stores.workflows.load({ workflows: [] })
        workflows = data[:workflows] || data['workflows'] || []
        workflow = workflows.find { |w| (w[:id] || w['id']) == params[:workflow_id] }

        unless workflow
          json_error('Workflow not found', status: 404)
        end

        json_response(workflow)
      end

      # Update workflow
      put '/:workflow_id' do
        body = parse_json_body
        workflow_id = params[:workflow_id]

        updated = nil
        Stores.workflows.update do |data|
          data[:workflows] ||= []
          idx = data[:workflows].find_index { |w| (w[:id] || w['id']) == workflow_id }

          unless idx
            json_error('Workflow not found', status: 404)
          end

          %i[name description steps].each do |field|
            if body[field] || body[field.to_s]
              data[:workflows][idx][field] = body[field] || body[field.to_s]
            end
          end
          data[:workflows][idx][:updated_at] = Time.now.iso8601
          updated = data[:workflows][idx]
          data
        end

        json_response(updated)
      end

      # Delete workflow
      delete '/:workflow_id' do
        workflow_id = params[:workflow_id]

        Stores.workflows.update do |data|
          data[:workflows] ||= []
          data[:workflows].reject! { |w| (w[:id] || w['id']) == workflow_id }
          data
        end

        json_response({ success: true, message: 'Workflow deleted' })
      end

      # Run workflow
      post '/:workflow_id/run' do
        body = parse_json_body
        workflow_id = params[:workflow_id]
        session_id = body[:session_id] || body['session_id']

        unless session_id
          json_error('Session ID is required', status: 422)
        end

        data = Stores.workflows.load({ workflows: [] })
        workflows = data[:workflows] || data['workflows'] || []
        workflow = workflows.find { |w| (w[:id] || w['id']) == workflow_id }

        unless workflow
          json_error('Workflow not found', status: 404)
        end

        # Update status to running
        Stores.workflows.update do |d|
          d[:workflows] ||= []
          idx = d[:workflows].find_index { |w| (w[:id] || w['id']) == workflow_id }
          if idx
            d[:workflows][idx][:status] = 'running'
            d[:workflows][idx][:session_id] = session_id
            d[:workflows][idx][:started_at] = Time.now.iso8601
          end
          d
        end

        # Run workflow in background
        Thread.new do
          run_workflow(workflow_id, session_id)
        end

        json_response({
          success: true,
          message: 'Workflow started',
          workflow_id: workflow_id
        })
      end

      # Stop workflow
      post '/:workflow_id/stop' do
        workflow_id = params[:workflow_id]

        Stores.workflows.update do |data|
          data[:workflows] ||= []
          idx = data[:workflows].find_index { |w| (w[:id] || w['id']) == workflow_id }
          if idx
            data[:workflows][idx][:status] = 'stopped'
            data[:workflows][idx][:stopped_at] = Time.now.iso8601
          end
          data
        end

        json_response({ success: true, message: 'Workflow stopped' })
      end

      # Duplicate workflow
      post '/:workflow_id/duplicate' do
        workflow_id = params[:workflow_id]

        data = Stores.workflows.load({ workflows: [] })
        workflows = data[:workflows] || data['workflows'] || []
        workflow = workflows.find { |w| (w[:id] || w['id']) == workflow_id }

        unless workflow
          json_error('Workflow not found', status: 404)
        end

        new_workflow = workflow.dup
        new_workflow[:id] = SecureRandom.uuid
        new_workflow[:name] = "#{workflow[:name] || workflow['name']} (Copy)"
        new_workflow[:status] = 'pending'
        new_workflow[:results] = []
        new_workflow[:current_step] = 0
        new_workflow[:created_at] = Time.now.iso8601
        new_workflow[:updated_at] = Time.now.iso8601

        Stores.workflows.update do |d|
          d[:workflows] ||= []
          d[:workflows] << new_workflow
          d
        end

        json_response(new_workflow, status: 201)
      end

      # Get activity log
      get '/activity/log' do
        data = Stores.activity.load({ entries: [] })
        entries = data[:entries] || data['entries'] || []

        # Sort by date, newest first
        entries = entries.sort_by { |e| e[:timestamp] || e['timestamp'] || '' }.reverse

        # Limit to last 1000 entries
        entries = entries.first(1000)

        json_response(entries)
      end

      # Add activity log entry
      post '/activity/log' do
        body = parse_json_body

        entry = {
          id: SecureRandom.uuid,
          type: body[:type] || body['type'] || 'info',
          message: body[:message] || body['message'],
          source: body[:source] || body['source'] || 'manual',
          session_id: body[:session_id] || body['session_id'],
          workflow_id: body[:workflow_id] || body['workflow_id'],
          timestamp: Time.now.iso8601
        }

        Stores.activity.update do |data|
          data[:entries] ||= []
          data[:entries] << entry
          # Keep only last 10000 entries
          data[:entries] = data[:entries].last(10_000)
          data
        end

        json_response(entry, status: 201)
      end

      # Clear activity log
      delete '/activity/log' do
        Stores.activity.save({ entries: [] })
        json_response({ success: true, message: 'Activity log cleared' })
      end

      private

      def run_workflow(workflow_id, session_id)
        data = Stores.workflows.load({ workflows: [] })
        workflows = data[:workflows] || data['workflows'] || []
        workflow = workflows.find { |w| (w[:id] || w['id']) == workflow_id }

        return unless workflow

        steps = workflow[:steps] || workflow['steps'] || []
        results = []

        steps.each_with_index do |step, idx|
          # Check if workflow was stopped
          current = Stores.workflows.load({ workflows: [] })
          current_workflow = current[:workflows]&.find { |w| (w[:id] || w['id']) == workflow_id }
          break if current_workflow && (current_workflow[:status] || current_workflow['status']) == 'stopped'

          # Update current step
          Stores.workflows.update do |d|
            d[:workflows] ||= []
            i = d[:workflows].find_index { |w| (w[:id] || w['id']) == workflow_id }
            d[:workflows][i][:current_step] = idx if i
            d
          end

          step_type = step[:type] || step['type']
          result = { step: idx, type: step_type, success: false, output: nil, error: nil }

          begin
            case step_type
            when 'command'
              command = step[:command] || step['command']
              output = MsfGui.msf_client.session_meterpreter_run_single(session_id, command)
              result[:success] = true
              result[:output] = output['data'] || output
            when 'post'
              module_name = step[:module] || step['module']
              options = (step[:options] || step['options'] || {}).merge('SESSION' => session_id.to_s)
              output = MsfGui.msf_client.run_module('post', module_name, options)
              result[:success] = true
              result[:output] = output
            when 'delay'
              seconds = (step[:seconds] || step['seconds'] || 1).to_i
              sleep(seconds)
              result[:success] = true
            when 'exploit'
              module_name = step[:module] || step['module']
              options = step[:options] || step['options'] || {}
              payload = step[:payload] || step['payload']
              output = MsfGui.msf_client.run_exploit(module_name, options, payload: payload)
              result[:success] = true
              result[:output] = output
            when 'auxiliary'
              module_name = step[:module] || step['module']
              options = step[:options] || step['options'] || {}
              output = MsfGui.msf_client.run_module('auxiliary', module_name, options)
              result[:success] = true
              result[:output] = output
            end
          rescue StandardError => e
            result[:error] = e.message
          end

          results << result

          # Log activity
          Stores.activity.update do |d|
            d[:entries] ||= []
            d[:entries] << {
              id: SecureRandom.uuid,
              type: result[:success] ? 'success' : 'error',
              message: "Workflow step #{idx + 1}: #{step_type}",
              source: 'workflow',
              session_id: session_id,
              workflow_id: workflow_id,
              timestamp: Time.now.iso8601
            }
            d
          end

          # Small delay between steps
          sleep(0.5)
        end

        # Update workflow as completed
        Stores.workflows.update do |d|
          d[:workflows] ||= []
          idx = d[:workflows].find_index { |w| (w[:id] || w['id']) == workflow_id }
          if idx
            d[:workflows][idx][:status] = 'completed'
            d[:workflows][idx][:completed_at] = Time.now.iso8601
            d[:workflows][idx][:results] = results
          end
          d
        end
      rescue StandardError => e
        Stores.workflows.update do |d|
          d[:workflows] ||= []
          idx = d[:workflows].find_index { |w| (w[:id] || w['id']) == workflow_id }
          if idx
            d[:workflows][idx][:status] = 'failed'
            d[:workflows][idx][:error] = e.message
            d[:workflows][idx][:completed_at] = Time.now.iso8601
          end
          d
        end
      end
    end
  end
end
