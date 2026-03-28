import https from 'https';
import http from 'http';
import { URL } from 'url';
import type { Logger } from 'homebridge';
import {
  LR3_AUTH_URL,
  LR3_API_BASE,
  LR3_CLIENT_ID,
  LR3_CLIENT_SECRET,
  LR3_API_KEY,
  type LitterRobot3Data,
} from './settings';

interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface TokenPayload {
  userId?: string;
  sub?: string;
  exp?: number;
}

function request(
  url: string,
  options: https.RequestOptions,
  body?: string,
): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;

    const req = mod.request(
      url,
      {
        ...options,
        method: options.method || 'GET',
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, data }));
      },
    );

    req.on('error', reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

export class LitterRobotAPI {
  private accessToken = '';
  private refreshToken = '';
  private userId = '';
  private tokenExpiry = 0;
  private readonly log: Logger;
  private readonly email: string;
  private readonly password: string;

  constructor(log: Logger, email: string, password: string) {
    this.log = log;
    this.email = email;
    this.password = password;
  }

  private decodeJwtPayload(token: string): TokenPayload {
    const parts = token.split('.');
    if (parts.length < 2) {
      return {};
    }
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  }

  async authenticate(): Promise<void> {
    const body = new URLSearchParams({
      client_id: LR3_CLIENT_ID,
      client_secret: LR3_CLIENT_SECRET,
      grant_type: 'password',
      username: this.email,
      password: this.password,
    }).toString();

    const resp = await request(LR3_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-api-key': LR3_API_KEY,
      },
    }, body);

    if (resp.statusCode !== 200) {
      throw new Error(`Authentication failed (${resp.statusCode}): ${resp.data}`);
    }

    const auth: AuthResponse = JSON.parse(resp.data);
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

  private async refreshAuth(): Promise<void> {
    const body = new URLSearchParams({
      client_id: LR3_CLIENT_ID,
      client_secret: LR3_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: this.refreshToken,
    }).toString();

    const resp = await request(LR3_AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-api-key': LR3_API_KEY,
      },
    }, body);

    if (resp.statusCode !== 200) {
      this.log.warn('Token refresh failed, re-authenticating...');
      return this.authenticate();
    }

    const auth: AuthResponse = JSON.parse(resp.data);
    this.accessToken = auth.access_token;
    if (auth.refresh_token) {
      this.refreshToken = auth.refresh_token;
    }

    const decoded = this.decodeJwtPayload(this.accessToken);
    this.userId = decoded.userId || decoded.sub || this.userId;
    this.tokenExpiry = (decoded.exp || 0) * 1000;
  }

  private async ensureAuth(): Promise<void> {
    if (!this.accessToken) {
      return this.authenticate();
    }
    // Refresh if token expires within 5 minutes
    if (Date.now() > this.tokenExpiry - 5 * 60 * 1000) {
      return this.refreshAuth();
    }
  }

  private async apiRequest(method: string, path: string, body?: unknown): Promise<unknown> {
    await this.ensureAuth();

    const url = `${LR3_API_BASE}${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken}`,
      'x-api-key': LR3_API_KEY,
    };

    let bodyStr: string | undefined;
    if (body) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
    }

    const resp = await request(url, { method, headers }, bodyStr);

    if (resp.statusCode === 401) {
      // Token expired, refresh and retry once
      await this.refreshAuth();
      const headers2: Record<string, string> = {
        'Authorization': `Bearer ${this.accessToken}`,
        'x-api-key': LR3_API_KEY,
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

  async getRobots(): Promise<LitterRobot3Data[]> {
    const robots = await this.apiRequest('GET', `/users/${this.userId}/robots`) as LitterRobot3Data[];
    return robots;
  }

  async getRobot(robotId: string): Promise<LitterRobot3Data> {
    return await this.apiRequest('GET', `/users/${this.userId}/robots/${robotId}`) as LitterRobot3Data;
  }

  async sendCommand(robotId: string, command: string): Promise<void> {
    await this.apiRequest('POST', `/users/${this.userId}/robots/${robotId}/dispatch-commands`, {
      litterRobotId: robotId,
      command: command,
    });
  }

  async patchRobot(robotId: string, data: Partial<LitterRobot3Data>): Promise<void> {
    await this.apiRequest('PATCH', `/users/${this.userId}/robots/${robotId}`, data);
  }
}
