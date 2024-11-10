use crate::ID;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_lang::solana_program::pubkey::Pubkey;
use spl_token::ID as TOKEN_PROGRAM_ID;
use spl_token_2022::ID as TOKEN_2022_PROGRAM_ID;
use stabble_vault::ID as VAULT_PROGRAM_ID;

#[derive(Copy, Clone, Debug)]
pub struct WeightedSwapSwap {
    pub user: Pubkey,
    pub mint_in: Pubkey,
    pub mint_out: Pubkey,
    pub user_token_in: Pubkey,
    pub user_token_out: Pubkey,
    pub vault_token_in: Pubkey,
    pub vault_token_out: Pubkey,
    pub beneficiary_token_out: Pubkey,
    pub pool: Pubkey,
    pub withdraw_authority: Pubkey,
    pub vault: Pubkey,
    pub vault_authority: Pubkey,
}

impl From<WeightedSwapSwap> for Vec<AccountMeta> {
    fn from(accounts: WeightedSwapSwap) -> Self {
        vec![
            AccountMeta::new_readonly(ID, false),
            AccountMeta::new_readonly(accounts.user, false), // hack
            AccountMeta::new_readonly(accounts.mint_in, false),
            AccountMeta::new_readonly(accounts.mint_out, false),
            AccountMeta::new(accounts.user_token_in, false),
            AccountMeta::new(accounts.user_token_out, false),
            AccountMeta::new(accounts.vault_token_in, false),
            AccountMeta::new(accounts.vault_token_out, false),
            AccountMeta::new(accounts.beneficiary_token_out, false),
            AccountMeta::new(accounts.pool, false),
            AccountMeta::new_readonly(accounts.withdraw_authority, false),
            AccountMeta::new_readonly(accounts.vault, false),
            AccountMeta::new_readonly(accounts.vault_authority, false),
            AccountMeta::new_readonly(VAULT_PROGRAM_ID, false),
            AccountMeta::new_readonly(TOKEN_PROGRAM_ID, false),
            AccountMeta::new_readonly(TOKEN_2022_PROGRAM_ID, false),
        ]
    }
}
