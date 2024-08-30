use crate::ID;
use anchor_lang::solana_program::pubkey::Pubkey;

pub fn get_withdraw_authority_address(vault_address: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"withdraw_authority", &vault_address.to_bytes()], &ID).0
}

pub fn get_pool_authority_address(pool_address: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"pool_authority", &pool_address.to_bytes()], &ID).0
}
