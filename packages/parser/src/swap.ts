import bs58 from "bs58";
import { BorshInstructionCoder, Instruction } from "@coral-xyz/anchor";
import {
  DecodedTransferCheckedInstruction,
  DecodedTransferInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  decodeBurnInstruction,
  decodeMintToInstruction,
  decodeTransferCheckedInstruction,
  decodeTransferInstruction,
  getMultipleAccounts,
  unpackAccount,
} from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  CompiledInstruction,
  Connection,
  PublicKey,
  TransactionSignature,
} from "@solana/web3.js";
import { WeightedSwapProgram, StableSwapProgram, AMM_VAULT_ID } from "@stabbleorg/amm-sdk";
import { ParseInstructionArgs } from "@stabbleorg/anchor-contrib";

export type InitializedPool = {
  address: string;
  mintAddress: string;
  mintAddresses: string[];
};

export type TerminatedPool = {
  address: string;
};

export type ChangedTokenAmount = {
  mintAddress: string;
  amount: bigint;
};

export type ChangedBalance = {
  poolAddress: string;
  userAddress: string;
  amounts: ChangedTokenAmount[];
  beneficiaryAddress?: string;
  beneficiaryAmount?: bigint;
  referrer?: string;
};

export type InstructionMeta = { meta: Instruction };
export type ParsedResultWithMeta<T> = InstructionMeta & T;
export type ParsedResult =
  | InstructionMeta
  | ParsedResultWithMeta<InitializedPool>
  | ParsedResultWithMeta<TerminatedPool>
  | ParsedResultWithMeta<ChangedBalance>;

export class SwapParser {
  constructor(readonly program: WeightedSwapProgram | StableSwapProgram) {}

  get connection(): Connection {
    return this.program.provider.connection;
  }

  get coder(): BorshInstructionCoder {
    return new BorshInstructionCoder(this.program.idl);
  }

  async parse(signature: TransactionSignature): Promise<ParsedResult[]> {
    const data = await this.connection.getTransaction(signature, { maxSupportedTransactionVersion: 0 });

    if (!data) throw Error("Transaction not found");
    if (data.meta?.err) throw data.meta.err;

    const result: ParsedResult[] = [];

    const atlKeys = data.transaction.message.addressTableLookups.map((atl) => atl.accountKey);
    const atlAccounts = await this.connection.getMultipleAccountsInfo(atlKeys);
    const altAccounts = atlAccounts
      .filter((info) => info !== null)
      .map(
        (info, index) =>
          new AddressLookupTableAccount({
            state: AddressLookupTableAccount.deserialize(info!.data),
            key: atlKeys[index],
          }),
      );

    const accountKeys = data.transaction.message.getAccountKeys({ addressLookupTableAccounts: altAccounts });

    let referrer;
    const memo = data.transaction.message.compiledInstructions.find(
      (ix) =>
        ix.accountKeyIndexes.length === 0 &&
        accountKeys.get(ix.programIdIndex)?.toBase58() === "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",
    );
    if (memo) {
      referrer = Buffer.from(memo.data).toString("utf-8");
    }

    let i = 0;
    for (const compiledInstruction of data.transaction.message.compiledInstructions) {
      const keyIndexes = compiledInstruction.accountKeyIndexes;
      const instructions = data.meta?.innerInstructions?.find(({ index }) => index === i)?.instructions;

      if (accountKeys.get(compiledInstruction.programIdIndex)?.equals(this.program.programId)) {
        const instructionMeta = this.coder.decode(Buffer.from(compiledInstruction.data));
        if (instructionMeta) {
          switch (instructionMeta.name) {
            case "initialize":
              result.push({
                meta: instructionMeta,
                ...this.parseInitializeInstruction({ accountKeys, keyIndexes }),
              });
              break;
            case "shutdown":
              result.push({
                meta: instructionMeta,
                address: accountKeys.get(keyIndexes[1])!.toBase58(),
              });
              break;
            case "deposit":
              result.push({
                meta: instructionMeta,
                ...(await this.parseDepositInstruction({ accountKeys, keyIndexes, instructions })),
                referrer,
              });
              break;
            case "withdraw":
              result.push({
                meta: instructionMeta,
                ...(await this.parseWithdrawInstruction({ accountKeys, keyIndexes, instructions })),
              });
              break;
            case "swap":
              result.push({
                meta: instructionMeta,
                ...(await this.parseSwapInstruction({ accountKeys, keyIndexes, instructions })),
                referrer,
              });
              break;
            case "swapV2":
              result.push({
                meta: instructionMeta,
                ...(await this.parseSwapV2Instruction({ accountKeys, keyIndexes, instructions })),
                referrer,
              });
              break;
            default:
              result.push({
                meta: instructionMeta,
              });
              break;
          }
        }
      } else if (instructions) {
        const cpiSwapInstructions: CompiledInstruction[][] = [];

        let j = 0;
        while (j < instructions.length) {
          const instruction = instructions[j];
          if (accountKeys.get(instruction.programIdIndex)?.equals(this.program.programId)) {
            const transferA = instructions[j + 1];
            const transferAId = accountKeys.get(transferA?.programIdIndex);
            if (
              transferA &&
              transferAId &&
              (transferAId.equals(TOKEN_PROGRAM_ID) || transferAId.equals(TOKEN_2022_PROGRAM_ID))
            ) {
              const withdrawVault = instructions[j + 2];
              if (withdrawVault && accountKeys.get(withdrawVault.programIdIndex)?.equals(AMM_VAULT_ID)) {
                const transferB = instructions[j + 3];
                const transferBId = accountKeys.get(transferB.programIdIndex);
                if (
                  transferB &&
                  transferBId &&
                  (transferBId.equals(TOKEN_PROGRAM_ID) || transferBId.equals(TOKEN_2022_PROGRAM_ID))
                ) {
                  const transferC = instructions[j + 4];
                  const transferCId = accountKeys.get(transferC.programIdIndex);
                  if (
                    transferC &&
                    transferCId &&
                    (transferCId.equals(TOKEN_PROGRAM_ID) || transferCId.equals(TOKEN_2022_PROGRAM_ID))
                  ) {
                    cpiSwapInstructions.push([instruction, transferA, withdrawVault, transferB, transferC]);
                    j += 4;
                  } else {
                    cpiSwapInstructions.push([instruction, transferA, withdrawVault, transferB]);
                    j += 3;
                  }
                }
              }
            }
          }
          j++;
        }

        for (const instructions of cpiSwapInstructions) {
          const anchorMeta = this.coder.decode(Buffer.from(bs58.decode(instructions[0].data)));
          if (anchorMeta && anchorMeta.name.startsWith("swap")) {
            result.push({
              meta: anchorMeta,
              ...(anchorMeta.name === "swapV2"
                ? await this.parseSwapV2Instruction({
                    accountKeys,
                    keyIndexes: instructions[0].accounts,
                    instructions: instructions.slice(1),
                  })
                : await this.parseSwapInstruction({
                    accountKeys,
                    keyIndexes: instructions[0].accounts,
                    instructions: instructions.slice(1),
                  })),
              referrer,
            });
          }
        }
      }

      i++;
    }

    return result;
  }

  parseInitializeInstruction({ accountKeys, keyIndexes }: ParseInstructionArgs): InitializedPool {
    return {
      address: accountKeys.get(keyIndexes[2])!.toBase58(),
      mintAddress: accountKeys.get(keyIndexes[1])!.toBase58(),
      mintAddresses: keyIndexes.slice(6).map((keyIndex) => accountKeys.get(keyIndex)!.toBase58()),
    };
  }

  async parseDepositInstruction({
    accountKeys,
    keyIndexes,
    instructions = [],
  }: ParseInstructionArgs): Promise<ChangedBalance> {
    const token22PgAccount = accountKeys.get(keyIndexes[8]);
    const isV2 = token22PgAccount && token22PgAccount.equals(TOKEN_2022_PROGRAM_ID);

    const transferInstructions = instructions.slice(0, instructions.length - 1);
    const depositAmounts: ChangedTokenAmount[] = [];

    if (isV2) {
      const transfers = transferInstructions.map((transferInstruction) =>
        decodeTransferCheckedInstruction(
          {
            programId: accountKeys.get(transferInstruction.programIdIndex)!,
            keys: transferInstruction.accounts.map((index) => ({
              pubkey: accountKeys.get(index)!,
              isSigner: false,
              isWritable: true,
            })),
            data: Buffer.from(bs58.decode(transferInstruction.data)),
          },
          accountKeys.get(transferInstruction.programIdIndex)!,
        ),
      );
      depositAmounts.push(
        ...transfers.map((transfer, index) => ({
          mintAddress: transfer.keys.mint.pubkey.toBase58(),
          amount: transfer.data.amount,
        })),
      );
    } else {
      const transfers = transferInstructions.map((transferInstruction) =>
        decodeTransferInstruction({
          programId: accountKeys.get(transferInstruction.programIdIndex)!,
          keys: transferInstruction.accounts.map((index) => ({
            pubkey: accountKeys.get(index)!,
            isSigner: false,
            isWritable: true,
          })),
          data: Buffer.from(bs58.decode(transferInstruction.data)),
        }),
      );
      const tokenAccounts = await getMultipleAccounts(
        this.connection,
        transfers.map((transfer) => transfer.keys.source.pubkey),
      );
      depositAmounts.push(
        ...transfers.map((transfer, index) => ({
          mintAddress: tokenAccounts[index].mint.toBase58(),
          amount: transfer.data.amount,
        })),
      );
    }

    const mintToInstruction = instructions[instructions.length - 1];
    const mintTo = decodeMintToInstruction({
      programId: accountKeys.get(mintToInstruction.programIdIndex)!,
      keys: mintToInstruction.accounts.map((index) => ({
        pubkey: accountKeys.get(index)!,
        isSigner: false,
        isWritable: true,
      })),
      data: Buffer.from(bs58.decode(mintToInstruction.data)),
    });

    return {
      poolAddress: accountKeys.get(keyIndexes[3])!.toBase58(),
      userAddress: accountKeys.get(keyIndexes[0])!.toBase58(),
      amounts: [
        ...depositAmounts,
        {
          mintAddress: mintTo.keys.mint.pubkey.toBase58(),
          amount: -mintTo.data.amount,
        },
      ],
    };
  }

  async parseWithdrawInstruction({
    accountKeys,
    keyIndexes,
    instructions = [],
  }: ParseInstructionArgs): Promise<ChangedBalance> {
    const token22PgAccount = accountKeys.get(keyIndexes[9]);
    const isV2 = token22PgAccount && token22PgAccount.equals(TOKEN_2022_PROGRAM_ID);

    const transferInstructions = instructions.slice(0, instructions.length - 1).filter((_, index) => index % 2 === 1);
    const withdrawAmounts: ChangedTokenAmount[] = [];

    if (isV2) {
      const transfers = transferInstructions.map((transferInstruction) =>
        decodeTransferCheckedInstruction(
          {
            programId: accountKeys.get(transferInstruction.programIdIndex)!,
            keys: transferInstruction.accounts.map((index) => ({
              pubkey: accountKeys.get(index)!,
              isSigner: false,
              isWritable: true,
            })),
            data: Buffer.from(bs58.decode(transferInstruction.data)),
          },
          accountKeys.get(transferInstruction.programIdIndex)!,
        ),
      );
      withdrawAmounts.push(
        ...transfers.map((transfer) => ({
          mintAddress: transfer.keys.mint.pubkey.toBase58(),
          amount: -transfer.data.amount,
        })),
      );
    } else {
      const transfers = transferInstructions.map((transferInstruction) =>
        decodeTransferInstruction({
          programId: accountKeys.get(transferInstruction.programIdIndex)!,
          keys: transferInstruction.accounts.map((index) => ({
            pubkey: accountKeys.get(index)!,
            isSigner: false,
            isWritable: true,
          })),
          data: Buffer.from(bs58.decode(transferInstruction.data)),
        }),
      );
      const tokenAccounts = await getMultipleAccounts(
        this.connection,
        transfers.map((transfer) => transfer.keys.source.pubkey),
      );
      withdrawAmounts.push(
        ...transfers.map((transfer, index) => ({
          mintAddress: tokenAccounts[index].mint.toBase58(),
          amount: -transfer.data.amount,
        })),
      );
    }

    const burnInstruction = instructions[instructions.length - 1];
    const burn = decodeBurnInstruction({
      programId: accountKeys.get(burnInstruction.programIdIndex)!,
      keys: burnInstruction.accounts.map((index) => ({
        pubkey: accountKeys.get(index)!,
        isSigner: false,
        isWritable: true,
      })),
      data: Buffer.from(bs58.decode(burnInstruction.data)),
    });

    return {
      poolAddress: accountKeys.get(keyIndexes[3])!.toBase58(),
      userAddress: accountKeys.get(keyIndexes[0])!.toBase58(),
      amounts: [
        ...withdrawAmounts,
        {
          mintAddress: burn.keys.mint.pubkey.toBase58(),
          amount: burn.data.amount,
        },
      ],
    };
  }

  async parseSwapInstruction({
    accountKeys,
    keyIndexes,
    instructions = [],
  }: ParseInstructionArgs): Promise<ChangedBalance> {
    const hasFee = instructions.length === 4;
    const transferAInstruction = instructions[0];
    const transferBInstruction = hasFee ? instructions[3] : instructions[2];
    const transferCInstruction = hasFee ? instructions[2] : null;

    const transferA = decodeTransferInstruction({
      programId: accountKeys.get(transferAInstruction.programIdIndex)!,
      keys: transferAInstruction.accounts.map((index) => ({
        pubkey: accountKeys.get(index)!,
        isSigner: false,
        isWritable: true,
      })),
      data: Buffer.from(bs58.decode(transferAInstruction.data)),
    });
    const accountAddresses: PublicKey[] = [transferA.keys.destination.pubkey];
    const transferB = decodeTransferInstruction({
      programId: accountKeys.get(transferBInstruction.programIdIndex)!,
      keys: transferBInstruction.accounts.map((index) => ({
        pubkey: accountKeys.get(index)!,
        isSigner: false,
        isWritable: true,
      })),
      data: Buffer.from(bs58.decode(transferBInstruction.data)),
    });
    let transferC: DecodedTransferInstruction | null = null;
    if (transferCInstruction) {
      transferC = decodeTransferInstruction({
        programId: accountKeys.get(transferCInstruction.programIdIndex)!,
        keys: transferCInstruction.accounts.map((index) => ({
          pubkey: accountKeys.get(index)!,
          isSigner: false,
          isWritable: true,
        })),
        data: Buffer.from(bs58.decode(transferCInstruction.data)),
      });
      accountAddresses.push(transferC.keys.destination.pubkey);
    } else {
      accountAddresses.push(transferB.keys.source.pubkey);
    }
    const tokenAccounts = await getMultipleAccounts(this.connection, accountAddresses);

    let beneficiaryAddress;
    let beneficiaryAmount;
    if (transferC) {
      beneficiaryAddress = tokenAccounts[1].owner.toBase58();
      beneficiaryAmount = -transferC.data.amount;
    }

    return {
      poolAddress: accountKeys.get(keyIndexes[6])!.toBase58(),
      userAddress: accountKeys.get(keyIndexes[0])!.toBase58(),
      amounts: [
        { mintAddress: tokenAccounts[0].mint.toBase58(), amount: transferA.data.amount },
        { mintAddress: tokenAccounts[1].mint.toBase58(), amount: -transferB.data.amount },
      ],
      beneficiaryAddress,
      beneficiaryAmount,
    };
  }

  async parseSwapV2Instruction({
    accountKeys,
    keyIndexes,
    instructions = [],
  }: ParseInstructionArgs): Promise<ChangedBalance> {
    const hasFee = instructions.length === 4;
    const transferAInstruction = instructions[0];
    const transferBInstruction = hasFee ? instructions[3] : instructions[2];
    const transferCInstruction = hasFee ? instructions[2] : null;

    const transferA = decodeTransferCheckedInstruction(
      {
        programId: accountKeys.get(transferAInstruction.programIdIndex)!,
        keys: transferAInstruction.accounts.map((index) => ({
          pubkey: accountKeys.get(index)!,
          isSigner: false,
          isWritable: true,
        })),
        data: Buffer.from(bs58.decode(transferAInstruction.data)),
      },
      accountKeys.get(transferAInstruction.programIdIndex)!,
    );
    const accountAddresses: PublicKey[] = [transferA.keys.destination.pubkey];
    const transferB = decodeTransferCheckedInstruction(
      {
        programId: accountKeys.get(transferBInstruction.programIdIndex)!,
        keys: transferBInstruction.accounts.map((index) => ({
          pubkey: accountKeys.get(index)!,
          isSigner: false,
          isWritable: true,
        })),
        data: Buffer.from(bs58.decode(transferBInstruction.data)),
      },
      accountKeys.get(transferBInstruction.programIdIndex)!,
    );
    let transferC: DecodedTransferCheckedInstruction | null = null;
    if (transferCInstruction) {
      transferC = decodeTransferCheckedInstruction(
        {
          programId: accountKeys.get(transferCInstruction.programIdIndex)!,
          keys: transferCInstruction.accounts.map((index) => ({
            pubkey: accountKeys.get(index)!,
            isSigner: false,
            isWritable: true,
          })),
          data: Buffer.from(bs58.decode(transferCInstruction.data)),
        },
        accountKeys.get(transferCInstruction.programIdIndex)!,
      );
      accountAddresses.push(transferC.keys.destination.pubkey);
    } else {
      accountAddresses.push(transferB.keys.source.pubkey);
    }

    const infos = await this.connection.getMultipleAccountsInfo(accountAddresses);
    const tokenAccounts = accountAddresses.map((address, i) => unpackAccount(address, infos[i], infos[i]?.owner));

    let beneficiaryAddress;
    let beneficiaryAmount;
    if (transferC) {
      beneficiaryAddress = tokenAccounts[1].owner.toBase58();
      beneficiaryAmount = -transferC.data.amount;
    }

    return {
      poolAddress: accountKeys.get(keyIndexes[8])!.toBase58(),
      userAddress: accountKeys.get(keyIndexes[0])!.toBase58(),
      amounts: [
        { mintAddress: tokenAccounts[0].mint.toBase58(), amount: transferA.data.amount },
        { mintAddress: tokenAccounts[1].mint.toBase58(), amount: -transferB.data.amount },
      ],
      beneficiaryAddress,
      beneficiaryAmount,
    };
  }
}
