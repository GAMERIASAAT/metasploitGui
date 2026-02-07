# frozen_string_literal: true

module MsfGui
  class Settings
    class << self
      def app_name
        ENV.fetch('APP_NAME', 'Metasploit GUI')
      end

      def api_prefix
        ENV.fetch('API_PREFIX', '/api/v1')
      end

      def cors_origins
        ENV.fetch('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173').split(',')
      end

      def secret_key
        ENV.fetch('SECRET_KEY', 'your-secret-key-change-in-production')
      end

      def algorithm
        'HS256'
      end

      def access_token_expire_minutes
        ENV.fetch('ACCESS_TOKEN_EXPIRE_MINUTES', '1440').to_i
      end

      # MSF RPC Settings
      def msf_rpc_host
        ENV.fetch('MSF_RPC_HOST', '127.0.0.1')
      end

      def msf_rpc_port
        ENV.fetch('MSF_RPC_PORT', '55553').to_i
      end

      def msf_rpc_user
        ENV.fetch('MSF_RPC_USER', 'msf')
      end

      def msf_rpc_password
        ENV.fetch('MSF_RPC_PASSWORD', 'msf')
      end

      def msf_rpc_ssl
        ENV.fetch('MSF_RPC_SSL', 'false') == 'true'
      end

      # Storage paths
      def storage_path
        ENV.fetch('STORAGE_PATH', '/tmp/msf_gui_ruby')
      end

      def hosted_payloads_path
        File.join(storage_path, 'hosted_payloads')
      end

      # Server settings
      def server_port
        ENV.fetch('PORT', '8000').to_i
      end

      def server_host
        ENV.fetch('HOST', '0.0.0.0')
      end
    end
  end
end
