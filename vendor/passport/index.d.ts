import { RequestHandler } from 'express';
export declare function initialize(): RequestHandler;
export declare function authenticate(strategy: string, options?: any): RequestHandler;
