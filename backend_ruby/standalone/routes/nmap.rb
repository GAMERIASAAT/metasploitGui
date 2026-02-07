# frozen_string_literal: true

require 'sinatra/base'
require 'securerandom'
require 'rexml/document'

module MsfGui
  module Routes
    class Nmap < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      SCAN_PROFILES = {
        quick: {
          name: 'Quick Scan',
          description: 'Fast scan of common ports',
          args: '-T4 -F'
        },
        full: {
          name: 'Full Scan',
          description: 'Comprehensive scan of all ports with service detection',
          args: '-T4 -p- -sV -sC'
        },
        stealth: {
          name: 'Stealth Scan',
          description: 'SYN scan to avoid detection',
          args: '-sS -T2'
        },
        udp: {
          name: 'UDP Scan',
          description: 'Scan common UDP ports',
          args: '-sU --top-ports 100'
        },
        vuln: {
          name: 'Vulnerability Scan',
          description: 'Run vulnerability detection scripts',
          args: '-sV --script vuln'
        },
        discovery: {
          name: 'Host Discovery',
          description: 'Ping sweep to find live hosts',
          args: '-sn'
        },
        services: {
          name: 'Service Detection',
          description: 'Detect service versions',
          args: '-sV -sC'
        },
        custom: {
          name: 'Custom',
          description: 'Custom nmap arguments',
          args: ''
        }
      }.freeze

      # Get scan profiles
      get '/profiles' do
        json_response(SCAN_PROFILES.map { |k, v| { id: k.to_s }.merge(v) })
      end

      # Start nmap scan
      post '/scan' do
        body = parse_json_body

        target = body[:target] || body['target']
        profile = (body[:profile] || body['profile'] || 'quick').to_sym
        custom_args = body[:args] || body['args']

        unless target
          json_error('Target is required', status: 422)
        end

        # Build nmap command
        args = if profile == :custom
                 custom_args || '-T4'
               else
                 SCAN_PROFILES[profile]&.dig(:args) || SCAN_PROFILES[:quick][:args]
               end

        scan_id = SecureRandom.uuid
        output_file = "/tmp/nmap_#{scan_id}.xml"

        scan = {
          id: scan_id,
          target: target,
          profile: profile.to_s,
          args: args,
          status: 'running',
          output_file: output_file,
          started_at: Time.now.iso8601,
          completed_at: nil,
          hosts: [],
          error: nil
        }

        # Save scan metadata
        Stores.scans.update do |data|
          data[:scans] ||= []
          data[:scans] << scan
          data
        end

        # Start nmap in background
        Thread.new do
          begin
            cmd = "nmap #{args} -oX #{output_file} #{target}"
            system(cmd)

            # Parse results
            if File.exist?(output_file)
              hosts = parse_nmap_xml(output_file)

              Stores.scans.update do |data|
                data[:scans] ||= []
                idx = data[:scans].find_index { |s| s[:id] == scan_id }
                if idx
                  data[:scans][idx][:status] = 'completed'
                  data[:scans][idx][:completed_at] = Time.now.iso8601
                  data[:scans][idx][:hosts] = hosts
                end
                data
              end

              # Auto-import hosts as targets
              import_hosts_as_targets(hosts)
            else
              update_scan_status(scan_id, 'failed', 'Output file not created')
            end
          rescue StandardError => e
            update_scan_status(scan_id, 'failed', e.message)
          end
        end

        json_response({
          id: scan_id,
          status: 'started',
          target: target,
          profile: profile.to_s
        }, status: 202)
      end

      # List scans
      get '/scans' do
        data = Stores.scans.load({ scans: [] })
        scans = data[:scans] || data['scans'] || []

        # Sort by date, newest first
        scans = scans.sort_by { |s| s[:started_at] || s['started_at'] || '' }.reverse

        json_response(scans.map do |s|
          {
            id: s[:id] || s['id'],
            target: s[:target] || s['target'],
            profile: s[:profile] || s['profile'],
            status: s[:status] || s['status'],
            started_at: s[:started_at] || s['started_at'],
            completed_at: s[:completed_at] || s['completed_at'],
            host_count: (s[:hosts] || s['hosts'] || []).size
          }
        end)
      end

      # Get scan details
      get '/scans/:scan_id' do
        data = Stores.scans.load({ scans: [] })
        scans = data[:scans] || data['scans'] || []
        scan = scans.find { |s| (s[:id] || s['id']) == params[:scan_id] }

        unless scan
          json_error('Scan not found', status: 404)
        end

        json_response(scan)
      end

      # Delete scan
      delete '/scans/:scan_id' do
        scan_id = params[:scan_id]

        # Delete output file if exists
        data = Stores.scans.load({ scans: [] })
        scans = data[:scans] || data['scans'] || []
        scan = scans.find { |s| (s[:id] || s['id']) == scan_id }

        if scan
          output_file = scan[:output_file] || scan['output_file']
          FileUtils.rm_f(output_file) if output_file
        end

        Stores.scans.update do |d|
          d[:scans] ||= []
          d[:scans].reject! { |s| (s[:id] || s['id']) == scan_id }
          d
        end

        json_response({ success: true, message: 'Scan deleted' })
      end

      # Import nmap XML file
      post '/import-xml' do
        unless params[:file]
          json_error('File is required', status: 422)
        end

        tempfile = params[:file][:tempfile]
        content = tempfile.read

        hosts = parse_nmap_xml_content(content)
        import_hosts_as_targets(hosts)

        json_response({
          success: true,
          imported: hosts.size,
          hosts: hosts
        })
      end

      private

      def parse_nmap_xml(filepath)
        return [] unless File.exist?(filepath)

        content = File.read(filepath)
        parse_nmap_xml_content(content)
      end

      def parse_nmap_xml_content(content)
        hosts = []

        begin
          doc = REXML::Document.new(content)

          doc.elements.each('nmaprun/host') do |host|
            status = host.elements['status']&.attributes['state']
            next unless status == 'up'

            host_info = {
              ip: nil,
              hostname: nil,
              os: nil,
              os_family: nil,
              services: []
            }

            # Get IP address
            host.elements.each('address') do |addr|
              if addr.attributes['addrtype'] == 'ipv4'
                host_info[:ip] = addr.attributes['addr']
              end
            end

            # Get hostname
            host.elements.each('hostnames/hostname') do |hostname|
              host_info[:hostname] ||= hostname.attributes['name']
            end

            # Get OS info
            host.elements.each('os/osmatch') do |osmatch|
              host_info[:os] = osmatch.attributes['name']
              break
            end

            host.elements.each('os/osclass') do |osclass|
              host_info[:os_family] = osclass.attributes['osfamily']
              break
            end

            # Get services
            host.elements.each('ports/port') do |port|
              state = port.elements['state']
              next unless state&.attributes['state'] == 'open'

              service = port.elements['service']
              host_info[:services] << {
                port: port.attributes['portid'].to_i,
                protocol: port.attributes['protocol'],
                name: service&.attributes['name'],
                version: service&.attributes['version'],
                product: service&.attributes['product'],
                state: 'open'
              }
            end

            hosts << host_info
          end
        rescue StandardError => e
          puts "Error parsing nmap XML: #{e.message}"
        end

        hosts
      end

      def import_hosts_as_targets(hosts)
        Stores.targets.update do |data|
          data[:targets] ||= []

          hosts.each do |host|
            # Check if target already exists
            existing = data[:targets].find do |t|
              (t[:ip] || t['ip']) == host[:ip]
            end

            if existing
              # Update existing target
              existing[:services] = host[:services] if host[:services].any?
              existing[:os] = host[:os] if host[:os]
              existing[:os_family] = host[:os_family] if host[:os_family]
              existing[:hostname] = host[:hostname] if host[:hostname]
              existing[:updated_at] = Time.now.iso8601
            else
              # Create new target
              target = {
                id: SecureRandom.uuid,
                ip: host[:ip],
                hostname: host[:hostname],
                os: host[:os],
                os_family: host[:os_family],
                arch: nil,
                status: 'alive',
                tags: ['nmap-discovered'],
                notes: nil,
                group: nil,
                services: host[:services],
                session_count: 0,
                created_at: Time.now.iso8601,
                updated_at: Time.now.iso8601
              }
              data[:targets] << target
            end
          end

          data
        end
      end

      def update_scan_status(scan_id, status, error = nil)
        Stores.scans.update do |data|
          data[:scans] ||= []
          idx = data[:scans].find_index { |s| s[:id] == scan_id }
          if idx
            data[:scans][idx][:status] = status
            data[:scans][idx][:completed_at] = Time.now.iso8601
            data[:scans][idx][:error] = error
          end
          data
        end
      end
    end
  end
end
