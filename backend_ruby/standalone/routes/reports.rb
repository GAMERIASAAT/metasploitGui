# frozen_string_literal: true

require 'sinatra/base'
require 'securerandom'
require 'erb'

module MsfGui
  module Routes
    class Reports < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      REPORT_TYPES = %w[engagement executive technical].freeze

      # List reports
      get '/' do
        data = Stores.reports.load({ reports: [] })
        reports = data[:reports] || data['reports'] || []

        json_response(reports.map do |r|
          {
            id: r[:id] || r['id'],
            name: r[:name] || r['name'],
            type: r[:type] || r['type'],
            created_at: r[:created_at] || r['created_at']
          }
        end)
      end

      # Preview report data
      get '/preview' do
        report_data = gather_report_data

        json_response(report_data)
      end

      # Create report
      post '/' do
        body = parse_json_body

        report_name = body[:name] || body['name'] || "Report #{Time.now.strftime('%Y-%m-%d')}"
        report_type = body[:type] || body['type'] || 'engagement'
        sections = body[:sections] || body['sections'] || %w[targets credentials activity scans workflows]

        unless REPORT_TYPES.include?(report_type)
          json_error("Invalid report type. Valid types: #{REPORT_TYPES.join(', ')}", status: 400)
        end

        report_data = gather_report_data(sections: sections)

        report = {
          id: SecureRandom.uuid,
          name: report_name,
          type: report_type,
          sections: sections,
          data: report_data,
          created_at: Time.now.iso8601
        }

        Stores.reports.update do |data|
          data[:reports] ||= []
          data[:reports] << report
          data
        end

        json_response(report, status: 201)
      end

      # Get report
      get '/:report_id' do
        data = Stores.reports.load({ reports: [] })
        reports = data[:reports] || data['reports'] || []
        report = reports.find { |r| (r[:id] || r['id']) == params[:report_id] }

        unless report
          json_error('Report not found', status: 404)
        end

        json_response(report)
      end

      # Export report as HTML
      get '/:report_id/export/html' do
        data = Stores.reports.load({ reports: [] })
        reports = data[:reports] || data['reports'] || []
        report = reports.find { |r| (r[:id] || r['id']) == params[:report_id] }

        unless report
          json_error('Report not found', status: 404)
        end

        html = generate_html_report(report)

        content_type 'text/html'
        headers['Content-Disposition'] = "attachment; filename=\"#{report[:name] || report['name']}.html\""
        html
      end

      # Export report as JSON
      get '/:report_id/export/json' do
        data = Stores.reports.load({ reports: [] })
        reports = data[:reports] || data['reports'] || []
        report = reports.find { |r| (r[:id] || r['id']) == params[:report_id] }

        unless report
          json_error('Report not found', status: 404)
        end

        content_type 'application/json'
        headers['Content-Disposition'] = "attachment; filename=\"#{report[:name] || report['name']}.json\""
        JSON.pretty_generate(report)
      end

      # Delete report
      delete '/:report_id' do
        report_id = params[:report_id]

        Stores.reports.update do |data|
          data[:reports] ||= []
          data[:reports].reject! { |r| (r[:id] || r['id']) == report_id }
          data
        end

        json_response({ success: true, message: 'Report deleted' })
      end

      # Get summary statistics
      get '/stats/summary' do
        targets = Stores.targets.load({ targets: [] })[:targets] || []
        credentials = Stores.credentials.load({ credentials: [] })[:credentials] || []
        activity = Stores.activity.load({ entries: [] })[:entries] || []
        scans = Stores.scans.load({ scans: [] })[:scans] || []
        workflows = Stores.workflows.load({ workflows: [] })[:workflows] || []

        # Get session count from MSF
        session_count = begin
          MsfGui.msf_client.list_sessions.size
        rescue StandardError
          0
        end

        json_response({
          targets: {
            total: targets.size,
            compromised: targets.count { |t| (t[:session_count] || t['session_count'] || 0) > 0 },
            by_status: targets.group_by { |t| t[:status] || t['status'] || 'unknown' }
                              .transform_values(&:size)
          },
          sessions: {
            active: session_count
          },
          credentials: {
            total: credentials.size,
            by_source: credentials.group_by { |c| c[:source] || c['source'] || 'unknown' }
                                  .transform_values(&:size)
          },
          scans: {
            total: scans.size,
            completed: scans.count { |s| (s[:status] || s['status']) == 'completed' }
          },
          workflows: {
            total: workflows.size,
            completed: workflows.count { |w| (w[:status] || w['status']) == 'completed' }
          },
          activity: {
            total: activity.size,
            last_24h: activity.count do |e|
              timestamp = e[:timestamp] || e['timestamp']
              next false unless timestamp

              Time.parse(timestamp) > (Time.now - 86_400)
            end
          }
        })
      end

      private

      def gather_report_data(sections: nil)
        sections ||= %w[targets credentials activity scans workflows]

        data = {}

        if sections.include?('targets')
          targets_data = Stores.targets.load({ targets: [] })
          data[:targets] = targets_data[:targets] || targets_data['targets'] || []
        end

        if sections.include?('credentials')
          creds_data = Stores.credentials.load({ credentials: [] })
          data[:credentials] = creds_data[:credentials] || creds_data['credentials'] || []
        end

        if sections.include?('activity')
          activity_data = Stores.activity.load({ entries: [] })
          entries = activity_data[:entries] || activity_data['entries'] || []
          # Limit to last 500 entries for reports
          data[:activity] = entries.last(500)
        end

        if sections.include?('scans')
          scans_data = Stores.scans.load({ scans: [] })
          data[:scans] = scans_data[:scans] || scans_data['scans'] || []
        end

        if sections.include?('workflows')
          workflows_data = Stores.workflows.load({ workflows: [] })
          data[:workflows] = workflows_data[:workflows] || workflows_data['workflows'] || []
        end

        data
      end

      def generate_html_report(report)
        report_name = report[:name] || report['name']
        report_type = report[:type] || report['type']
        report_data = report[:data] || report['data'] || {}
        created_at = report[:created_at] || report['created_at']

        targets = report_data[:targets] || report_data['targets'] || []
        credentials = report_data[:credentials] || report_data['credentials'] || []
        activity = report_data[:activity] || report_data['activity'] || []
        scans = report_data[:scans] || report_data['scans'] || []

        <<~HTML
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>#{ERB::Util.html_escape(report_name)}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; background: #f5f5f5; }
              .container { max-width: 1200px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              h1 { color: #1a1a2e; border-bottom: 3px solid #e94560; padding-bottom: 10px; }
              h2 { color: #16213e; margin-top: 40px; }
              table { width: 100%; border-collapse: collapse; margin: 20px 0; }
              th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
              th { background: #16213e; color: white; }
              tr:hover { background: #f8f9fa; }
              .stat-card { display: inline-block; padding: 20px 30px; margin: 10px; background: #16213e; color: white; border-radius: 8px; }
              .stat-value { font-size: 2em; font-weight: bold; }
              .stat-label { font-size: 0.9em; opacity: 0.8; }
              .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.85em; }
              .badge-success { background: #28a745; color: white; }
              .badge-warning { background: #ffc107; color: black; }
              .badge-danger { background: #dc3545; color: white; }
              .meta { color: #666; font-size: 0.9em; margin-bottom: 30px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>#{ERB::Util.html_escape(report_name)}</h1>
              <p class="meta">
                Type: #{ERB::Util.html_escape(report_type.capitalize)} Report<br>
                Generated: #{ERB::Util.html_escape(created_at)}
              </p>

              <div class="stats">
                <div class="stat-card">
                  <div class="stat-value">#{targets.size}</div>
                  <div class="stat-label">Targets</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">#{credentials.size}</div>
                  <div class="stat-label">Credentials</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">#{scans.size}</div>
                  <div class="stat-label">Scans</div>
                </div>
                <div class="stat-card">
                  <div class="stat-value">#{activity.size}</div>
                  <div class="stat-label">Activities</div>
                </div>
              </div>

              #{generate_targets_section(targets)}
              #{generate_credentials_section(credentials)}
              #{generate_scans_section(scans)}
              #{generate_activity_section(activity)}

              <hr style="margin-top: 40px;">
              <p class="meta">Generated by Metasploit GUI - Ruby Backend</p>
            </div>
          </body>
          </html>
        HTML
      end

      def generate_targets_section(targets)
        return '<h2>Targets</h2><p>No targets found.</p>' if targets.empty?

        rows = targets.map do |t|
          ip = t[:ip] || t['ip'] || 'N/A'
          hostname = t[:hostname] || t['hostname'] || 'N/A'
          os = t[:os] || t['os'] || 'Unknown'
          status = t[:status] || t['status'] || 'unknown'
          services = t[:services] || t['services'] || []

          "<tr>
            <td>#{ERB::Util.html_escape(ip)}</td>
            <td>#{ERB::Util.html_escape(hostname)}</td>
            <td>#{ERB::Util.html_escape(os)}</td>
            <td>#{ERB::Util.html_escape(status)}</td>
            <td>#{services.size}</td>
          </tr>"
        end.join("\n")

        <<~HTML
          <h2>Targets (#{targets.size})</h2>
          <table>
            <thead>
              <tr><th>IP</th><th>Hostname</th><th>OS</th><th>Status</th><th>Services</th></tr>
            </thead>
            <tbody>#{rows}</tbody>
          </table>
        HTML
      end

      def generate_credentials_section(credentials)
        return '<h2>Credentials</h2><p>No credentials found.</p>' if credentials.empty?

        rows = credentials.map do |c|
          username = c[:username] || c['username'] || 'N/A'
          password = c[:password] || c['password']
          hash = c[:hash] || c['hash']
          source = c[:source] || c['source'] || 'unknown'
          host = c[:host] || c['host'] || 'N/A'

          cred_display = if password
                           '********'
                         elsif hash
                           "#{hash[0..20]}..."
                         else
                           'N/A'
                         end

          "<tr>
            <td>#{ERB::Util.html_escape(username)}</td>
            <td>#{ERB::Util.html_escape(cred_display)}</td>
            <td>#{ERB::Util.html_escape(source)}</td>
            <td>#{ERB::Util.html_escape(host)}</td>
          </tr>"
        end.join("\n")

        <<~HTML
          <h2>Credentials (#{credentials.size})</h2>
          <table>
            <thead>
              <tr><th>Username</th><th>Password/Hash</th><th>Source</th><th>Host</th></tr>
            </thead>
            <tbody>#{rows}</tbody>
          </table>
        HTML
      end

      def generate_scans_section(scans)
        return '<h2>Scans</h2><p>No scans found.</p>' if scans.empty?

        rows = scans.map do |s|
          target = s[:target] || s['target'] || 'N/A'
          profile = s[:profile] || s['profile'] || 'N/A'
          status = s[:status] || s['status'] || 'unknown'
          hosts = s[:hosts] || s['hosts'] || []
          started = s[:started_at] || s['started_at'] || 'N/A'

          "<tr>
            <td>#{ERB::Util.html_escape(target)}</td>
            <td>#{ERB::Util.html_escape(profile)}</td>
            <td>#{ERB::Util.html_escape(status)}</td>
            <td>#{hosts.size}</td>
            <td>#{ERB::Util.html_escape(started)}</td>
          </tr>"
        end.join("\n")

        <<~HTML
          <h2>Scans (#{scans.size})</h2>
          <table>
            <thead>
              <tr><th>Target</th><th>Profile</th><th>Status</th><th>Hosts Found</th><th>Started</th></tr>
            </thead>
            <tbody>#{rows}</tbody>
          </table>
        HTML
      end

      def generate_activity_section(activity)
        return '<h2>Activity Log</h2><p>No activity recorded.</p>' if activity.empty?

        # Show last 50 entries
        recent = activity.last(50)

        rows = recent.map do |e|
          type = e[:type] || e['type'] || 'info'
          message = e[:message] || e['message'] || 'N/A'
          source = e[:source] || e['source'] || 'N/A'
          timestamp = e[:timestamp] || e['timestamp'] || 'N/A'

          badge_class = case type
                        when 'success' then 'badge-success'
                        when 'error' then 'badge-danger'
                        else 'badge-warning'
                        end

          "<tr>
            <td><span class='badge #{badge_class}'>#{ERB::Util.html_escape(type)}</span></td>
            <td>#{ERB::Util.html_escape(message)}</td>
            <td>#{ERB::Util.html_escape(source)}</td>
            <td>#{ERB::Util.html_escape(timestamp)}</td>
          </tr>"
        end.join("\n")

        <<~HTML
          <h2>Activity Log (Last 50 of #{activity.size})</h2>
          <table>
            <thead>
              <tr><th>Type</th><th>Message</th><th>Source</th><th>Timestamp</th></tr>
            </thead>
            <tbody>#{rows}</tbody>
          </table>
        HTML
      end
    end
  end
end
