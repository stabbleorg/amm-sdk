import { Program, Provider } from "@coral-xyz/anchor";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionSignature,
} from "@solana/web3.js";
import {
  DataUpdatedEvent,
  SIMULATED_SIGNATURE,
  FloatLike,
  SafeAmount,
  TransactionArgs,
  WalletContext,
  AddressWithTransactionSignature,
} from "@stabbleorg/anchor-contrib";
import { Vault, VaultData, WeightedPool, StablePool } from "../accounts";
import { type Vault as IDLType } from "../generated/vault";
import IDL from "../generated/idl/vault.json";

/**
 * @deprecated Use `AMM_VAULT_PROGRAM_ID` instead.
 */
export const AMM_VAULT_ID = new PublicKey(IDL.address);
export const AMM_VAULT_PROGRAM_ID = new PublicKey(IDL.address);
export const AMM_ERRORS = new Map(
  IDL.errors.map((error) => [error.code, error.msg]),
);

export type VaultProgram = Program<IDLType>;

export type PoolKind = "stable_swap" | "weighted_swap";

export class VaultContext<T extends Provider> extends WalletContext<T> {
  readonly program: VaultProgram;

  constructor(provider: T) {
    super(provider);
    this.program = new Program(IDL as any, provider);
  }

  async loadVault(vaultAddress: PublicKey): Promise<Vault> {
    const account = await this.program.account.vault.fetch(vaultAddress);
    return new Vault(vaultAddress, account);
  }

  async loadVaults(): Promise<Vault[]> {
    const accounts = await this.program.account.vault.all();
    return accounts.map((data) => new Vault(data.publicKey, data.account));
  }

  async initialize({
    keypair = Keypair.generate(),
    beneficiaryAddress,
    beneficiaryFee,
    kind,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{
    keypair?: Keypair;
    beneficiaryAddress: PublicKey;
    beneficiaryFee: FloatLike;
    kind: PoolKind;
  }>): Promise<AddressWithTransactionSignature> {
    let withdrawAuthorityAddress: PublicKey;
    let withdrawAuthorityBump: number;

    switch (kind) {
      case "stable_swap":
        [withdrawAuthorityAddress, withdrawAuthorityBump] =
          StablePool.getWithdrawAuthorityAddressAndBump(keypair.publicKey);
        break;
      case "weighted_swap":
      default:
        [withdrawAuthorityAddress, withdrawAuthorityBump] =
          WeightedPool.getWithdrawAuthorityAddressAndBump(keypair.publicKey);
        break;
    }

    const instructions: TransactionInstruction[] = [
      SystemProgram.createAccount({
        fromPubkey: this.walletAddress,
        newAccountPubkey: keypair.publicKey,
        space: this.program.account.vault.size,
        lamports:
          await this.provider.connection.getMinimumBalanceForRentExemption(
            this.program.account.vault.size,
          ),
        programId: this.program.programId,
      }),
      await this.program.methods
        .initialize(
          withdrawAuthorityAddress,
          withdrawAuthorityBump,
          beneficiaryAddress,
          SafeAmount.toGiga(beneficiaryFee),
        )
        .accountsStrict({
          admin: this.walletAddress,
          vault: keypair.publicKey,
          vaultAuthority: Vault.getAuthorityAddress(keypair.publicKey),
        })
        .instruction(),
    ];

    const signature = await this.sendSmartTransaction(
      instructions,
      [keypair],
      altAccounts,
      priorityLevel,
      maxPriorityMicroLamports,
      simulate,
    );

    return { address: keypair.publicKey, signature };
  }

  async buildCreateMissingTokenAccountsInstructions({
    vault,
    mintAddresses,
  }: {
    vault: Vault;
    mintAddresses: PublicKey[];
  }): Promise<TransactionInstruction[]> {
    const instructions: TransactionInstruction[] = [];
    for (const mintAddress of mintAddresses) {
      const account =
        await this.provider.connection.getAccountInfo(mintAddress);
      if (!account) throw Error("Invalid mint address");
      const tokenProgramId = account.owner;

      const { instruction: createVaultTokenInstruction } =
        await this.getOrCreateAssociatedTokenAddressInstruction(
          mintAddress,
          vault.authorityAddress,
          tokenProgramId,
        );
      if (createVaultTokenInstruction)
        instructions.push(createVaultTokenInstruction);

      const { instruction: createBeneficiaryTokenInstruction } =
        await this.getOrCreateAssociatedTokenAddressInstruction(
          mintAddress,
          vault.beneficiaryAddress,
          tokenProgramId,
        );
      if (createBeneficiaryTokenInstruction)
        instructions.push(createBeneficiaryTokenInstruction);
    }

    return instructions;
  }

  async createMissingTokenAccounts({
    vault,
    mintAddresses,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{
    vault: Vault;
    mintAddresses: PublicKey[];
  }>): Promise<TransactionSignature | null> {
    const instructions = await this.buildCreateMissingTokenAccountsInstructions(
      {
        vault,
        mintAddresses,
      },
    );

    if (!instructions.length) return null;

    return this.sendSmartTransaction(
      instructions,
      [],
      altAccounts,
      priorityLevel,
      maxPriorityMicroLamports,
      simulate,
    );
  }

  async changeBeneficiary({
    vault,
    beneficiaryAddress,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{
    vault: Vault;
    beneficiaryAddress: PublicKey;
  }>): Promise<TransactionSignature> {
    const instruction = await this.program.methods
      .changeBeneficiary(beneficiaryAddress)
      .accountsStrict({
        admin: this.walletAddress,
        vault: vault.address,
      })
      .instruction();

    return this.sendSmartTransaction(
      [instruction],
      [],
      altAccounts,
      priorityLevel,
      maxPriorityMicroLamports,
      simulate,
    );
  }

  async transferAdmin({
    vault,
    adminAddress,
    altAccounts,
    priorityLevel,
    maxPriorityMicroLamports,
    simulate,
  }: TransactionArgs<{
    vault: Vault;
    adminAddress: PublicKey;
  }>): Promise<TransactionSignature> {
    const instruction = await this.program.methods
      .transferAdmin(adminAddress)
      .accountsStrict({
        admin: this.walletAddress,
        vault: vault.address,
      })
      .instruction();

    return this.sendSmartTransaction(
      [instruction],
      [],
      altAccounts,
      priorityLevel,
      maxPriorityMicroLamports,
      simulate,
    );
  }
}

export class VaultListener {
  private _listener?: number;

  constructor(readonly program: VaultProgram) {}

  addVaultListener(
    callback: (event: DataUpdatedEvent<Partial<VaultData>>) => void,
  ) {
    this.removeVaultListener();
    this._listener = this.program.addEventListener(
      "vaultUpdatedEvent",
      (
        event: DataUpdatedEvent<Partial<VaultData>>,
        _slot: number,
        signature: TransactionSignature,
      ) => {
        if (signature !== SIMULATED_SIGNATURE) {
          callback(event);
        }
      },
    );
  }

  removeVaultListener() {
    if (this._listener !== undefined) {
      this.program.removeEventListener(this._listener);
      delete this._listener;
    }
  }
}
