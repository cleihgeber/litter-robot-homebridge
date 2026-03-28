import type { Logger } from 'homebridge';
import { type LitterRobot3Data } from './settings';
export declare class LitterRobotAPI {
    private accessToken;
    private refreshToken;
    private userId;
    private tokenExpiry;
    private readonly log;
    private readonly email;
    private readonly password;
    constructor(log: Logger, email: string, password: string);
    private decodeJwtPayload;
    authenticate(): Promise<void>;
    private refreshAuth;
    private ensureAuth;
    private apiRequest;
    getRobots(): Promise<LitterRobot3Data[]>;
    getRobot(robotId: string): Promise<LitterRobot3Data>;
    sendCommand(robotId: string, command: string): Promise<void>;
    patchRobot(robotId: string, data: Partial<LitterRobot3Data>): Promise<void>;
}
//# sourceMappingURL=api.d.ts.map