import https from 'https';
import http from 'http';
import { URL as NodeURL } from 'url';
import { HttpsProxyAgent } from 'https-proxy-agent';

/**
 * PBASS API Client (Ported from OneInv)
 * Handles communication with external PBASS API (cross-LAN) with Proxy support
 */

export interface PBASSResponse {
    success: boolean;
    data?: any[];
    error?: string;
    count?: number;
}

class PBASSClient {
    private baseUrl: string;
    private timeout: number;
    private ignoreSSL: boolean;

    constructor() {
        this.baseUrl = process.env.PBASS_STOCK_API_URL || process.env.PBASS_INVOICE_API_URL || process.env.PBASS_API_URL || '';
        this.timeout = parseInt(process.env.PBASS_API_TIMEOUT || '30000');
        this.ignoreSSL = process.env.PBASS_API_IGNORE_SSL === 'true';
    }

    /**
     * Get proxy agent if proxy is configured
     */
    /**
     * Get proxy agent if proxy is configured
     */
    private getProxyAgent(url?: string) {
        const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
        if (!proxyUrl) {
            return null;
        }

        // Check NO_PROXY
        if (url) {
            const noProxy = process.env.NO_PROXY || '';
            const hostname = new NodeURL(url).hostname;
            const noProxyList = noProxy.split(',').map(s => s.trim());

            // Simple robust check: exact match or domain suffix or IP
            const isNoProxy = noProxyList.some(np => {
                if (!np) return false;
                if (np === hostname) return true;
                if (np.startsWith('.') && hostname.endsWith(np)) return true;
                return false;
            });

            // Auto-bypass for .local domains
            if (hostname.endsWith('.local')) {
                console.log(`🚫 Bypassing proxy for ${hostname} (.local domain)`);
                return null;
            }

            if (isNoProxy) {
                console.log(`🚫 Bypassing proxy for ${hostname} (matched NO_PROXY)`);
                return null;
            }
        }

        try {
            console.log(`🌐 Using proxy: ${proxyUrl.replace(/:[^:@]+@/, ':***@')}`); // Hide password

            return new HttpsProxyAgent(proxyUrl, {
                rejectUnauthorized: !this.ignoreSSL
            });
        } catch (error) {
            console.warn('⚠️ Failed to create proxy agent:', error);
            return null;
        }
    }

    /**
     * Fetch data from PBASS API
     * @param filters Optional filters (e.g., date range, status)
     */
    async fetchData(filters?: {
        startDate?: string;
        endDate?: string;
        customUrl?: string; // Allow overriding the URL
        customToken?: string; // Allow overriding the Token
        params?: Record<string, string>;
    }): Promise<PBASSResponse> {
        try {
            const finalBaseUrl = filters?.customUrl || this.baseUrl;
            if (!finalBaseUrl) {
                return {
                    success: false,
                    error: 'PBASS_STOCK_API_URL is not configured'
                };
            }

            // Build query parameters
            const params = new URLSearchParams();
            if (filters?.startDate) params.append('start_date', filters.startDate);
            if (filters?.endDate) params.append('end_date', filters.endDate);

            // Add custom params
            if (filters?.params) {
                Object.entries(filters.params).forEach(([key, value]) => {
                    params.append(key, value);
                });
            }

            const url = params.toString()
                ? `${finalBaseUrl}${finalBaseUrl.includes('?') ? '&' : '?'}${params.toString()}`
                : finalBaseUrl;

            console.log('🔗 Fetching from PBASS API:', url);
            const parsedUrl = new NodeURL(url);
            const isHttps = parsedUrl.protocol === 'https:';
            const transport = isHttps ? https : http;

            const options: any = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || (isHttps ? 443 : 80),
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'curl/8.16.0',
                    'Authorization': `Bearer ${filters?.customToken || process.env.PBASS_STOCK_API_TOKEN || process.env.PBASS_API_TOKEN || ''}`
                },
                timeout: this.timeout,
            };

            if (isHttps) {
                options.rejectUnauthorized = !this.ignoreSSL;
            }

            // Add proxy agent if configured
            const agent = this.getProxyAgent(url);
            if (agent) {
                options.agent = agent;
                console.log('🌐 Using proxy agent');
            } else if (isHttps && this.ignoreSSL) {
                // Create custom agent to ignore SSL
                options.agent = new https.Agent({
                    rejectUnauthorized: false
                });
                console.log('🔓 SSL verification disabled');
            }

            const result = await new Promise<PBASSResponse>((resolve, reject) => {
                const req = transport.request(options, (res: any) => {
                    let data = '';

                    res.on('data', (chunk: any) => {
                        data += chunk;
                    });

                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                reject(new Error(`PBASS API returned ${res.statusCode}: ${res.statusMessage}`));
                                return;
                            }

                            console.log('📦 PBASS API Raw Response (first 100 chars):', data.substring(0, 100));

                            let jsonData: any;
                            try {
                                jsonData = JSON.parse(data);
                                // If the response is a string containing JSON, parse it again
                                if (typeof jsonData === 'string') {
                                    console.log('ℹ️ Detected double-encoded JSON string, parsing again...');
                                    jsonData = JSON.parse(jsonData);
                                }
                            } catch (e) {
                                console.error('❌ Failed to parse PBASS API response:', e);
                                throw new Error('Invalid JSON response from PBASS API');
                            }

                            // Robust way to find records: search recursively for the largest array
                            const findLargestArray = (obj: any): any[] => {
                                if (Array.isArray(obj)) return obj;
                                if (!obj || typeof obj !== 'object') return [];

                                let largest: any[] = [];
                                for (const key in obj) {
                                    const value = obj[key];
                                    if (Array.isArray(value)) {
                                        if (value.length > largest.length) largest = value;
                                    } else if (value && typeof value === 'object') {
                                        const sub = findLargestArray(value);
                                        if (sub.length > largest.length) largest = sub;
                                    }
                                }
                                return largest;
                            };

                            const records = findLargestArray(jsonData);
                            console.log(`✅ Extracted ${records.length} records from response`);

                            if (records.length === 0) {
                                console.warn('⚠️ No array of records found in response structure:', jsonData);
                            }

                            resolve({
                                success: true,
                                data: records,
                                count: records.length,
                            });
                        } catch (error: any) {
                            reject(new Error(`Failed to parse response: ${error.message}`));
                        }
                    });
                });

                req.on('error', (error: any) => {
                    reject(error);
                });

                req.on('timeout', () => {
                    req.destroy();
                    reject(new Error(`Request timeout after ${this.timeout}ms`));
                });

                req.end();
            });

            return result;

        } catch (error: any) {
            console.error('❌ PBASS API Error:', error);

            // Provide more helpful error messages
            let errorMessage = error.message || 'Unknown error occurred';

            if (error.code === 'ENOTFOUND') {
                errorMessage = `DNS resolution failed for ${this.baseUrl}. Check network connectivity.`;
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage = `Connection refused to ${this.baseUrl}. Server may be down or firewall blocking.`;
            } else if (error.code === 'ETIMEDOUT' || error.code === 'UND_ERR_CONNECT_TIMEOUT') {
                errorMessage = `Connection timeout. Check proxy settings and network routing.`;
            } else if (error.code === 'ERR_INVALID_PROXY_URL') {
                errorMessage = `Invalid proxy URL. Check HTTPS_PROXY environment variable.`;
            } else if (error.message?.includes('407')) {
                errorMessage = `Proxy authentication required. Check proxy username/password.`;
            }

            return {
                success: false,
                error: errorMessage,
            };
        }
    }
}

// Export singleton instance
export const pbassClient = new PBASSClient();
export default pbassClient;
