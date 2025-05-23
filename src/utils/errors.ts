import { MCPError } from '../mcp/types';

export function handleGoogleAPIError(error: any): MCPError {
  // Check if it's a Google API error
  if (error.response?.status) {
    switch (error.response.status) {
      case 401:
        return {
          code: -32001,
          message: 'Authentication required',
          data: { originalError: error.message }
        };
      
      case 403:
        return {
          code: -32002,
          message: 'Permission denied',
          data: { originalError: error.message }
        };
      
      case 429:
        return {
          code: -32003,
          message: 'Rate limit exceeded',
          data: { 
            originalError: error.message,
            retryAfter: error.response.headers?.['retry-after']
          }
        };
      
      case 404:
        return {
          code: -32004,
          message: 'Resource not found',
          data: { originalError: error.message }
        };
      
      default:
        if (error.response.status >= 500) {
          return {
            code: -32005,
            message: 'Google API server error',
            data: { 
              status: error.response.status,
              originalError: error.message 
            }
          };
        }
    }
  }

  // Generic error
  return {
    code: -32603,
    message: 'Internal server error',
    data: { originalError: error.message }
  };
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}