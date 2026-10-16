/** Design contracts for AB-003. Production needs runtime validation as well. */
export type Id = string;
export type Sha256 = string;
export type IsoTime = string;
export type ClaimKind = 'bill_text' | 'current_law' | 'interpretation' |
  'hypothetical' | 'prediction' | 'attributed_position' | 'unknown';
export type SupportState = 'supported' | 'qualified' | 'disputed' |
  'incomplete_source' | 'unavailable';

export interface SourceVersion {
  id: Id;
  billId: Id;
  publisherId: Id;
  language: string;
  status: 'draft' | 'introduced' | 'amended' | 'passed_one_chamber' |
    'enacted' | 'effective' | 'repealed' | 'unknown';
  rawByteHash: Sha256;
  canonicalTextHash: Sha256;
  canonicalizationVersion: string;
  sourceUrl?: string;
  retrievedAt: IsoTime;
  publishedAt?: IsoTime;
  effectiveAt?: IsoTime;
  sourceComplete: boolean;
  publication: 'private' | 'reviewed' | 'published' | 'withdrawn';
}

export interface SourceSpan {
  sourceVersionId: Id;
  provisionId: Id;
  /** Unicode code point indices in canonical provision text, end exclusive. */
  start: number;
  end: number;
  quote: string;
  quoteHash: Sha256;
  citationLabel: string;
  originalLocator: { page?: number; xmlId?: string; sourceRange?: string };
}

export interface Claim {
  id: Id;
  kind: ClaimKind;
  text: string;
  support: SupportState;
  spans: SourceSpan[];
  qualifications: string[];
  attribution?: string;
  asOf?: IsoTime;
  jurisdiction?: string;
  /** Required for any quantitative prediction accepted for presentation. */
  estimateMethod?: { description: string; inputSpanIds: Id[] };
}

export interface ValidatedSegment {
  id: Id;
  text: string;
  claimIds: Id[];
  claims: Claim[];
  versionId: Id;
  validation: {
    schema: string;
    retrievalConfig: Sha256;
    promptConfig: Sha256;
    validatorConfig: Sha256;
    validatedAt: IsoTime;
  };
}

/** Model/server cues have semantic targets only; unknown keys are rejected. */
export type SemanticCue =
  | { type: 'reference'; segmentId: Id; claimId: Id; spanIndex: number }
  | { type: 'emphasize'; segmentId: Id; claimId: Id }
  | { type: 'acknowledge'; segmentId: Id }
  | { type: 'uncertain'; segmentId: Id; claimId: Id };

export type AnswerEventPayload =
  | { type: 'answer.started' }
  | { type: 'segment.validated'; segment: ValidatedSegment }
  | { type: 'citation.ready'; span: SourceSpan }
  | { type: 'performance.cue'; cue: SemanticCue }
  | { type: 'speech.ready'; audioId: Id; segmentId: Id }
  | { type: 'correction'; replacesSegmentId: Id; segment: ValidatedSegment }
  | { type: 'answer.completed' }
  | { type: 'answer.cancelled' }
  | { type: 'answer.failed'; code: string; recovery: string };

export type AnswerEvent = AnswerEventPayload & {
  schemaVersion: 1;
  answerId: Id;
  sequence: number;
  conversationEpoch: number;
  documentVersion: Id;
  createdAt: IsoTime;
};

export interface EvidenceBundle {
  versionId: Id;
  sourceHashes: Sha256[];
  questionKind: ClaimKind;
  included: SourceSpan[];
  dependencyExpansions: { fromProvisionId: Id; toProvisionId: Id; reason: string }[];
  unresolvedReferences: string[];
  retrievalConfig: Sha256;
}

export interface AudioSegment {
  id: Id;
  segmentId: Id;
  validatedTextHash: Sha256;
  voiceConfigHash: Sha256;
  audioHash: Sha256;
  durationSeconds: number;
  sampleRate: number;
  codec: string;
  wordTiming: { canonicalStart: number; canonicalEnd: number; from: number; to: number }[];
  visemes: { label: string; from: number; to: number; weight?: number }[];
  alignment: 'provider' | 'forced_alignment' | 'approximate' | 'none';
  expiresAt?: IsoTime;
}

/** Client-measured geometry. This type is never accepted from an LLM. */
export interface LayoutSurface {
  id: Id;
  provisionId: Id;
  versionId: Id;
  layoutRevision: number;
  pageRect: { x: number; y: number; width: number; height: number };
  contactY: number;
  allowed: ('walk' | 'stand' | 'step' | 'point')[];
  obstacleRects: { x: number; y: number; width: number; height: number }[];
}

export interface LocalPerformancePlan {
  answerId: Id;
  conversationEpoch: number;
  versionId: Id;
  layoutRevision: number;
  sourceCue: SemanticCue;
  animationManifestHash: Sha256;
  waypoints: { x: number; y: number; surfaceId: Id }[];
  fallback: 'dock' | 'poster' | 'hidden';
}

export interface CharacterManifest {
  assetVersion: string;
  sourceBlenderHash: Sha256;
  toolchainHash: Sha256;
  compatibility: { minContractVersion: number; maxContractVersion: number };
  lods: { name: 'low' | 'medium' | 'high'; uri: string; hash: Sha256;
    transferBytes: number; triangles: number; materialCount: number }[];
  clips: { name: string; duration: number; loop: boolean;
    contacts: { time: number; foot: 'left' | 'right'; down: boolean }[];
    nominalStride?: number; upperBodyMask?: string }[];
  morphs: string[];
  mouthMappingVersion: string;
  poster: { uri: string; hash: Sha256 };
  provenanceFile: string;
}

export interface LlmAdapter {
  capabilities(): { structuredOutput: boolean; cancellation: boolean };
  generate(input: { bundle: EvidenceBundle; question: string;
    language: string; readingLevel: string; signal: AbortSignal }): Promise<unknown>;
}
export interface TtsAdapter {
  synthesize(input: { segment: ValidatedSegment; voiceConfig: string;
    signal: AbortSignal }): Promise<AudioSegment>;
}
export interface SttAdapter {
  transcribe(input: { audio: Uint8Array; codec: string;
    signal: AbortSignal }): Promise<{ text: string; language?: string }>;
}

/** AB-003 must implement checks beyond static typing:
 * - UUID/hash/time formats, length limits, no unknown cue keys.
 * - Claim source authority, exact code-point range and quote match.
 * - Current-law dates/jurisdiction; prediction method/evidence.
 * - Epoch/version/replay sequence, publisher authorization.
 * - Safe URL origin, allowed asset URI and no arbitrary CSS/script.
 * - Audio duration/alignment bounds and validated text mapping.
 */
