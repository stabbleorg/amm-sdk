use anchor_lang::{
    error::ErrorCode::{AccountDidNotDeserialize, AccountDiscriminatorMismatch, AccountDiscriminatorNotFound},
    solana_program::pubkey::Pubkey,
};
#[derive(Debug, Clone)]
pub struct Vault {
    // pub admin: Pubkey,
    // pub withdraw_authority: Pubkey,
    // pub withdraw_authority_bump: u8,
    // pub authority_bump: u8,
    pub is_active: bool,
    pub beneficiary: Pubkey,
    // pub beneficiary_fee: u64,
    // pub pending_admin: Option<Pubkey>,
}

impl Vault {
    pub const DISCRIMINATOR: [u8; 8] = [211, 8, 232, 43, 2, 152, 117, 119];

    pub fn try_deserialize(data: &[u8]) -> anchor_lang::Result<Self> {
        let mut offset = 0;

        // Check discriminator
        if data.len() < 8 {
            return Err(AccountDiscriminatorNotFound.into());
        }
        let discriminator = &data[offset..offset + 8];
        if discriminator != Self::DISCRIMINATOR {
            return Err(AccountDiscriminatorMismatch.into());
        }
        offset += 74;

        let is_active = data[offset] != 0;
        offset += 1;

        let beneficiary = Pubkey::new_from_array(
            data[offset..offset + 32]
                .try_into()
                .map_err(|_| AccountDidNotDeserialize)?,
        );

        Ok(Self { is_active, beneficiary })
    }
}
