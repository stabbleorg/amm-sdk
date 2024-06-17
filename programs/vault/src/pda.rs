use crate::ID;
use anchor_lang::solana_program::pubkey::Pubkey;

pub fn get_vault_authority_address(vault_address: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"vault_authority", &vault_address.to_bytes()], &ID).0
}
