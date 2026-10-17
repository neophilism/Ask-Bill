/** Bounded, explicitly development-only anonymous sessions. Production uses pg-store. */
import {randomUUID} from 'node:crypto';
export class SessionError extends Error { constructor(code) { super(code); this.code=code; this.name='SessionError'; } }
export const sessionFail=code=>{throw new SessionError(code);};
export function createMemorySessionStore({stage='development',maxSessions=1000,maxPerSession=60,maxPerDay=1000,now=()=>Date.now()}={}) {
  if(stage!=='development'&&stage!=='test') sessionFail('DURABLE_SESSION_STORE_REQUIRED');
  if(![maxSessions,maxPerSession,maxPerDay].every(value=>Number.isSafeInteger(value)&&value>=1&&value<=100000))sessionFail('INVALID_SESSION_LIMIT');
  const sessions=new Map(),answers=new Map(),days=new Map();
  function prune() {
    for(const [key,value] of sessions) if(value.expiresAt<=now()){sessions.delete(key);answers.delete(key);}
    for(const key of days.keys()) if(key!==new Date(now()).toISOString().slice(0,10))days.delete(key);
  }
  const get=async tokenHash=>{prune();return sessions.get(tokenHash)??null;};
  return Object.freeze({kind:'development-memory',
    async create(record) {
      prune(); if(sessions.size>=maxSessions)sessionFail('SESSION_CAPACITY');
      const result=Object.freeze({...record,id:randomUUID(),conversationEpoch:0,requests:0});
      sessions.set(record.tokenHash,result);return result;
    }, get,
    async begin({tokenHash,conversationEpoch,kind}) {
      prune();const session=sessions.get(tokenHash);
      if(!session)sessionFail('SESSION_EXPIRED');
      if(!Number.isSafeInteger(conversationEpoch)||conversationEpoch<0||conversationEpoch>100000000||
        (kind==='conversation'?conversationEpoch<=session.conversationEpoch:conversationEpoch!==session.conversationEpoch))sessionFail('STALE_EPOCH');
      const day=new Date(now()).toISOString().slice(0,10),used=days.get(day)??0;
      if(session.requests>=maxPerSession||used>=maxPerDay)sessionFail('USAGE_LIMIT');
      days.set(day,used+1);
      const next=Object.freeze({...session,requests:session.requests+1,
        conversationEpoch:kind==='conversation'?conversationEpoch:session.conversationEpoch});
      sessions.set(tokenHash,next);return next;
    },
    async isCurrent(tokenHash,epoch) {return (await get(tokenHash))?.conversationEpoch===epoch;},
    async saveAnswer(tokenHash,answer) {
      if(!await get(tokenHash))sessionFail('SESSION_EXPIRED');
      const bucket=answers.get(tokenHash)??new Map();bucket.set(answer.answerId,answer);
      while(bucket.size>10)bucket.delete(bucket.keys().next().value);answers.set(tokenHash,bucket);
    },
    async getAnswer(tokenHash,answerId) {if(!await get(tokenHash))return null;return answers.get(tokenHash)?.get(answerId)??null;},
    async erase(tokenHash) {answers.delete(tokenHash);sessions.delete(tokenHash);},
    async cleanup() {prune();}
  });
}
