"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitoSRP = void 0;
const crypto_1 = __importDefault(require("crypto"));
// AWS Cognito SRP constants
const N_HEX = 'FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1' +
    '29024E088A67CC74020BBEA63B139B22514A08798E3404DD' +
    'EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245' +
    'E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED' +
    'EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D' +
    'C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F' +
    '83655D23DCA3AD961C62F356208552BB9ED529077096966D' +
    '670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B' +
    'E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9' +
    'DE2BCBF6955817183995497CEA956AE515D2261898FA0510' +
    '15728E5A8AAAC42DAD33170D04507A33A85521ABDF1CBA64' +
    'ECFB850458DBEF0A8AEA71575D060C7DB3970F85A6E1E4C7' +
    'ABF5AE8CDB0933D71E8C94E04A25619DCEE3D2261AD2EE6B' +
    'F12FFA06D98A0864D87602733EC86A64521F2B18177B200CB' +
    'BE117577A615D6C770988C0BAD946E208E24FA074E5AB3143' +
    'DB5BFCE0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF';
const G_HEX = '2';
const INFO_BITS = 'Caldera Derived Key';
const N = BigInt('0x' + N_HEX);
const g = BigInt('0x' + G_HEX);
function hexToBytes(hex) {
    return Buffer.from(hex, 'hex');
}
function bigIntToHex(n) {
    let hex = n.toString(16);
    if (hex.length % 2 !== 0) {
        hex = '0' + hex;
    }
    return hex;
}
function bigIntToBytes(n) {
    return hexToBytes(bigIntToHex(n));
}
function hash(data) {
    return crypto_1.default.createHash('sha256').update(data).digest();
}
function hexHash(hexStr) {
    return hash(Buffer.from(hexStr, 'hex')).toString('hex');
}
function padHex(n) {
    let hex = bigIntToHex(n);
    if (hex.length % 2 !== 0) {
        hex = '0' + hex;
    }
    if ('89ABCDEFabcdef'.includes(hex[0])) {
        hex = '00' + hex;
    }
    return hex;
}
function modPow(base, exp, mod) {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
        if (exp % 2n === 1n) {
            result = (result * base) % mod;
        }
        exp = exp / 2n;
        base = (base * base) % mod;
    }
    return result;
}
function computeHkdf(ikm, salt) {
    const prk = crypto_1.default.createHmac('sha256', salt).update(ikm).digest();
    const infoBitsBuffer = Buffer.concat([
        Buffer.from(INFO_BITS, 'utf8'),
        Buffer.from([1]),
    ]);
    const hmac = crypto_1.default.createHmac('sha256', prk).update(infoBitsBuffer).digest();
    return hmac.subarray(0, 16);
}
class CognitoSRP {
    constructor(poolId, clientId) {
        this.poolId = poolId;
        this.clientId = clientId;
        this.region = poolId.split('_')[0];
        // Generate random 'a' and compute A = g^a mod N
        const randomBytes = crypto_1.default.randomBytes(128);
        this.a = BigInt('0x' + randomBytes.toString('hex'));
        this.A = modPow(g, this.a, N);
    }
    computeU(A, B) {
        const uHex = hexHash(padHex(A) + padHex(B));
        return BigInt('0x' + uHex);
    }
    computeK() {
        const kHex = hexHash(padHex(N) + padHex(g));
        return BigInt('0x' + kHex);
    }
    computePasswordHash(userPoolName, username, password) {
        return hash(Buffer.from(userPoolName + username + ':' + password, 'utf8'));
    }
    computeS(B, salt, passwordHash) {
        const u = this.computeU(this.A, B);
        const k = this.computeK();
        const x = BigInt('0x' + hexHash(padHex(salt) + passwordHash.toString('hex')));
        const base = ((B - k * modPow(g, x, N)) % N + N) % N;
        return modPow(base, this.a + u * x, N);
    }
    async authenticate(username, password) {
        const userPoolName = this.poolId.split('_')[1];
        const endpoint = `https://cognito-idp.${this.region}.amazonaws.com/`;
        // Step 1: InitiateAuth with SRP_A
        const initBody = JSON.stringify({
            AuthFlow: 'USER_SRP_AUTH',
            ClientId: this.clientId,
            AuthParameters: {
                USERNAME: username,
                SRP_A: bigIntToHex(this.A),
            },
        });
        const initResp = await this.cognitoRequest(endpoint, 'AWSCognitoIdentityProviderService.InitiateAuth', initBody);
        if (initResp.statusCode !== 200) {
            throw new Error(`Cognito InitiateAuth failed (${initResp.statusCode}): ${initResp.data}`);
        }
        const initResult = JSON.parse(initResp.data);
        const challengeParams = initResult.ChallengeParameters;
        const serverB = BigInt('0x' + challengeParams.SRP_B);
        const salt = BigInt('0x' + challengeParams.SALT);
        const secretBlock = challengeParams.SECRET_BLOCK;
        const cognitoUsername = challengeParams.USER_ID_FOR_SRP;
        // Step 2: Compute password claim
        const passwordHash = this.computePasswordHash(userPoolName, cognitoUsername, password);
        const S = this.computeS(serverB, salt, passwordHash);
        const hkdf = computeHkdf(bigIntToBytes(S), bigIntToBytes(this.computeU(this.A, serverB)));
        const now = new Date();
        const dateStr = this.formatDate(now);
        const msg = Buffer.concat([
            Buffer.from(userPoolName, 'utf8'),
            Buffer.from(cognitoUsername, 'utf8'),
            Buffer.from(secretBlock, 'base64'),
            Buffer.from(dateStr, 'utf8'),
        ]);
        const signature = crypto_1.default
            .createHmac('sha256', hkdf)
            .update(msg)
            .digest('base64');
        // Step 3: RespondToAuthChallenge
        const respBody = JSON.stringify({
            ChallengeName: 'PASSWORD_VERIFIER',
            ClientId: this.clientId,
            ChallengeResponses: {
                USERNAME: cognitoUsername,
                PASSWORD_CLAIM_SECRET_BLOCK: secretBlock,
                PASSWORD_CLAIM_SIGNATURE: signature,
                TIMESTAMP: dateStr,
            },
        });
        const authResp = await this.cognitoRequest(endpoint, 'AWSCognitoIdentityProviderService.RespondToAuthChallenge', respBody);
        if (authResp.statusCode !== 200) {
            throw new Error(`Cognito auth challenge failed (${authResp.statusCode}): ${authResp.data}`);
        }
        const authResult = JSON.parse(authResp.data).AuthenticationResult;
        return {
            accessToken: authResult.AccessToken,
            idToken: authResult.IdToken,
            refreshToken: authResult.RefreshToken,
        };
    }
    async refreshTokens(refreshToken) {
        const endpoint = `https://cognito-idp.${this.region}.amazonaws.com/`;
        const body = JSON.stringify({
            AuthFlow: 'REFRESH_TOKEN_AUTH',
            ClientId: this.clientId,
            AuthParameters: {
                REFRESH_TOKEN: refreshToken,
            },
        });
        const resp = await this.cognitoRequest(endpoint, 'AWSCognitoIdentityProviderService.InitiateAuth', body);
        if (resp.statusCode !== 200) {
            throw new Error(`Cognito token refresh failed (${resp.statusCode}): ${resp.data}`);
        }
        const result = JSON.parse(resp.data).AuthenticationResult;
        return {
            accessToken: result.AccessToken,
            idToken: result.IdToken,
            refreshToken: refreshToken, // Cognito doesn't return a new refresh token
        };
    }
    formatDate(date) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const day = days[date.getUTCDay()];
        const month = months[date.getUTCMonth()];
        const dateNum = date.getUTCDate();
        const hours = String(date.getUTCHours()).padStart(2, '0');
        const minutes = String(date.getUTCMinutes()).padStart(2, '0');
        const seconds = String(date.getUTCSeconds()).padStart(2, '0');
        const year = date.getUTCFullYear();
        return `${day} ${month} ${dateNum} ${hours}:${minutes}:${seconds} UTC ${year}`;
    }
    cognitoRequest(endpoint, target, body) {
        return new Promise((resolve, reject) => {
            const url = new (require('url').URL)(endpoint);
            const req = require('https').request(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-amz-json-1.1',
                    'X-Amz-Target': target,
                },
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => resolve({ statusCode: res.statusCode || 0, data }));
            });
            req.on('error', reject);
            req.write(body);
            req.end();
        });
    }
}
exports.CognitoSRP = CognitoSRP;
//# sourceMappingURL=cognito.js.map