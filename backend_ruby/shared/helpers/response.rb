# frozen_string_literal: true

module MsfGui
  module Helpers
    module Response
      def json_response(data, status: 200)
        content_type :json
        status status
        JSON.generate(data)
      end

      def json_error(message, status: 400, detail: nil)
        content_type :json
        halt status, JSON.generate({
          error: true,
          message: message,
          detail: detail
        }.compact)
      end

      def json_success(message: 'Success', data: nil)
        json_response({
          success: true,
          message: message,
          data: data
        }.compact)
      end

      def paginate(items, offset: 0, limit: 100)
        offset = [offset.to_i, 0].max
        limit = [[limit.to_i, 1].max, 1000].min

        {
          items: items[offset, limit] || [],
          total: items.size,
          offset: offset,
          limit: limit
        }
      end
    end
  end
end
