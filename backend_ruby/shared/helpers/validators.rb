# frozen_string_literal: true

module MsfGui
  module Helpers
    module Validators
      def validate_required(params, *keys)
        missing = keys.select { |k| params[k].nil? || params[k].to_s.empty? }
        return if missing.empty?

        json_error("Missing required parameters: #{missing.join(', ')}", status: 422)
      end

      def validate_ip(ip)
        return true if ip.nil? || ip.empty?

        # Simple IPv4/IPv6 validation
        ip.match?(/^(\d{1,3}\.){3}\d{1,3}$/) ||
          ip.match?(/^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/) ||
          ip.match?(/^[a-zA-Z0-9.-]+$/) # hostname
      end

      def validate_port(port)
        return true if port.nil?

        port = port.to_i
        port.positive? && port <= 65_535
      end

      def validate_module_type(type)
        valid_types = %w[exploit payload auxiliary post encoder nop evasion]
        return true if valid_types.include?(type)

        json_error("Invalid module type: #{type}. Valid types: #{valid_types.join(', ')}", status: 400)
      end

      def parse_json_body
        return {} unless request.content_type&.include?('application/json')

        body = request.body.read
        request.body.rewind
        return {} if body.empty?

        JSON.parse(body, symbolize_names: true)
      rescue JSON::ParserError
        json_error('Invalid JSON body', status: 400)
      end
    end
  end
end
