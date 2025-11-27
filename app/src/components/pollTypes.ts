export type PollView = {
  id: number;
  name: string;
  options: string[];
  startTime: number;
  endTime: number;
  finalized: boolean;
  resultsPublished: boolean;
  publicResults: number[];
  userHasVoted: boolean;
};

export type PendingResult = {
  counts: number[];
  proof: `0x${string}`;
  handles: string[];
};

export type PollActionState = {
  voting?: boolean;
  finalizing?: boolean;
  decrypting?: boolean;
  publishing?: boolean;
};
