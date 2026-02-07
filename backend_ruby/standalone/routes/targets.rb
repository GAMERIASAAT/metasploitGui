# frozen_string_literal: true

require 'sinatra/base'
require 'securerandom'

module MsfGui
  module Routes
    class Targets < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      # List targets with optional filters
      get '/' do
        status_filter = params[:status]
        group_filter = params[:group]
        tag_filter = params[:tag]

        data = Stores.targets.load({ targets: [] })
        targets = data[:targets] || data['targets'] || []

        # Apply filters
        if status_filter && !status_filter.empty?
          targets = targets.select { |t| (t[:status] || t['status']) == status_filter }
        end

        if group_filter && !group_filter.empty?
          targets = targets.select { |t| (t[:group] || t['group']) == group_filter }
        end

        if tag_filter && !tag_filter.empty?
          targets = targets.select do |t|
            tags = t[:tags] || t['tags'] || []
            tags.include?(tag_filter)
          end
        end

        json_response(targets)
      end

      # Create target
      post '/' do
        body = parse_json_body

        target = {
          id: SecureRandom.uuid,
          ip: body[:ip] || body['ip'],
          hostname: body[:hostname] || body['hostname'],
          os: body[:os] || body['os'],
          os_family: body[:os_family] || body['os_family'],
          arch: body[:arch] || body['arch'],
          status: body[:status] || body['status'] || 'unknown',
          tags: body[:tags] || body['tags'] || [],
          notes: body[:notes] || body['notes'],
          group: body[:group] || body['group'],
          session_count: 0,
          services: [],
          created_at: Time.now.iso8601,
          updated_at: Time.now.iso8601
        }

        unless target[:ip] || target[:hostname]
          json_error('IP or hostname is required', status: 422)
        end

        Stores.targets.update do |data|
          data[:targets] ||= []
          data[:targets] << target
          data
        end

        json_response(target, status: 201)
      end

      # Get target with services
      get '/:target_id' do
        data = Stores.targets.load({ targets: [] })
        targets = data[:targets] || data['targets'] || []
        target = targets.find { |t| (t[:id] || t['id']) == params[:target_id] }

        unless target
          json_error('Target not found', status: 404)
        end

        json_response(target)
      end

      # Update target
      put '/:target_id' do
        body = parse_json_body
        target_id = params[:target_id]

        updated = nil
        Stores.targets.update do |data|
          data[:targets] ||= []
          idx = data[:targets].find_index { |t| (t[:id] || t['id']) == target_id }

          unless idx
            json_error('Target not found', status: 404)
          end

          # Update fields
          %i[ip hostname os os_family arch status tags notes group].each do |field|
            if body[field] || body[field.to_s]
              data[:targets][idx][field] = body[field] || body[field.to_s]
            end
          end
          data[:targets][idx][:updated_at] = Time.now.iso8601
          updated = data[:targets][idx]
          data
        end

        json_response(updated)
      end

      # Delete target
      delete '/:target_id' do
        target_id = params[:target_id]

        Stores.targets.update do |data|
          data[:targets] ||= []
          data[:targets].reject! { |t| (t[:id] || t['id']) == target_id }
          data
        end

        json_response({ success: true, message: 'Target deleted' })
      end

      # Bulk import targets
      post '/import' do
        body = parse_json_body
        targets_data = body[:targets] || body['targets'] || []

        imported = []
        Stores.targets.update do |data|
          data[:targets] ||= []

          targets_data.each do |t|
            target = {
              id: SecureRandom.uuid,
              ip: t[:ip] || t['ip'],
              hostname: t[:hostname] || t['hostname'],
              os: t[:os] || t['os'],
              os_family: t[:os_family] || t['os_family'],
              arch: t[:arch] || t['arch'],
              status: t[:status] || t['status'] || 'unknown',
              tags: t[:tags] || t['tags'] || [],
              notes: t[:notes] || t['notes'],
              group: t[:group] || t['group'],
              services: t[:services] || t['services'] || [],
              session_count: 0,
              created_at: Time.now.iso8601,
              updated_at: Time.now.iso8601
            }

            next unless target[:ip] || target[:hostname]

            data[:targets] << target
            imported << target
          end

          data
        end

        json_response({
          success: true,
          imported: imported.size,
          targets: imported
        })
      end

      # Get services for target
      get '/:target_id/services' do
        data = Stores.targets.load({ targets: [] })
        targets = data[:targets] || data['targets'] || []
        target = targets.find { |t| (t[:id] || t['id']) == params[:target_id] }

        unless target
          json_error('Target not found', status: 404)
        end

        services = target[:services] || target['services'] || []
        json_response(services)
      end

      # Add service to target
      post '/:target_id/services' do
        body = parse_json_body
        target_id = params[:target_id]

        service = {
          id: SecureRandom.uuid,
          port: body[:port] || body['port'],
          protocol: body[:protocol] || body['protocol'] || 'tcp',
          name: body[:name] || body['name'],
          version: body[:version] || body['version'],
          state: body[:state] || body['state'] || 'open',
          banner: body[:banner] || body['banner'],
          created_at: Time.now.iso8601
        }

        unless service[:port]
          json_error('Port is required', status: 422)
        end

        Stores.targets.update do |data|
          data[:targets] ||= []
          idx = data[:targets].find_index { |t| (t[:id] || t['id']) == target_id }

          unless idx
            json_error('Target not found', status: 404)
          end

          data[:targets][idx][:services] ||= []
          data[:targets][idx][:services] << service
          data[:targets][idx][:updated_at] = Time.now.iso8601
          data
        end

        json_response(service, status: 201)
      end

      # Delete service from target
      delete '/:target_id/services/:service_id' do
        target_id = params[:target_id]
        service_id = params[:service_id]

        Stores.targets.update do |data|
          data[:targets] ||= []
          idx = data[:targets].find_index { |t| (t[:id] || t['id']) == target_id }

          unless idx
            json_error('Target not found', status: 404)
          end

          data[:targets][idx][:services] ||= []
          data[:targets][idx][:services].reject! { |s| (s[:id] || s['id']) == service_id }
          data[:targets][idx][:updated_at] = Time.now.iso8601
          data
        end

        json_response({ success: true, message: 'Service deleted' })
      end

      # Bulk update status
      post '/bulk/status' do
        body = parse_json_body
        target_ids = body[:ids] || body['ids'] || []
        new_status = body[:status] || body['status']

        unless new_status
          json_error('Status is required', status: 422)
        end

        updated = 0
        Stores.targets.update do |data|
          data[:targets] ||= []
          data[:targets].each do |target|
            if target_ids.include?(target[:id] || target['id'])
              target[:status] = new_status
              target[:updated_at] = Time.now.iso8601
              updated += 1
            end
          end
          data
        end

        json_response({ success: true, updated: updated })
      end

      # Bulk delete
      delete '/bulk' do
        body = parse_json_body
        target_ids = body[:ids] || body['ids'] || []

        deleted = 0
        Stores.targets.update do |data|
          data[:targets] ||= []
          original_count = data[:targets].size
          data[:targets].reject! { |t| target_ids.include?(t[:id] || t['id']) }
          deleted = original_count - data[:targets].size
          data
        end

        json_response({ success: true, deleted: deleted })
      end

      # Get target statistics
      get '/stats/summary' do
        data = Stores.targets.load({ targets: [] })
        targets = data[:targets] || data['targets'] || []

        # Count by status
        status_counts = targets.group_by { |t| t[:status] || t['status'] }
                               .transform_values(&:size)

        # Count by OS family
        os_counts = targets.group_by { |t| t[:os_family] || t['os_family'] || 'unknown' }
                           .transform_values(&:size)

        # Count by group
        group_counts = targets.group_by { |t| t[:group] || t['group'] || 'ungrouped' }
                              .transform_values(&:size)

        json_response({
          total: targets.size,
          by_status: status_counts,
          by_os: os_counts,
          by_group: group_counts
        })
      end
    end
  end
end
