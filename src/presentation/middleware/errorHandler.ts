import { Request, Response, NextFunction } from 'express';

/**
 * Application-specific error with status code.
 */
export class AppError extends Error {
    constructor(
        public readonly statusCode: number,
        message: string
    ) {
        super(message);
        this.name = 'AppError';
    }
}

/**
 * Not found error (404).
 */
export class NotFoundError extends AppError {
    constructor(message: string = 'Resource not found') {
        super(404, message);
        this.name = 'NotFoundError';
    }
}

/**
 * Bad request error (400).
 */
export class BadRequestError extends AppError {
    constructor(message: string = 'Bad request') {
        super(400, message);
        this.name = 'BadRequestError';
    }
}

/**
 * Unauthorized error (401).
 */
export class UnauthorizedError extends AppError {
    constructor(message: string = 'Unauthorized') {
        super(401, message);
        this.name = 'UnauthorizedError';
    }
}

/**
 * Error response structure.
 */
interface ErrorResponse {
    error: {
        message: string;
        code: string;
        details?: unknown;
    };
}

/**
 * Global error handler middleware.
 */
export function errorHandler(
    err: Error,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    if (err instanceof NotFoundError) {
        console.warn(`[WARN] ${err.name}: ${err.message} (${req.method} ${req.path})`);
    } else {
        console.error(`[ERROR] ${err.name}: ${err.message}`);
        if (err.stack) {
            console.error(err.stack);
        }
    }

    if (err instanceof AppError) {
        const response: ErrorResponse = {
            error: {
                message: err.message,
                code: err.name,
            },
        };
        res.status(err.statusCode).json(response);
        return;
    }

    // Generic server error
    const response: ErrorResponse = {
        error: {
            message: process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : err.message,
            code: 'INTERNAL_ERROR',
        },
    };
    res.status(500).json(response);
}

/**
 * Async route handler wrapper to catch errors.
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        return Promise.resolve(fn(req, res, next)).catch(next);
    };
}
