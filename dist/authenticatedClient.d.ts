import { AxiosRequestConfig, AxiosResponse, AxiosStatic } from 'axios';
/** One credential owner for polling and both recipe accessory layouts. */
export declare class AuthenticatedClient {
    private readonly login;
    private readonly http;
    private readonly now;
    private token?;
    private expiresAt;
    private loginInFlight?;
    constructor(login: () => Promise<string>, http?: Pick<AxiosStatic, 'get' | 'post'>, now?: () => number);
    getToken(): Promise<string>;
    private invalidate;
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    post<T = unknown>(url: string, data: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
    private config;
}
/** Axios errors include request headers/passwords; never log the raw object. */
export declare function requestErrorSummary(error: unknown): string;
