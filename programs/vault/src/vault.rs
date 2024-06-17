use anchor_lang::prelude::*;

#[account]
pub struct Vault {
    pub admin: Pubkey,
    pub withdraw_authority: Pubkey,  // immutable
    pub withdraw_authority_bump: u8, // immutable
    pub authority_bump: u8,          // immutable
    pub is_active: bool,
    pub beneficiary: Pubkey,
    pub beneficiary_fee: u64,
    pub pending_admin: Option<Pubkey>,
}
