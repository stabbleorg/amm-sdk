use anchor_lang::{
    error::ErrorCode::{AccountDidNotDeserialize, AccountDiscriminatorMismatch, AccountDiscriminatorNotFound},
    solana_program::pubkey::Pubkey,
};
use bn::safe_math::CheckedMulDiv;
use math::{
    fixed_math::{FixedComplement, FixedMul},
    stable_math, swap_fee_math,
};

#[derive(Debug, Clone)]
pub struct PoolToken {
    pub mint: Pubkey,        // immutable
    pub decimals: u8,        // immutable
    pub scaling_up: bool,    // immutable
    pub scaling_factor: u64, // immutable
    pub balance: u64,
}

#[derive(Debug, Clone)]
pub struct Pool {
    // pub owner: Pubkey,
    pub vault: Pubkey,
    // pub mint: Pubkey,
    // pub authority_bump: u8,
    pub is_active: bool,
    pub amp_initial_factor: u16,
    pub amp_target_factor: u16,
    pub ramp_start_ts: i64,
    pub ramp_stop_ts: i64,
    pub swap_fee: u64,
    pub tokens: Vec<PoolToken>,
    // pub pending_owner: Option<Pubkey>,
    // pub max_supply: u64,
}

impl Pool {
    pub const DISCRIMINATOR: [u8; 8] = [241, 154, 109, 4, 17, 177, 109, 188];

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
        offset += 40;

        let vault = Pubkey::new_from_array(
            data[offset..offset + 32]
                .try_into()
                .map_err(|_| AccountDidNotDeserialize)?,
        );
        offset += 65;

        let is_active = data[offset] != 0;
        offset += 1;

        let amp_initial_factor = u16::from_le_bytes(
            data[offset..offset + 2]
                .try_into()
                .map_err(|_| AccountDidNotDeserialize)?,
        );
        offset += 2;

        let amp_target_factor = u16::from_le_bytes(
            data[offset..offset + 2]
                .try_into()
                .map_err(|_| AccountDidNotDeserialize)?,
        );
        offset += 2;

        let ramp_start_ts = i64::from_le_bytes(
            data[offset..offset + 8]
                .try_into()
                .map_err(|_| AccountDidNotDeserialize)?,
        );
        offset += 8;

        let ramp_stop_ts = i64::from_le_bytes(
            data[offset..offset + 8]
                .try_into()
                .map_err(|_| AccountDidNotDeserialize)?,
        );
        offset += 8;

        let swap_fee = u64::from_le_bytes(
            data[offset..offset + 8]
                .try_into()
                .map_err(|_| AccountDidNotDeserialize)?,
        );
        offset += 8;

        // Deserialize tokens
        let token_count = u32::from_le_bytes(
            data[offset..offset + 4]
                .try_into()
                .map_err(|_| AccountDidNotDeserialize)?,
        );
        offset += 4;

        let mut tokens = Vec::with_capacity(token_count as usize);
        for _ in 0..token_count {
            let mint = Pubkey::new_from_array(
                data[offset..offset + 32]
                    .try_into()
                    .map_err(|_| AccountDidNotDeserialize)?,
            );
            offset += 32;

            let decimals = data[offset];
            offset += 1;

            let scaling_up = data[offset] != 0;
            offset += 1;

            let scaling_factor = u64::from_le_bytes(
                data[offset..offset + 8]
                    .try_into()
                    .map_err(|_| AccountDidNotDeserialize)?,
            );
            offset += 8;

            let balance = u64::from_le_bytes(
                data[offset..offset + 8]
                    .try_into()
                    .map_err(|_| AccountDidNotDeserialize)?,
            );
            offset += 8;

            tokens.push(PoolToken {
                mint,
                decimals,
                scaling_up,
                scaling_factor,
                balance,
            });
        }

        Ok(Self {
            vault,
            is_active,
            amp_initial_factor,
            amp_target_factor,
            ramp_start_ts,
            ramp_stop_ts,
            swap_fee,
            tokens,
        })
    }

    pub fn get_amplification(&self, current_ts: i64) -> Option<u64> {
        let amp_initial_factor = self.amp_initial_factor as u64;
        let amp_target_factor = self.amp_target_factor as u64;

        let amp = if current_ts <= self.ramp_start_ts {
            amp_initial_factor.saturating_mul(stable_math::AMP_PRECISION)
        } else if current_ts >= self.ramp_stop_ts {
            amp_target_factor.saturating_mul(stable_math::AMP_PRECISION)
        } else {
            let ramp_elapsed = (current_ts.saturating_sub(self.ramp_start_ts) as u64)
                .checked_div(60)?
                .checked_mul(60)?;
            let ramp_duration = self.ramp_stop_ts.saturating_sub(self.ramp_start_ts) as u64;
            if amp_initial_factor <= amp_target_factor {
                let amp_offset = (amp_target_factor.saturating_sub(amp_initial_factor))
                    .saturating_mul(stable_math::AMP_PRECISION)
                    .checked_mul_div_down(ramp_elapsed, ramp_duration)?;
                amp_initial_factor
                    .saturating_mul(stable_math::AMP_PRECISION)
                    .saturating_add(amp_offset)
            } else {
                let amp_offset = (amp_initial_factor.saturating_sub(amp_target_factor))
                    .saturating_mul(stable_math::AMP_PRECISION)
                    .checked_mul_div_down(ramp_elapsed, ramp_duration)?;
                amp_initial_factor
                    .saturating_mul(stable_math::AMP_PRECISION)
                    .saturating_sub(amp_offset)
            }
        };

        Some(amp)
    }

    pub fn get_balances(&self) -> Vec<u64> {
        self.tokens.iter().map(|token| token.balance).collect()
    }

    pub fn get_token_index(&self, mint: Pubkey) -> Option<usize> {
        self.tokens.iter().position(|token| token.mint == mint)
    }

    /// scaling up/down from token amount to wrapped balance amount
    pub fn calc_wrapped_amount(&self, amount: u64, token_index: usize) -> Option<u64> {
        let pool_token = self.tokens.get(token_index)?;
        if pool_token.scaling_factor == 1 {
            Some(amount)
        } else if pool_token.scaling_up {
            amount.checked_mul(pool_token.scaling_factor)
        } else {
            amount.checked_div(pool_token.scaling_factor)
        }
    }

    /// scaling up/down from wrapped balance amount to token amount
    pub fn calc_unwrapped_amount(&self, amount: u64, token_index: usize) -> Option<u64> {
        let pool_token = self.tokens.get(token_index)?;
        if pool_token.scaling_factor == 1 {
            Some(amount)
        } else if pool_token.scaling_up {
            amount.checked_div(pool_token.scaling_factor)
        } else {
            amount.checked_mul(pool_token.scaling_factor)
        }
    }

    /// round down token amount not to send the lost amount from wrapped balance amount when it scaled down
    pub fn calc_rounded_amount(&self, amount: u64, token_index: usize) -> Option<u64> {
        let pool_token = self.tokens.get(token_index)?;
        if pool_token.scaling_up {
            Some(amount)
        } else {
            amount
                .checked_div(pool_token.scaling_factor)?
                .checked_mul(pool_token.scaling_factor)
        }
    }

    /// estimated swap amount out
    pub fn get_swap_result(
        &self,
        current_ts: i64,
        token_in_index: usize,
        token_out_index: usize,
        amount_in: u64,
        x_amount: u64,
    ) -> Option<(u64, u64)> {
        let amplification = self.get_amplification(current_ts)?;
        let balances = self.get_balances();
        let current_invariant = stable_math::calc_invariant(amplification, &balances)?;
        let swap_fee = swap_fee_math::calc_swap_fee_in_discount(self.swap_fee, x_amount)?;

        let wrapped_amount_in = self.calc_wrapped_amount(amount_in, token_in_index)?;
        let wrapped_amount_out_without_fee = stable_math::calc_out_given_in(
            amplification,
            &balances,
            token_in_index,
            token_out_index,
            wrapped_amount_in,
            current_invariant,
        )?;

        let wrapped_amount_out = wrapped_amount_out_without_fee.mul_down(swap_fee.complement())?;
        let wrapped_amount_fee = wrapped_amount_out_without_fee.checked_sub(wrapped_amount_out)?;
        let amount_out = self.calc_unwrapped_amount(wrapped_amount_out, token_out_index)?;
        let amount_fee = self.calc_unwrapped_amount(wrapped_amount_fee, token_out_index)?;

        Some((amount_out, amount_fee))
    }
}
