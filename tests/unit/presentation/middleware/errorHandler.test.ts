
import { Request, Response, NextFunction } from 'express';
import {
    errorHandler,
    asyncHandler,
    AppError,
    NotFoundError,
    BadRequestError,
    UnauthorizedError
} from '../../../../../src/presentation/middleware/errorHandler';

describe('Error Handling Middleware', () => {
    describe('AppError Classes', () => {
        test('AppError should set properties correctly', () => {
            const err = new AppError(418, 'I am a teapot');
            expect(err.statusCode).toBe(418);
            expect(err.message).toBe('I am a teapot');
            expect(err.name).toBe('AppError');
        });

        test('NotFoundError should default to 404', () => {
            const err = new NotFoundError();
            expect(err.statusCode).toBe(404);
            expect(err.message).toBe('Resource not found');
            expect(err.name).toBe('NotFoundError');
        });

        test('BadRequestError should default to 400', () => {
            const err = new BadRequestError('Bad input');
            expect(err.statusCode).toBe(400);
            expect(err.message).toBe('Bad input');
            expect(err.name).toBe('BadRequestError');
        });

        test('UnauthorizedError should default to 401', () => {
            const err = new UnauthorizedError();
            expect(err.statusCode).toBe(401);
            expect(err.message).toBe('Unauthorized');
            expect(err.name).toBe('UnauthorizedError');
        });
    });

    describe('errorHandler', () => {
        let req: Partial<Request>;
        let res: Partial<Response>;
        let next: NextFunction;

        beforeEach(() => {
            req = {
                method: 'GET',
                path: '/test'
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
            jest.spyOn(console, 'error').mockImplementation(() => { });
            jest.spyOn(console, 'warn').mockImplementation(() => { });
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        test('should handle AppError correctly', () => {
            const err = new BadRequestError('Invalid ID');
            errorHandler(err, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({
                error: {
                    message: 'Invalid ID',
                    code: 'BadRequestError'
                }
            });
            // AppErrors are operational, maybe not logged as ERROR? Implementation checks
            // Implementation: NotFound logs WARN, others log ERROR if not NotFound?
            // Let's check implementation behavior
        });

        test('should handle NotFoundError with warning log', () => {
            const err = new NotFoundError('User not found');
            errorHandler(err, req as Request, res as Response, next);

            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('NotFoundError: User not found (GET /test)'));
            expect(res.status).toHaveBeenCalledWith(404);
        });

        test('should handle generic Error as 500 Internal Server Error (production)', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            const err = new Error('Database connection failed');
            errorHandler(err, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: {
                    message: 'Internal server error',
                    code: 'INTERNAL_ERROR'
                }
            });
            expect(console.error).toHaveBeenCalled();

            process.env.NODE_ENV = originalEnv;
        });

        test('should show error details in non-production', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';

            const err = new Error('Database connection failed');
            errorHandler(err, req as Request, res as Response, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({
                error: {
                    message: 'Database connection failed',
                    code: 'INTERNAL_ERROR'
                }
            });

            process.env.NODE_ENV = originalEnv;
        });
    });

    describe('asyncHandler', () => {
        test('should execute the function and catch errors', async () => {
            const mockFn = jest.fn().mockRejectedValue(new Error('Async error'));
            const req = {} as Request;
            const res = {} as Response;
            const next = jest.fn();

            const wrapped = asyncHandler(mockFn);
            await wrapped(req, res, next);

            expect(mockFn).toHaveBeenCalledWith(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(Error));
        });

        test('should work with successful async function', async () => {
            const mockFn = jest.fn().mockResolvedValue(undefined);
            const req = {} as Request;
            const res = {} as Response;
            const next = jest.fn();

            const wrapped = asyncHandler(mockFn);
            await wrapped(req, res, next);

            expect(mockFn).toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });
    });
});
