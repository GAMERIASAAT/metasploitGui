# frozen_string_literal: true

require 'json'
require 'fileutils'
require 'concurrent'

module MsfGui
  # Thread-safe JSON file storage
  class Storage
    def initialize(filename)
      @filepath = File.join(Settings.storage_path, filename)
      @mutex = Concurrent::ReentrantReadWriteLock.new
      ensure_directory
    end

    def load(default = {})
      @mutex.with_read_lock do
        return default unless File.exist?(@filepath)

        JSON.parse(File.read(@filepath), symbolize_names: true)
      rescue JSON::ParserError
        default
      end
    end

    def save(data)
      @mutex.with_write_lock do
        File.write(@filepath, JSON.pretty_generate(data))
      end
    end

    def update
      @mutex.with_write_lock do
        data = if File.exist?(@filepath)
                 JSON.parse(File.read(@filepath), symbolize_names: true)
               else
                 {}
               end
        result = yield(data)
        File.write(@filepath, JSON.pretty_generate(result))
        result
      rescue JSON::ParserError
        result = yield({})
        File.write(@filepath, JSON.pretty_generate(result))
        result
      end
    end

    private

    def ensure_directory
      FileUtils.mkdir_p(File.dirname(@filepath))
    end
  end

  # Storage instances for different data types
  module Stores
    class << self
      def targets
        @targets ||= Storage.new('targets.json')
      end

      def credentials
        @credentials ||= Storage.new('credentials.json')
      end

      def workflows
        @workflows ||= Storage.new('workflows.json')
      end

      def activity
        @activity ||= Storage.new('activity.json')
      end

      def reports
        @reports ||= Storage.new('reports.json')
      end

      def scans
        @scans ||= Storage.new('scans.json')
      end

      def hosted_payloads
        @hosted_payloads ||= Storage.new('hosted_payloads.json')
      end

      def phishing_campaigns
        @phishing_campaigns ||= Storage.new('phishing/campaigns.json')
      end

      def phishing_templates
        @phishing_templates ||= Storage.new('phishing/templates.json')
      end

      def phishing_captured
        @phishing_captured ||= Storage.new('phishing/captured.json')
      end

      def users
        @users ||= Storage.new('users.json')
      end
    end
  end
end
