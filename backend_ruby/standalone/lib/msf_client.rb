# frozen_string_literal: true

require 'socket'
require 'msgpack'
require 'openssl'
require 'concurrent'
require 'logger'

module MsfGui
  # Metasploit RPC Client using MessagePack protocol
  class MsfClient
    class ConnectionError < StandardError; end
    class AuthenticationError < StandardError; end
    class RPCError < StandardError; end

    attr_reader :token

    def initialize(host: nil, port: nil, user: nil, password: nil, ssl: nil)
      @host = host || Settings.msf_rpc_host
      @port = port || Settings.msf_rpc_port
      @user = user || Settings.msf_rpc_user
      @password = password || Settings.msf_rpc_password
      @ssl = ssl.nil? ? Settings.msf_rpc_ssl : ssl
      @token = nil
      @mutex = Concurrent::ReentrantReadWriteLock.new
      @logger = Logger.new($stdout)
      @logger.level = Logger::INFO
    end

    def connect
      @mutex.with_write_lock do
        return true if @token

        result = call_raw('auth.login', @user, @password)
        raise AuthenticationError, result['error'] if result['error']
        raise AuthenticationError, 'No token received' unless result['token']

        @token = result['token']
        @logger.info("Connected to MSF RPC at #{@host}:#{@port}")
        true
      end
    rescue StandardError => e
      @logger.error("Failed to connect to MSF RPC: #{e.message}")
      raise ConnectionError, "Failed to connect: #{e.message}"
    end

    def disconnect
      @mutex.with_write_lock do
        return unless @token

        call('auth.logout', @token)
        @token = nil
        @logger.info('Disconnected from MSF RPC')
      end
    rescue StandardError
      @token = nil
    end

    def connected?
      @token != nil
    end

    def call(method, *args)
      connect unless connected?
      call_raw(method, @token, *args)
    end

    # ==================== Core API Methods ====================

    def get_version
      call('core.version')
    end

    def get_stats
      types = %w[exploit auxiliary post payload encoder nop]
      stats = {}
      types.each do |type|
        result = call('module.list', type)
        stats[type] = result['modules']&.size || 0
      end
      stats
    end

    # ==================== Session Methods ====================

    def list_sessions
      result = call('session.list')
      result.transform_values do |session|
        normalize_session(session)
      end
    end

    def get_session(session_id)
      sessions = list_sessions
      sessions[session_id.to_s]
    end

    def kill_session(session_id)
      call('session.stop', session_id.to_s)
    end

    def session_shell_read(session_id, read_pointer: nil)
      call('session.shell_read', session_id.to_s, read_pointer)
    end

    def session_shell_write(session_id, command)
      command = "#{command}\n" unless command.end_with?("\n")
      call('session.shell_write', session_id.to_s, command)
    end

    def session_meterpreter_read(session_id)
      call('session.meterpreter_read', session_id.to_s)
    end

    def session_meterpreter_write(session_id, command)
      call('session.meterpreter_write', session_id.to_s, command)
    end

    def session_meterpreter_run_single(session_id, command)
      call('session.meterpreter_run_single', session_id.to_s, command)
    end

    # ==================== Module Methods ====================

    def list_modules(type)
      result = call('module.list', type)
      result['modules'] || []
    end

    def get_module_info(type, name)
      call('module.info', type, name)
    end

    def search_modules(query, type: nil)
      result = call('module.search', query)
      modules = result['modules'] || []

      if type && !type.empty?
        modules.select! { |m| m['type'] == type }
      end

      modules
    end

    def get_compatible_payloads(exploit_name)
      result = call('module.compatible_payloads', exploit_name)
      result['payloads'] || []
    end

    def run_module(type, name, options = {})
      call('module.execute', type, name, options)
    end

    def run_exploit(name, options = {}, payload: nil, payload_options: {})
      opts = options.dup
      opts['PAYLOAD'] = payload if payload
      payload_options.each { |k, v| opts[k.to_s] = v }

      call('module.execute', 'exploit', name, opts)
    end

    # ==================== Console Methods ====================

    def console_create
      call('console.create')
    end

    def console_destroy(console_id)
      call('console.destroy', console_id.to_s)
    end

    def console_list
      call('console.list')
    end

    def console_read(console_id)
      call('console.read', console_id.to_s)
    end

    def console_write(console_id, command)
      command = "#{command}\n" unless command.end_with?("\n")
      call('console.write', console_id.to_s, command)
    end

    # ==================== Job Methods ====================

    def list_jobs
      call('job.list')
    end

    def get_job_info(job_id)
      call('job.info', job_id.to_s)
    end

    def kill_job(job_id)
      call('job.stop', job_id.to_s)
    end

    # ==================== Handler Methods ====================

    def create_handler(payload, options = {})
      opts = {
        'PAYLOAD' => payload,
        'ExitOnSession' => false
      }.merge(options)

      call('module.execute', 'exploit', 'multi/handler', opts)
    end

    # ==================== Payload Generation ====================

    def list_payload_formats
      # These are the standard msfvenom output formats
      {
        executable: %w[exe dll msi elf apk macho],
        transform: %w[hex c csharp python powershell bash base64 raw],
        web: %w[asp aspx jsp war php vba vbs hta]
      }
    end

    def list_encoders
      result = call('module.list', 'encoder')
      result['modules'] || []
    end

    def list_encoders_detailed
      encoders = list_encoders
      encoders.map do |name|
        info = get_module_info('encoder', name)
        {
          name: name,
          description: info['description'],
          rank: info['rank'],
          arch: info['arch']
        }
      end
    end

    def generate_payload(name, options = {}, format: 'raw', encoder: nil, iterations: 1, bad_chars: nil)
      # Use msfvenom subprocess for payload generation
      cmd = ['msfvenom', '-p', name]

      # Add options
      options.each { |k, v| cmd << "#{k}=#{v}" }

      # Add format (skip for APK)
      unless name.include?('android') && format == 'apk'
        cmd += ['-f', format]
      end

      # Add encoder
      if encoder && !encoder.empty?
        cmd += ['-e', encoder, '-i', iterations.to_s]
      end

      # Add bad chars
      if bad_chars && !bad_chars.empty?
        cmd += ['-b', bad_chars]
      end

      @logger.info("Running: #{cmd.join(' ')}")

      require 'open3'
      stdout, stderr, status = Open3.capture3(*cmd)

      unless status.success?
        raise RPCError, "Payload generation failed: #{stderr}"
      end

      stdout
    end

    # ==================== Post-Exploitation Methods ====================

    def session_sysinfo(session_id)
      session_meterpreter_run_single(session_id, 'sysinfo')
    end

    def session_getuid(session_id)
      session_meterpreter_run_single(session_id, 'getuid')
    end

    def session_getprivs(session_id)
      session_meterpreter_run_single(session_id, 'getprivs')
    end

    def session_getsystem(session_id)
      session_meterpreter_run_single(session_id, 'getsystem')
    end

    def session_hashdump(session_id)
      session_meterpreter_run_single(session_id, 'hashdump')
    end

    def session_ps(session_id)
      session_meterpreter_run_single(session_id, 'ps')
    end

    def session_migrate(session_id, pid)
      session_meterpreter_run_single(session_id, "migrate #{pid}")
    end

    def session_screenshot(session_id)
      session_meterpreter_run_single(session_id, 'screenshot')
    end

    def session_ls(session_id, path = nil)
      cmd = path ? "ls \"#{path}\"" : 'ls'
      session_meterpreter_run_single(session_id, cmd)
    end

    def session_pwd(session_id)
      session_meterpreter_run_single(session_id, 'pwd')
    end

    def session_download(session_id, remote_path)
      session_meterpreter_run_single(session_id, "download \"#{remote_path}\"")
    end

    def session_upload(session_id, local_path, remote_path)
      session_meterpreter_run_single(session_id, "upload \"#{local_path}\" \"#{remote_path}\"")
    end

    private

    def call_raw(method, *args)
      socket = create_socket
      begin
        # Pack and send request
        request = [method, *args].to_msgpack
        socket.write(request)

        # Read response
        unpacker = MessagePack::Unpacker.new(socket)
        unpacker.read
      ensure
        socket.close
      end
    rescue Errno::ECONNREFUSED
      raise ConnectionError, "Connection refused to #{@host}:#{@port}"
    rescue Errno::ETIMEDOUT, Errno::EHOSTUNREACH
      raise ConnectionError, "Cannot reach #{@host}:#{@port}"
    rescue MessagePack::MalformedFormatError => e
      raise RPCError, "Invalid response from server: #{e.message}"
    end

    def create_socket
      tcp_socket = TCPSocket.new(@host, @port)
      tcp_socket.setsockopt(Socket::IPPROTO_TCP, Socket::TCP_NODELAY, 1)

      if @ssl
        ssl_context = OpenSSL::SSL::SSLContext.new
        ssl_context.verify_mode = OpenSSL::SSL::VERIFY_NONE
        ssl_socket = OpenSSL::SSL::SSLSocket.new(tcp_socket, ssl_context)
        ssl_socket.sync_close = true
        ssl_socket.connect
        ssl_socket
      else
        tcp_socket
      end
    end

    def normalize_session(session)
      {
        type: session['type'],
        tunnel_local: session['tunnel_local'],
        tunnel_peer: session['tunnel_peer'],
        via_exploit: session['via_exploit'],
        via_payload: session['via_payload'],
        desc: session['desc'],
        info: session['info'],
        workspace: session['workspace'],
        session_host: session['session_host'],
        session_port: session['session_port'],
        target_host: session['target_host'],
        username: session['username'],
        uuid: session['uuid'],
        exploit_uuid: session['exploit_uuid'],
        routes: session['routes'],
        arch: session['arch'],
        platform: session['platform']
      }
    end
  end

  # Global client instance with lazy initialization
  class << self
    def msf_client
      @msf_client ||= MsfClient.new
    end

    def reset_client!
      @msf_client&.disconnect
      @msf_client = nil
    end
  end
end
