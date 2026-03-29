import https from 'https';
import http from 'http';
import { URL } from 'url';
import type { Logger } from 'homebridge';
import { CognitoSRP } from './cognito';
import {
  LR3_API_BASE,
  LR3_API_KEY,
  COGNITO_USER_POOL_ID,
  COGNITO_CLIENT_ID,
  type LitterRobot3Data,
} from './settings';

interface TokenPayload {
  userId?: string;
  'custom:userId'?: string;
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
  private idToken = '';
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
    const cognito = new CognitoSRP(COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID);
    const tokens = await cognito.authenticate(this.email, this.password);

    this.accessToken = tokens.accessToken;
    this.idToken = tokens.idToken;
    this.refreshToken = tokens.refreshToken;

    const decoded = this.decodeJwtPayload(this.idToken);
    this.userId = decoded['custom:userId'] || decoded.userId || decoded.sub || '';
    this.tokenExpiry = (decoded.exp || 0) * 1000;

    if (!this.userId) {
      throw new Error('Could not extract userId from token');
    }

    this.log.info('Successfully authenticated with Whisker API');
  }

  private async refreshAuth(): Promise<void> {
    try {
      const cognito = new CognitoSRP(COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID);
      const tokens = await cognito.refreshTokens(this.refreshToken);

      this.accessToken = tokens.accessToken;
      this.idToken = tokens.idToken;

      const decoded = this.decodeJwtPayload(this.idToken);
      this.userId = decoded['custom:userId'] || decoded.userId || decoded.sub || this.userId;
      this.tokenExpiry = (decoded.exp || 0) * 1000;
    } catch {
      this.log.warn('Token refresh failed, re-authenticating...');
      return this.authenticate();
    }
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
      'Authorization': this.idToken,
      'x-api-key': LR3_API_KEY,
    };

    let bodyStr: string | undefined;
    if (body) {
      headers['Content-Type'] = 'application/json';
      bodyStr = JSON.stringify(body);
    }

    const resp = await request(url, { method, headers }, bodyStr);

    if (resp.statusCode === 401) {
      await this.refreshAuth();
      const headers2: Record<string, string> = {
        'Authorization': this.idToken,
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
