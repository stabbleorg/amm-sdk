import { EnrichedTransaction } from "helius-sdk";

export enum TransactionVariant {
  CREATE = "create",
  CLOSE = "close",
  SWAP = "swap",
  DEPOSIT = "deposit",
  WITHDRAW = "withdraw",
  SWAP_V2 = "swap_v2",
  DEPOSIT_V2 = "deposit_v2",
  WITHDRAW_V2 = "withdraw_v2",
}

export type PoolActivity = {
  address: string;
  userAddress: string | null;
  tokenAddress: string;
  amount: number;
  variant: TransactionVariant;
};

export type CreatePool = {
  address: string;
  tokenAddress: string;
  tokenAddresses: string[];
  variant: TransactionVariant;
};

export type ClosePool = {
  address: string;
  variant: TransactionVariant;
};

export type InstructionLog<T> = {
  signature: string;
  instructionIndex: number;
  parentProgramId: string | null;
  programId: string;
} & T;

export type ParsedTransactions = {
  creates: InstructionLog<CreatePool>[];
  closes: InstructionLog<ClosePool>[];
  poolActivities: InstructionLog<PoolActivity>[];
};
