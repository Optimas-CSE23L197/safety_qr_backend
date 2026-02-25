class ApiResponse {
  constructor(statusCode, data, message = "Success") {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }

  // Convenience — use in controllers like: return ApiResponse.ok(res, data)
  static ok(res, data, message = "Success") {
    return res.status(200).json(new ApiResponse(200, data, message));
  }

  static created(res, data, message = "Created successfully") {
    return res.status(201).json(new ApiResponse(201, data, message));
  }
}

export { ApiResponse };
