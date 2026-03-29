export interface CognitoTokens {
    accessToken: string;
    idToken: string;
    refreshToken: string;
}
export declare class CognitoSRP {
    private readonly poolId;
    private readonly clientId;
    private readonly region;
    private readonly a;
    private readonly A;
    constructor(poolId: string, clientId: string);
    private computeU;
    private computeK;
    private computePasswordHash;
    private computeS;
    authenticate(username: string, password: string): Promise<CognitoTokens>;
    refreshTokens(refreshToken: string): Promise<CognitoTokens>;
    private formatDate;
    private cognitoRequest;
}
//# sourceMappingURL=cognito.d.ts.map