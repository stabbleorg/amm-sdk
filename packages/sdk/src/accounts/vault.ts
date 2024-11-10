import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SafeAmount } from "@stabbleorg/anchor-contrib";
import { AMM_VAULT_ID } from "../programs";

export type VaultData = {
  admin: PublicKey;
  withdrawAuthority: PublicKey;
  withdrawAuthorityBump: number;
  authorityBump: number;
  isActive: boolean;
  beneficiary: PublicKey;
  beneficiaryFee: BN;
  pendingAdmin: PublicKey | null;
};

export class Vault {
  data: VaultData;

  constructor(
    readonly address: PublicKey,
    data: VaultData,
  ) {
    this.data = data;
  }

  get adminAddress(): PublicKey {
    return this.data.admin;
  }

  get authorityAddress(): PublicKey {
    return Vault.getAuthorityAddress(this.address);
  }

  get withdrawAuthorityAddress(): PublicKey {
    return this.data.withdrawAuthority;
  }

  get beneficiaryAddress(): PublicKey {
    return this.data.beneficiary;
  }

  get beneficiaryFee(): number {
    return SafeAmount.toNano(this.data.beneficiaryFee);
  }

  get isActive(): boolean {
    return this.data.isActive;
  }

  refreshData(updatedData: Partial<VaultData>) {
    this.data = { ...this.data, ...updatedData };
  }

  getAuthorityTokenAddress(mintAddress: PublicKey, programId: PublicKey = TOKEN_PROGRAM_ID): PublicKey {
    return getAssociatedTokenAddressSync(mintAddress, this.authorityAddress, true, programId);
  }

  getBeneficiaryTokenAddress(mintAddress: PublicKey, programId: PublicKey = TOKEN_PROGRAM_ID): PublicKey {
    return getAssociatedTokenAddressSync(mintAddress, this.beneficiaryAddress, true, programId);
  }

  static getAuthorityAddress(vaultAddress: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([Buffer.from("vault_authority"), vaultAddress.toBuffer()], AMM_VAULT_ID)[0];
  }
}
