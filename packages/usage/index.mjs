/** AB-034: strict privacy-preserving usage identifiers and budget policy. */
import {createHash,randomBytes} from 'node:crypto';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class UsageError extends Error {constructor(code){super(code);this.name='UsageError';this.code=code;}}
const fail=code=>{throw new UsageError(code)};
export function publisherId(value){if(typeof value!=='string'||!uuid.test(value))fail('INVALID_PUBLISHER');return value.toLowerCase()}
export function boundedUnits(value){if(!Number.isSafeInteger(value)||value<0||value>1000000)fail('INVALID_UNITS');return value}
export function requestKey(value){if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(value))fail('INVALID_REQUEST_KEY');return value}
export function capabilityDigest(token){if(typeof token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(token))fail('INVALID_SESSION_CAPABILITY');return createHash('sha256').update(token).digest('hex')}
export function newAnonymousCapability(){const token=randomBytes(32).toString('base64url');return Object.freeze({token,digest:capabilityDigest(token)})}
export function quotaPolicy(input={}){const {perSession=10000,global=100000,enabled=false}=input;if(![perSession,global].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=100000000))fail('INVALID_QUOTA');if(typeof enabled!=='boolean')fail('INVALID_FLAG');return Object.freeze({perSession,global,enabled})}
export function publicReadingAvailable(){return true}
