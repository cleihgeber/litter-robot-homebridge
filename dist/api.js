"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LitterRobotAPI = void 0;
const https_1 = __importDefault(require("https"));
const http_1 = __importDefault(require("http"));
const url_1 = require("url");
const settings_1 = require("./settings");
function request(url, options, body) {
    return new Promise((resolve, reject) => {
        const parsed = new url_1.URL(url);
        const isHttps = parsed.protocol === 'https:';
        const mod = isHttps ? https_1.default : http_1.default;
        const req = mod.request(url, {
            ...options,
            method: options.method || 'GET',
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve({ statusCode: res.statusCode || 0, data }));
        });
        req.on('error', reject);
        if (body) {
            req.write(body);
        }
        req.end();
    });
}
class LitterRobotAPI {
    constructor(log, email, password) {
        this.accessToken = '';
        this.refreshToken = '';
        this.userId = '';
        this.tokenExpiry = 0;
        this.log = log;
        this.email = email;
        this.password = password;
    }
    decodeJwtPayload(token) {
        const parts = token.split('.');
        if (parts.length < 2) {
            return {};
        }
        const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
        return JSON.parse(payload);
    }
    async authenticate() {
        const body = new URLSearchParams({
            client_id: settings_1.LR3_CLIENT_ID,
            client_secret: settings_1.LR3_CLIENT_SECRET,
            grant_type: 'password',
            username: this.email,
            password: this.password,
        }).toString();
        const resp = await request(settings_1.LR3_AUTH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-api-key': settings_1.LR3_API_KEY,
            },
        }, body);
        if (resp.statusCode !== 200) {
            throw new Error(`Authentication failed (${resp.statusCode}): ${resp.data}`);
        }
        const auth = JSON.parse(resp.data);
        this.accessToken = auth.access_token;
        this.refreshToken = auth.refresh_token;
        const decoded = this.decodeJwtPayload(this.accessToken);
        this.userId = decoded.userId || decoded.sub || '';
        this.tokenExpiry = (decoded.exp || 0) * 1000;
        if (!this.userId) {
            throw new Error('Could not extract userId from token');
        }
        this.log.info('Successfully authenticated with Whisker API');
    }
    async refreshAuth() {
        const body = new URLSearchParams({
            client_id: settings_1.LR3_CLIENT_ID,
            client_secret: settings_1.LR3_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: this.refreshToken,
        }).toString();
        const resp = await request(settings_1.LR3_AUTH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'x-api-key': settings_1.LR3_API_KEY,
            },
        }, body);
        if (resp.statusCode !== 200) {
            this.log.warn('Token refresh failed, re-authenticating...');
            return this.authenticate();
        }
        const auth = JSON.parse(resp.data);
        this.accessToken = auth.access_token;
        if (auth.refresh_token) {
            this.refreshToken = auth.refresh_token;
        }
        const decoded = this.decodeJwtPayload(this.accessToken);
        this.userId = decoded.userId || decoded.sub || this.userId;
        this.tokenExpiry = (decoded.exp || 0) * 1000;
    }
    async ensureAuth() {
        if (!this.accessToken) {
            return this.authenticate();
        }
        // Refresh if token expires within 5 minutes
        if (Date.now() > this.tokenExpiry - 5 * 60 * 1000) {
            return this.refreshAuth();
        }
    }
    async apiRequest(method, path, body) {
        await this.ensureAuth();
        const url = `${settings_1.LR3_API_BASE}${path}`;
        const headers = {
            'Authorization': `Bearer ${this.accessToken}`,
            'x-api-key': settings_1.LR3_API_KEY,
        };
        let bodyStr;
        if (body) {
            headers['Content-Type'] = 'application/json';
            bodyStr = JSON.stringify(body);
        }
        const resp = await request(url, { method, headers }, bodyStr);
        if (resp.statusCode === 401) {
            // Token expired, refresh and retry once
            await this.refreshAuth();
            const headers2 = {
                'Authorization': `Bearer ${this.accessToken}`,
                'x-api-key': settings_1.LR3_API_KEY,
            };
            if (body) {
                headers2['Content-Type'] = 'application/json';
            }
            const retry = await request(url, { method, headers: headers2 }, bodyStr);
            if (retry.statusCode >= 400) {
                throw new Error(`API request failed (${retry.statusCode}): ${retry.data}`);
            }
            return retry.data ? JSON.parse(retry.data) : null;
        }
        if (resp.statusCode >= 400) {
            throw new Error(`API request failed (${resp.statusCode}): ${resp.data}`);
        }
        return resp.data ? JSON.parse(resp.data) : null;
    }
    async getRobots() {
        const robots = await this.apiRequest('GET', `/users/${this.userId}/robots`);
        return robots;
    }
    async getRobot(robotId) {
        return await this.apiRequest('GET', `/users/${this.userId}/robots/${robotId}`);
    }
    async sendCommand(robotId, command) {
        await this.apiRequest('POST', `/users/${this.userId}/robots/${robotId}/dispatch-commands`, {
            litterRobotId: robotId,
            command: command,
        });
    }
    async patchRobot(robotId, data) {
        await this.apiRequest('PATCH', `/users/${this.userId}/robots/${robotId}`, data);
    }
}
exports.LitterRobotAPI = LitterRobotAPI;
//# sourceMappingURL=api.js.map