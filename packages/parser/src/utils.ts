import bs58 from "bs58";
import { InnerInstruction, Instruction, TokenStandard, TokenTransfer } from "helius-sdk";
import {
  burnInstructionData,
  burnCheckedInstructionData,
  mintToInstructionData,
  mintToCheckedInstructionData,
  transferInstructionData,
  transferCheckedInstructionData,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { STABLE_SWAP_PROGRAM_ID, WEIGHTED_SWAP_PROGRAM_ID } from "@stabbleorg/amm-sdk";
import { SafeAmount } from "@stabbleorg/anchor-contrib";
import { ClosePool, CreatePool, PoolActivity, TokenTransferWithU64, TransactionVariant } from "./types";
import { TokenTransferNotFound } from "./errors";

const TOKEN_2022_PROGRAM_ADDRESS = TOKEN_2022_PROGRAM_ID.toBase58();
const TOKEN_PROGRAM_ADDRESS = TOKEN_PROGRAM_ID.toBase58();

const STABLE_SWAP_ADDRESS = STABLE_SWAP_PROGRAM_ID.toBase58();
const WEIGHTED_SWAP_ADDRESS = WEIGHTED_SWAP_PROGRAM_ID.toBase58();

const DISCRIMINATORS: Record<string, TransactionVariant> = {
  afaf6d1f0d989bed: TransactionVariant.CREATE,
  "92ccf1d55615fdd3": TransactionVariant.CLOSE,
  f8c69e91e17587c8: TransactionVariant.SWAP,
  "2b04ed0b1ac91e62": TransactionVariant.SWAP_V2,
  f223c68952e1f2b6: TransactionVariant.DEPOSIT,
  b712469c946da122: TransactionVariant.WITHDRAW,
};

const EMPTY_TOKEN_TRANSFER: TokenTransferWithU64 = {
  fromUserAccount: null,
  toUserAccount: null,
  fromTokenAccount: null,
  toTokenAccount: null,
  tokenAmount: 0,
  rawAmount: "0",
  decimals: -1,
  tokenStandard: TokenStandard.FUNGIBLE,
  mint: "",
};

export function getTransactionVariant(instruction: Instruction | InnerInstruction): TransactionVariant | null {
  if (instruction.programId !== WEIGHTED_SWAP_ADDRESS && instruction.programId !== STABLE_SWAP_ADDRESS) {
    return null;
  }

  return DISCRIMINATORS[Buffer.from(Array.from(bs58.decode(instruction.data)).slice(0, 8)).toString("hex")] ?? null;
}

export function getTokenBurnFromInnerInstruction(
  tokenTransfers: TokenTransfer[],
  innerInstruction: InnerInstruction,
  mintDecimals: Map<string, number>,
): TokenTransferWithU64 | null {
  let rawAmount, transfer;
  const buffer = Buffer.from(Array.from(bs58.decode(innerInstruction.data)));

  if (buffer.length === 9) {
    const data = burnInstructionData.decode(buffer);

    rawAmount = data.amount.toString();
    transfer = tokenTransfers.find(
      (transfer) =>
        transfer.tokenAmount === SafeAmount.toUiAmount(data.amount, mintDecimals.get(transfer.mint)!) &&
        transfer.mint === innerInstruction.accounts[1] &&
        transfer.fromTokenAccount === innerInstruction.accounts[0] &&
        transfer.fromUserAccount === innerInstruction.accounts[2],
    );
  } else if (buffer.length === 10) {
    const data = burnCheckedInstructionData.decode(buffer);

    rawAmount = data.amount.toString();
    transfer = tokenTransfers.find(
      (transfer) =>
        transfer.tokenAmount === SafeAmount.toUiAmount(data.amount, mintDecimals.get(transfer.mint)!) &&
        transfer.mint === innerInstruction.accounts[1] &&
        transfer.fromTokenAccount === innerInstruction.accounts[0] &&
        transfer.fromUserAccount === innerInstruction.accounts[2],
    );
  }

  return transfer && rawAmount ? { ...transfer, rawAmount } : null;
}

export function getTokenMintToFromInnerInstruction(
  tokenTransfers: TokenTransfer[],
  innerInstruction: InnerInstruction,
  mintDecimals: Map<string, number>,
): TokenTransferWithU64 | null {
  let rawAmount, transfer;
  const buffer = Buffer.from(Array.from(bs58.decode(innerInstruction.data)));

  if (buffer.length === 9) {
    const data = mintToInstructionData.decode(buffer);

    rawAmount = data.amount.toString();
    transfer = tokenTransfers.find(
      (transfer) =>
        transfer.tokenAmount === SafeAmount.toUiAmount(data.amount, mintDecimals.get(transfer.mint)!) &&
        transfer.mint === innerInstruction.accounts[0] &&
        transfer.toTokenAccount === innerInstruction.accounts[1],
    );
  } else if (buffer.length === 10) {
    const data = mintToCheckedInstructionData.decode(buffer);

    rawAmount = data.amount.toString();
    transfer = tokenTransfers.find(
      (transfer) =>
        transfer.tokenAmount === SafeAmount.toUiAmount(data.amount, mintDecimals.get(transfer.mint)!) &&
        transfer.mint === innerInstruction.accounts[0] &&
        transfer.toTokenAccount === innerInstruction.accounts[1],
    );
  }

  return transfer && rawAmount ? { ...transfer, rawAmount } : null;
}

export function getTokenTransferFromInnerInstruction(
  tokenTransfers: TokenTransfer[],
  innerInstruction: InnerInstruction,
  mintDecimals: Map<string, number>,
): TokenTransferWithU64 | null {
  let rawAmount, transfer;
  const buffer = Buffer.from(Array.from(bs58.decode(innerInstruction.data)));

  if (buffer.length === 9) {
    const data = transferInstructionData.decode(buffer);

    if (data.amount === BigInt(0)) {
      return EMPTY_TOKEN_TRANSFER;
    }

    rawAmount = data.amount.toString();
    transfer = tokenTransfers.find(
      (transfer) =>
        transfer.tokenAmount === SafeAmount.toUiAmount(data.amount, mintDecimals.get(transfer.mint)!) &&
        transfer.fromTokenAccount === innerInstruction.accounts[0] &&
        transfer.toTokenAccount === innerInstruction.accounts[1],
    );
  } else if (buffer.length === 10) {
    const data = transferCheckedInstructionData.decode(buffer);

    if (data.amount === BigInt(0)) {
      return EMPTY_TOKEN_TRANSFER;
    }

    rawAmount = data.amount.toString();
    transfer = tokenTransfers.find(
      (transfer) =>
        transfer.tokenAmount === SafeAmount.toUiAmount(data.amount, mintDecimals.get(transfer.mint)!) &&
        transfer.fromTokenAccount === innerInstruction.accounts[0] &&
        transfer.toTokenAccount === innerInstruction.accounts[2],
    );
  }

  return transfer && rawAmount ? { ...transfer, rawAmount } : null;
}

export function parseSwap(
  instruction: Instruction,
  tokenTransfers: TokenTransfer[],
  mintDecimals: Map<string, number>,
): PoolActivity[] {
  const activities: PoolActivity[] = [];

  const variant =
    instruction.accounts.findIndex((key) => key === TOKEN_2022_PROGRAM_ADDRESS) === -1
      ? TransactionVariant.SWAP
      : TransactionVariant.SWAP_V2;
  const poolAddress = variant === TransactionVariant.SWAP ? instruction.accounts[6] : instruction.accounts[8];

  const transferIn = getTokenTransferFromInnerInstruction(
    tokenTransfers,
    instruction.innerInstructions[0],
    mintDecimals,
  );
  if (!transferIn) throw TokenTransferNotFound;

  let transferOut: TokenTransferWithU64 | null;
  if (
    instruction.innerInstructions[2].programId === instruction.innerInstructions[3]?.programId &&
    instruction.innerInstructions[2].accounts[0] === instruction.innerInstructions[3].accounts[0]
  ) {
    const transferBeneficiary = getTokenTransferFromInnerInstruction(
      tokenTransfers,
      instruction.innerInstructions[2],
      mintDecimals,
    );
    if (!transferBeneficiary) throw TokenTransferNotFound;

    activities.push({
      address: poolAddress,
      tokenAddress: transferBeneficiary.mint,
      userAddress: null,
      amount: -transferBeneficiary.tokenAmount,
      amountU64: "-" + transferBeneficiary.rawAmount,
      variant,
    });

    transferOut = getTokenTransferFromInnerInstruction(tokenTransfers, instruction.innerInstructions[3], mintDecimals);
  } else {
    transferOut = getTokenTransferFromInnerInstruction(tokenTransfers, instruction.innerInstructions[2], mintDecimals);
  }

  if (!transferOut) throw TokenTransferNotFound;

  activities.push(
    {
      address: poolAddress,
      tokenAddress: transferIn.mint,
      userAddress: transferIn.fromUserAccount,
      amountU64: transferIn.rawAmount,
      amount: transferIn.tokenAmount,
      variant,
    },
    {
      address: poolAddress,
      tokenAddress: transferOut.mint,
      userAddress: transferOut.toUserAccount,
      amountU64: "-" + transferOut.rawAmount,
      amount: -transferOut.tokenAmount,
      variant,
    },
  );

  return activities;
}

export function parseDeposit(
  instruction: Instruction,
  tokenTransfers: TokenTransfer[],
  mintDecimals: Map<string, number>,
): PoolActivity[] {
  const activities: PoolActivity[] = [];

  const variant =
    instruction.accounts.findIndex((key) => key === TOKEN_2022_PROGRAM_ADDRESS) === -1
      ? TransactionVariant.DEPOSIT
      : TransactionVariant.DEPOSIT_V2;
  const poolAddress = instruction.accounts[3];

  for (const innerInstruction of instruction.innerInstructions) {
    const mintTo = getTokenMintToFromInnerInstruction(tokenTransfers, innerInstruction, mintDecimals);

    if (mintTo !== null) {
      activities.push({
        address: poolAddress,
        tokenAddress: mintTo.mint,
        userAddress: mintTo.toUserAccount,
        amountU64: "-" + mintTo.rawAmount,
        amount: -mintTo.tokenAmount,
        variant,
      });
      break;
    } else {
      const transfer = getTokenTransferFromInnerInstruction(tokenTransfers, innerInstruction, mintDecimals);
      if (!transfer) throw TokenTransferNotFound;

      activities.push({
        address: poolAddress,
        tokenAddress: transfer.mint,
        userAddress: transfer.fromUserAccount,
        amountU64: transfer.rawAmount,
        amount: transfer.tokenAmount,
        variant,
      });
    }
  }

  return activities;
}

export function parseWithdraw(
  instruction: Instruction,
  tokenTransfers: TokenTransfer[],
  mintDecimals: Map<string, number>,
): PoolActivity[] {
  const activities: PoolActivity[] = [];

  const variant =
    instruction.accounts.findIndex((key) => key === TOKEN_2022_PROGRAM_ADDRESS) === -1
      ? TransactionVariant.WITHDRAW
      : TransactionVariant.WITHDRAW_V2;
  const poolAddress = instruction.accounts[3];

  const tokenInstructions = instruction.innerInstructions.filter(
    (innerInstruction) =>
      innerInstruction.programId === TOKEN_2022_PROGRAM_ADDRESS || innerInstruction.programId === TOKEN_PROGRAM_ADDRESS,
  );

  for (const innerInstruction of tokenInstructions) {
    const burn = getTokenBurnFromInnerInstruction(tokenTransfers, innerInstruction, mintDecimals);
    if (burn) {
      activities.push({
        address: poolAddress,
        tokenAddress: burn.mint,
        userAddress: burn.fromUserAccount,
        amountU64: burn.rawAmount,
        amount: burn.tokenAmount,
        variant,
      });
    } else {
      const transfer = getTokenTransferFromInnerInstruction(tokenTransfers, innerInstruction, mintDecimals);
      if (!transfer) throw TokenTransferNotFound;

      activities.push({
        address: poolAddress,
        tokenAddress: transfer.mint,
        userAddress: transfer.toUserAccount,
        amountU64: "-" + transfer.rawAmount,
        amount: -transfer.tokenAmount,
        variant,
      });
    }
  }

  return activities;
}

export function parseCreate(instruction: Instruction): CreatePool {
  return {
    address: instruction.accounts[2],
    tokenAddress: instruction.accounts[1],
    tokenAddresses: Array.from(new Set(instruction.accounts.slice(6))),
    variant: TransactionVariant.CREATE,
  };
}

export function parseClose(instruction: Instruction): ClosePool {
  return {
    address: instruction.accounts[1],
    variant: TransactionVariant.CLOSE,
  };
}

export function parseSwapCpi(
  innerInstructions: InnerInstruction[],
  tokenTransfers: TokenTransfer[],
  mintDecimals: Map<string, number>,
): PoolActivity[] {
  const instruction: Instruction = {
    ...innerInstructions[0],
    innerInstructions: innerInstructions.slice(1),
  };

  return parseSwap(instruction, tokenTransfers, mintDecimals);
}

export function parseDepositCpi(
  innerInstructions: InnerInstruction[],
  tokenTransfers: TokenTransfer[],
  mintDecimals: Map<string, number>,
): PoolActivity[] {
  const instruction: Instruction = {
    ...innerInstructions[0],
    innerInstructions: innerInstructions.slice(1),
  };

  return parseDeposit(instruction, tokenTransfers, mintDecimals);
}

export function parseWithdrawCpi(
  innerInstructions: InnerInstruction[],
  tokenTransfers: TokenTransfer[],
  mintDecimals: Map<string, number>,
): PoolActivity[] {
  const instruction: Instruction = {
    ...innerInstructions[0],
    innerInstructions: innerInstructions.slice(1),
  };

  return parseWithdraw(instruction, tokenTransfers, mintDecimals);
}

export function parseCreateCpi(innerInstructions: InnerInstruction[]): CreatePool {
  const instruction: Instruction = {
    ...innerInstructions[0],
    innerInstructions: innerInstructions.slice(1),
  };

  return parseCreate(instruction);
}
