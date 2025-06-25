class ApiError extends Error {
  constructor(statusCode, message = "Something went wrong", errors = [], data = null) {
    super(message); // Call the parent class (Error) constructor with the message

    this.statusCode = statusCode; // HTTP status code
    this.errors = errors;         // Detailed error information (optional)
    this.data = data;             // Additional data (optional)
    this.success = false;         // Indicates failure

    // Maintain proper stack trace (only available on V8 engines like Chrome and Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export { ApiError };
