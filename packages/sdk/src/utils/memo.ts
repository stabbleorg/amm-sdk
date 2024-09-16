import { PublicKey } from "@solana/web3.js";
import { TransactionInstruction } from "@solana/web3.js";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function createMemoInstruction(data: string): TransactionInstruction {
  return new TransactionInstruction({
    keys: [],
    data: Buffer.from(data, "utf-8"),
    programId: MEMO_PROGRAM_ID,
  });
}
