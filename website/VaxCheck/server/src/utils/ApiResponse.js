/**
 * utils/ApiResponse.js
 *
 * Standard success response wrapper.
 * All controllers should return responses via this class to maintain a
 * consistent JSON shape across the entire API.
 *
 * Shape:
 *  {
 *    statusCode: number,
 *    data: any,
 *    message: string,
 *    success: boolean
 *  }
 */

class ApiResponse {
  constructor(statusCode, data, message = 'Success') {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}

export { ApiResponse };
